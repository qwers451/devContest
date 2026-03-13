import asyncio
import os
from datetime import date, datetime, time, timezone

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients import get_user, trigger_evaluation
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Contest, Review, Submission

router = APIRouter(prefix="/submissions", tags=["submissions"])

UPLOAD_DIR = "/app/uploads"


def _parse_csv_ints(raw: str | None) -> list[int]:
    if not raw:
        return []
    return [int(part) for part in raw.split(",") if part.strip()]


class SubmissionCreate(BaseModel):
    contest_id: int
    title: str
    annotation: str | None = None
    description: str | None = None


class SubmissionOut(BaseModel):
    id: int
    contest_id: int
    executor_id: int
    number: int
    title: str
    annotation: str | None
    description: str | None
    files: list
    status: int
    created_at: datetime
    updated_at: datetime
    executor_login: str | None = None
    contest_title: str | None = None

    model_config = {"from_attributes": True}


async def _enrich_submissions(subs: list, db: AsyncSession) -> list[SubmissionOut]:
    if not subs:
        return []
    contest_ids = list({s.contest_id for s in subs})
    executor_ids = list({s.executor_id for s in subs})

    c_result = await db.execute(
        select(Contest.id, Contest.title).where(Contest.id.in_(contest_ids))
    )
    contest_map = {row[0]: row[1] for row in c_result}

    user_results = await asyncio.gather(*[get_user(uid) for uid in executor_ids])
    user_map = {u["id"]: u["login"] for u in user_results if u}

    return [
        SubmissionOut.model_validate(s).model_copy(
            update={
                "executor_login": user_map.get(s.executor_id),
                "contest_title": contest_map.get(s.contest_id),
            }
        )
        for s in subs
    ]


class ReviewCreate(BaseModel):
    score: float
    commentary: str | None = None


class ReviewOut(BaseModel):
    id: int
    submission_id: int
    reviewer_id: int
    number: int
    score: float
    commentary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=SubmissionOut, status_code=201)
async def create_submission(
    data: SubmissionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("executor")),
):
    contest_result = await db.execute(
        select(Contest).where(Contest.id == data.contest_id)
    )
    contest = contest_result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    max_num = await db.execute(select(func.max(Submission.number)))
    next_num = (max_num.scalar() or 0) + 1

    submission = Submission(
        contest_id=data.contest_id,
        executor_id=current_user["id"],
        number=next_num,
        title=data.title,
        annotation=data.annotation,
        description=data.description,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    if contest.tz_text and data.description:
        background_tasks.add_task(
            trigger_evaluation,
            submission.id,
            data.contest_id,
            contest.tz_text,
            data.description,
        )

    return (await _enrich_submissions([submission], db))[0]


@router.get("", response_model=list[SubmissionOut])
async def list_submissions(
    contest_id: int | None = None,
    executor_id: int | None = None,
    status: int | None = None,
    statuses: str | None = None,
    addedBefore: date | None = None,
    addedAfter: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    q = select(Submission)
    filters = []
    if contest_id:
        filters.append(Submission.contest_id == contest_id)
    if executor_id:
        filters.append(Submission.executor_id == executor_id)
    status_values = _parse_csv_ints(statuses)
    if status_values:
        filters.append(Submission.status.in_(status_values))
    elif status is not None:
        filters.append(Submission.status == status)
    if addedBefore is not None:
        filters.append(
            Submission.created_at
            <= datetime.combine(addedBefore, time.max, tzinfo=timezone.utc)
        )
    if addedAfter is not None:
        filters.append(
            Submission.created_at
            >= datetime.combine(addedAfter, time.min, tzinfo=timezone.utc)
        )
    if filters:
        q = q.where(and_(*filters))
    q = q.order_by(Submission.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    subs = result.scalars().all()
    return await _enrich_submissions(subs, db)


@router.get("/number/{number}", response_model=SubmissionOut)
async def get_submission_by_number(
    number: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.number == number))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    return (await _enrich_submissions([s], db))[0]


@router.get("/{submission_id}", response_model=SubmissionOut)
async def get_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    return (await _enrich_submissions([s], db))[0]


@router.patch("/{submission_id}/status", response_model=SubmissionOut)
async def update_status(
    submission_id: int,
    status: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("customer", "admin")),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    s.status = status
    await db.commit()
    await db.refresh(s)
    return (await _enrich_submissions([s], db))[0]


@router.delete("/{submission_id}", status_code=204)
async def delete_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.executor_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.delete(s)
    await db.commit()


# ─── Files ───────────────────────────────────────────────────────────────────


@router.post("/{submission_id}/files", response_model=SubmissionOut)
async def upload_files(
    submission_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.executor_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    upload_dir = f"{UPLOAD_DIR}/{submission_id}"
    os.makedirs(upload_dir, exist_ok=True)

    saved = []
    for file in files:
        safe_name = os.path.basename(file.filename or "file")
        dest = f"{upload_dir}/{safe_name}"
        async with aiofiles.open(dest, "wb") as f:
            content = await file.read()
            await f.write(content)
        saved.append(safe_name)

    s.files = saved
    await db.commit()
    await db.refresh(s)
    return (await _enrich_submissions([s], db))[0]


@router.get("/{submission_id}/files/{filename}")
async def download_file(
    submission_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Submission.id).where(Submission.id == submission_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Submission not found")
    path = f"{UPLOAD_DIR}/{submission_id}/{filename}"
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename)


# ─── Reviews ─────────────────────────────────────────────────────────────────


@router.post("/{submission_id}/reviews", response_model=ReviewOut, status_code=201)
async def add_review(
    submission_id: int,
    data: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Submission not found")

    max_num = await db.execute(
        select(func.max(Review.number)).where(Review.submission_id == submission_id)
    )
    next_num = (max_num.scalar() or 0) + 1

    review = Review(
        submission_id=submission_id,
        reviewer_id=current_user["id"],
        number=next_num,
        score=data.score,
        commentary=data.commentary,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.get("/{submission_id}/reviews", response_model=list[ReviewOut])
async def list_reviews(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Review)
        .where(Review.submission_id == submission_id)
        .order_by(Review.number)
    )
    return result.scalars().all()


@router.put("/{submission_id}/reviews/{review_number}", response_model=ReviewOut)
async def update_review(
    submission_id: int,
    review_number: int,
    data: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Review).where(
            Review.submission_id == submission_id, Review.number == review_number
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.reviewer_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    review.score = data.score
    review.commentary = data.commentary
    await db.commit()
    await db.refresh(review)
    return review


@router.delete("/{submission_id}/reviews/{review_number}", status_code=204)
async def delete_review(
    submission_id: int,
    review_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Review).where(
            Review.submission_id == submission_id, Review.number == review_number
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.reviewer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.delete(review)
    await db.commit()
