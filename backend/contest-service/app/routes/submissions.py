import asyncio
import base64
import os
import struct
from datetime import date, datetime, time, timezone

from sqlalchemy.orm.attributes import flag_modified

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
from app.file_text import extract_file_text
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Contest, Review, Submission, SubmissionStatusLog

router = APIRouter(prefix="/submissions", tags=["submissions"])

UPLOAD_DIR = "/app/uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Разрешённые типы файлов: сигнатура (magic bytes) → MIME
ALLOWED_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x89PNG",    "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"%PDF",       "application/pdf"),
    (b"PK\x03\x04", "application/zip"),
    (b"PK\x05\x06", "application/zip"),
    # docx/xlsx тоже zip-контейнеры
]

def _check_file(filename: str, content: bytes) -> None:
    """Проверяет размер и тип файла по magic bytes. Бросает HTTPException при нарушении."""
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Файл «{filename}» превышает допустимый размер 10 МБ",
        )
    sig = content[:4]
    for magic, _ in ALLOWED_SIGNATURES:
        if sig.startswith(magic):
            return
    raise HTTPException(
        status_code=415,
        detail=f"Недопустимый тип файла «{filename}». Разрешены: PDF, PNG, JPEG, ZIP/DOCX",
    )


def _png_size(data: bytes) -> tuple[int, int] | None:
    """Read width×height from PNG IHDR chunk (bytes 16-24). Returns None if not a valid PNG."""
    try:
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        w = struct.unpack(">I", data[16:20])[0]
        h = struct.unpack(">I", data[20:24])[0]
        return w, h
    except Exception:
        return None


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
    ai_score: float | None = None
    critical_issues: bool | None = None
    avg_score: float | None = None
    last_review: "ReviewOut | None" = None
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
    sub_ids = [s.id for s in subs]

    c_result = await db.execute(
        select(Contest.id, Contest.title).where(Contest.id.in_(contest_ids))
    )
    contest_map = {row[0]: row[1] for row in c_result}

    user_results = await asyncio.gather(*[get_user(uid) for uid in executor_ids])
    user_map = {u["id"]: u["login"] for u in user_results if u}

    # avg_score per submission
    avg_result = await db.execute(
        select(Review.submission_id, func.avg(Review.score).label("avg"))
        .where(Review.submission_id.in_(sub_ids))
        .group_by(Review.submission_id)
    )
    avg_map = {row[0]: round(float(row[1]), 2) for row in avg_result}

    # last review per submission (max id proxy for latest)
    last_review_result = await db.execute(
        select(Review)
        .where(Review.submission_id.in_(sub_ids))
        .order_by(Review.submission_id, Review.created_at.desc())
    )
    all_reviews = last_review_result.scalars().all()
    last_review_map: dict = {}
    for r in all_reviews:
        if r.submission_id not in last_review_map:
            last_review_map[r.submission_id] = ReviewOut.model_validate(r)

    return [
        SubmissionOut.model_validate(s).model_copy(
            update={
                "executor_login": user_map.get(s.executor_id),
                "contest_title": contest_map.get(s.contest_id),
                "avg_score": avg_map.get(s.id),
                "last_review": last_review_map.get(s.id),
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
    files: list = []
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=SubmissionOut, status_code=201)
async def create_submission(
    data: SubmissionCreate,
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
    sort_by: str = Query("created_at", regex="^(title|created_at|status|ai_score)$"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
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
    sort_col = {
        "title": Submission.title,
        "created_at": Submission.created_at,
        "status": Submission.status,
        "ai_score": Submission.ai_score,
    }.get(sort_by, Submission.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    q = q.order_by(order).offset((page - 1) * limit).limit(limit)
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


class SubmissionUpdate(BaseModel):
    title: str | None = None
    annotation: str | None = None
    description: str | None = None


@router.put("/{submission_id}", response_model=SubmissionOut)
async def update_submission(
    submission_id: int,
    data: SubmissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.executor_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(s, field, value)

    await db.commit()
    await db.refresh(s)
    return (await _enrich_submissions([s], db))[0]


@router.patch("/{submission_id}/status", response_model=SubmissionOut)
async def update_status(
    submission_id: int,
    status: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    if status not in range(1, 6):
        raise HTTPException(status_code=422, detail="Status must be between 1 and 5")
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    old_status = s.status
    s.status = status
    db.add(SubmissionStatusLog(
        submission_id=submission_id,
        old_status=old_status,
        new_status=status,
        changed_by_id=current_user["id"],
    ))
    await db.commit()
    await db.refresh(s)
    return (await _enrich_submissions([s], db))[0]


@router.post("/{submission_id}/evaluate", status_code=202)
async def retrigger_evaluation(
    submission_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Manually re-trigger AI evaluation. Accessible by executor (owner), customer, or admin."""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Allow: submission owner, any customer/admin
    if current_user["role"] == "executor" and s.executor_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    contest_result = await db.execute(select(Contest).where(Contest.id == s.contest_id))
    contest = contest_result.scalar_one_or_none()
    if not contest or not contest.tz_text:
        raise HTTPException(status_code=422, detail="Contest has no TZ text")
    if not s.description and not s.files:
        raise HTTPException(status_code=422, detail="Submission has no description or files")

    # Read files: PNG → images, PDF/DOCX → extracted text
    images_b64 = []
    image_meta = []
    doc_texts = []
    if s.files:
        for fname in s.files:
            path = f"{UPLOAD_DIR}/{submission_id}/{fname}"
            try:
                async with aiofiles.open(path, "rb") as f:
                    data = await f.read()
                if fname.lower().endswith(".png"):
                    images_b64.append(base64.b64encode(data).decode())
                    size = _png_size(data)
                    image_meta.append({
                        "filename": fname,
                        "size_bytes": len(data),
                        "width": size[0] if size else None,
                        "height": size[1] if size else None,
                    })
                else:
                    text = extract_file_text(fname, data)
                    if text:
                        doc_texts.append(f"[{fname}]\n{text}")
            except OSError:
                pass

    submission_text = s.description or ""
    if doc_texts:
        submission_text += "\n\n--- Прикреплённые документы ---\n" + "\n\n".join(doc_texts)

    if not submission_text.strip():
        raise HTTPException(status_code=422, detail="No evaluable content in submission")

    background_tasks.add_task(
        trigger_evaluation,
        s.id,
        s.contest_id,
        contest.tz_text,
        submission_text,
        images_b64 or None,
        image_meta or None,
    )
    return {"detail": "Evaluation started"}


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

    existing = list(s.files or [])
    for file in files:
        safe_name = os.path.basename(file.filename or "file")
        content = await file.read()
        _check_file(safe_name, content)
        dest = f"{upload_dir}/{safe_name}"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)
        if safe_name not in existing:
            existing.append(safe_name)

    s.files = existing
    flag_modified(s, "files")
    await db.commit()
    await db.refresh(s)

    return (await _enrich_submissions([s], db))[0]


@router.delete("/{submission_id}/files/{filename}", response_model=SubmissionOut)
async def delete_file(
    submission_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    if s.executor_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    existing = list(s.files or [])
    if filename in existing:
        existing.remove(filename)
    s.files = existing
    flag_modified(s, "files")

    path = f"{UPLOAD_DIR}/{submission_id}/{filename}"
    if os.path.isfile(path):
        os.remove(path)

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

# ─── Review Files ─────────────────────────────────────────────────────────────

REVIEW_UPLOAD_DIR = "/app/uploads/reviews"


@router.post("/{submission_id}/reviews/{review_number}/files", response_model=ReviewOut)
async def upload_review_files(
    submission_id: int,
    review_number: int,
    files: list[UploadFile] = File(...),
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

    upload_dir = f"{REVIEW_UPLOAD_DIR}/{review.id}"
    os.makedirs(upload_dir, exist_ok=True)

    existing = list(review.files or [])
    for file in files:
        safe_name = os.path.basename(file.filename or "file")
        dest = f"{upload_dir}/{safe_name}"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await file.read())
        if safe_name not in existing:
            existing.append(safe_name)

    review.files = existing
    flag_modified(review, "files")
    await db.commit()
    await db.refresh(review)
    return review


@router.get("/{submission_id}/reviews/{review_number}/files/{filename}")
async def download_review_file(
    submission_id: int,
    review_number: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Review).where(
            Review.submission_id == submission_id, Review.number == review_number
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    path = f"{REVIEW_UPLOAD_DIR}/{review.id}/{filename}"
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename)


@router.delete("/{submission_id}/reviews/{review_number}/files/{filename}", response_model=ReviewOut)
async def delete_review_file(
    submission_id: int,
    review_number: int,
    filename: str,
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

    existing = list(review.files or [])
    if filename in existing:
        existing.remove(filename)
    review.files = existing
    flag_modified(review, "files")

    path = f"{REVIEW_UPLOAD_DIR}/{review.id}/{filename}"
    if os.path.isfile(path):
        os.remove(path)

    await db.commit()
    await db.refresh(review)
    return review


# ─── Status Log ───────────────────────────────────────────────────────────────


class StatusLogOut(BaseModel):
    id: int
    old_status: int | None
    new_status: int
    changed_by_id: int | None
    changed_at: datetime

    model_config = {"from_attributes": True}


@router.get("/{submission_id}/status-log", response_model=list[StatusLogOut])
async def get_status_log(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SubmissionStatusLog)
        .where(SubmissionStatusLog.submission_id == submission_id)
        .order_by(SubmissionStatusLog.changed_at)
    )
    return result.scalars().all()


# ─── AI Score (internal) ──────────────────────────────────────────────────────

from app.dependencies import verify_internal


@router.patch("/{submission_id}/ai-score", dependencies=[Depends(verify_internal)])
async def set_ai_score(
    submission_id: int,
    score: float = Query(...),
    critical_issues: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    s.ai_score = score
    if critical_issues is not None:
        s.critical_issues = critical_issues
    await db.commit()
    return {"submission_id": submission_id, "ai_score": score, "critical_issues": critical_issues}
