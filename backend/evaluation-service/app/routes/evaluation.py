from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, verify_internal
from app.models import EvaluationResult
from app.ollama_client import evaluate_submission

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


class ImageMeta(BaseModel):
    filename: str
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None


class EvaluateRequest(BaseModel):
    submission_id: int
    contest_id: int
    tz_text: str
    submission_text: str
    images: list[str] = []
    image_meta: list[ImageMeta] = []


class EvaluationOut(BaseModel):
    submission_id: int
    contest_id: int
    compliance_score: int
    passed_requirements: list[str]
    failed_requirements: list[str]
    critical_issues: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post(
    "/evaluate", response_model=EvaluationOut, dependencies=[Depends(verify_internal)]
)
async def evaluate(data: EvaluateRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(EvaluationResult).where(
            EvaluationResult.submission_id == data.submission_id
        )
    )
    record = existing.scalar_one_or_none()

    result_data = await evaluate_submission(
        data.tz_text,
        data.submission_text,
        images=data.images if data.images else None,
        image_meta=[m.model_dump() for m in data.image_meta]
        if data.image_meta
        else None,
    )

    if record:
        record.compliance_score = result_data.get("compliance_score", 0)
        record.passed_requirements = result_data.get("passed_requirements", [])
        record.failed_requirements = result_data.get("failed_requirements", [])
        record.critical_issues = result_data.get("critical_issues", False)
        record.raw_llm_response = str(result_data)
    else:
        record = EvaluationResult(
            submission_id=data.submission_id,
            contest_id=data.contest_id,
            compliance_score=result_data.get("compliance_score", 0),
            passed_requirements=result_data.get("passed_requirements", []),
            failed_requirements=result_data.get("failed_requirements", []),
            critical_issues=result_data.get("critical_issues", False),
            raw_llm_response=str(result_data),
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.patch(
                f"{settings.contest_service_url}/submissions/{data.submission_id}/ai-score",
                params={
                    "score": record.compliance_score,
                    "critical_issues": str(record.critical_issues).lower(),
                },
                headers={"x-internal-secret": settings.internal_secret},
            )
    except Exception:
        pass

    return record


@router.get("/{submission_id}", response_model=EvaluationOut)
async def get_evaluation(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(EvaluationResult).where(EvaluationResult.submission_id == submission_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return record
