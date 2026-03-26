import hashlib
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, verify_internal
from app.models import ContestRequirements, EvaluationResult
from app.ollama_client import evaluate_submission, extract_tz_requirements

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


class RequirementResult(BaseModel):
    text: str
    score: int
    comment: str
    is_critical: bool


class EvaluationOut(BaseModel):
    submission_id: int
    contest_id: int
    compliance_score: int
    passed_requirements: list[str]
    failed_requirements: list[str]
    requirements_detail: list[RequirementResult] = []
    critical_issues: bool
    created_at: datetime

    model_config = {"from_attributes": True}


async def _get_cached_requirements(
    contest_id: int, tz_text: str, db: AsyncSession
) -> list[dict] | None:
    tz_hash = hashlib.sha256(tz_text.encode()).hexdigest()
    row = await db.execute(
        select(ContestRequirements).where(
            ContestRequirements.contest_id == contest_id,
            ContestRequirements.tz_hash == tz_hash,
        )
    )
    return row.scalar_one_or_none()


async def _cache_requirements(
    contest_id: int, tz_text: str, requirements: list[dict], db: AsyncSession
) -> None:
    tz_hash = hashlib.sha256(tz_text.encode()).hexdigest()
    db.add(ContestRequirements(
        contest_id=contest_id,
        tz_hash=tz_hash,
        requirements=requirements,
    ))
    await db.commit()


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

    if settings.evaluation_stub:
        cached_reqs = None
    else:
        cached = await _get_cached_requirements(data.contest_id, data.tz_text, db)
        if cached:
            cached_reqs = cached.requirements
        else:
            cached_reqs = await extract_tz_requirements(data.tz_text)
            if cached_reqs:
                await _cache_requirements(data.contest_id, data.tz_text, cached_reqs, db)

    result_data = await evaluate_submission(
        data.tz_text,
        data.submission_text,
        images=data.images if data.images else None,
        image_meta=[m.model_dump() for m in data.image_meta]
        if data.image_meta
        else None,
        cached_requirements=cached_reqs,
    )

    if record:
        record.compliance_score = result_data.get("compliance_score", 0)
        record.passed_requirements = result_data.get("passed_requirements", [])
        record.failed_requirements = result_data.get("failed_requirements", [])
        record.requirements_detail = result_data.get("requirements_detail", [])
        record.critical_issues = result_data.get("critical_issues", False)
        record.raw_llm_response = str(result_data)
    else:
        record = EvaluationResult(
            submission_id=data.submission_id,
            contest_id=data.contest_id,
            compliance_score=result_data.get("compliance_score", 0),
            passed_requirements=result_data.get("passed_requirements", []),
            failed_requirements=result_data.get("failed_requirements", []),
            requirements_detail=result_data.get("requirements_detail", []),
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


class RequirementItem(BaseModel):
    text: str
    is_critical: bool


class ContestRequirementsOut(BaseModel):
    contest_id: int
    requirements: list[RequirementItem]
    cached_at: datetime


class ContestStatsOut(BaseModel):
    contest_id: int
    evaluated_count: int
    avg_score: float | None
    critical_issues_count: int


class ExtractRequest(BaseModel):
    tz_text: str


@router.post("/requirements/{contest_id}", response_model=ContestRequirementsOut)
async def extract_contest_requirements(
    contest_id: int,
    data: ExtractRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    if settings.evaluation_stub:
        stub_reqs = [
            {"text": "Stub: требование 1", "is_critical": True},
            {"text": "Stub: требование 2", "is_critical": False},
        ]
        return ContestRequirementsOut(
            contest_id=contest_id,
            requirements=[RequirementItem(**r) for r in stub_reqs],
            cached_at=datetime.now(timezone.utc),
        )

    reqs = await extract_tz_requirements(data.tz_text)
    if not reqs:
        raise HTTPException(status_code=422, detail="Модель не смогла извлечь требования из ТЗ")

    tz_hash = hashlib.sha256(data.tz_text.encode()).hexdigest()
    existing = await db.execute(
        select(ContestRequirements).where(
            ContestRequirements.contest_id == contest_id,
            ContestRequirements.tz_hash == tz_hash,
        )
    )
    record = existing.scalar_one_or_none()
    if record:
        record.requirements = reqs
    else:
        record = ContestRequirements(contest_id=contest_id, tz_hash=tz_hash, requirements=reqs)
        db.add(record)
    await db.commit()
    await db.refresh(record)

    return ContestRequirementsOut(
        contest_id=contest_id,
        requirements=[RequirementItem(**r) for r in record.requirements],
        cached_at=record.created_at,
    )


@router.get("/requirements/{contest_id}", response_model=ContestRequirementsOut)
async def get_contest_requirements(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    row = await db.execute(
        select(ContestRequirements)
        .where(ContestRequirements.contest_id == contest_id)
        .order_by(ContestRequirements.created_at.desc())
    )
    record = row.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Требования не найдены")
    return ContestRequirementsOut(
        contest_id=contest_id,
        requirements=[RequirementItem(**r) for r in record.requirements],
        cached_at=record.created_at,
    )


@router.get("/contest/{contest_id}/stats", response_model=ContestStatsOut)
async def get_contest_stats(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    row = await db.execute(
        select(
            func.count(EvaluationResult.id),
            func.avg(EvaluationResult.compliance_score),
            func.sum(cast(EvaluationResult.critical_issues, Integer)),
        ).where(EvaluationResult.contest_id == contest_id)
    )
    count, avg_score, critical_count = row.one()
    return ContestStatsOut(
        contest_id=contest_id,
        evaluated_count=count or 0,
        avg_score=round(float(avg_score), 1) if avg_score is not None else None,
        critical_issues_count=int(critical_count or 0),
    )


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
