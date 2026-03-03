from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models import EvaluationResult
from app.ollama_client import extract_requirements, evaluate_submission
from app.dependencies import verify_internal, get_current_user

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


class EvaluateRequest(BaseModel):
    submission_id: int
    contest_id: int
    tz_text: str
    submission_text: str


class EvaluationOut(BaseModel):
    submission_id: int
    contest_id: int
    compliance_score: int
    passed_requirements: list[str]
    failed_requirements: list[str]
    critical_issues: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/evaluate", response_model=EvaluationOut, dependencies=[Depends(verify_internal)])
async def evaluate(data: EvaluateRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(EvaluationResult).where(EvaluationResult.submission_id == data.submission_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Evaluation already exists")

    requirements = await extract_requirements(data.tz_text)
    result_data = await evaluate_submission(requirements, data.submission_text)

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
