import logging
import os
from datetime import date, datetime, time, timezone
from typing import List

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import String, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.clients import check_escrow_held, release_escrow, release_stage_escrow
from app.database import get_db
from app.dependencies import get_current_user, require_role, verify_internal
from app.file_text import extract_file_text
from app.models import Contest, ContestStage, ContestStatus, Submission, Winner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contests", tags=["contests"])


class StageIn(BaseModel):
    name: str
    description: str | None = None
    deadline: datetime | None = None
    order: int
    prize_amount: int = 0


class StageOut(BaseModel):
    id: int
    name: str
    description: str | None
    deadline: datetime | None
    order: int
    prize_amount: int = 0

    model_config = {"from_attributes": True}


class WinnerOut(BaseModel):
    submission_id: int
    executor_id: int
    selected_at: datetime

    model_config = {"from_attributes": True}


class ContestCreate(BaseModel):
    title: str
    annotation: str | None = None
    description: str | None = None
    tz_text: str | None = None
    prizepool: int
    ends_at: datetime
    type_id: int | None = None
    template_id: int | None = None
    stages: list[StageIn] = []


class ContestOut(BaseModel):
    id: int
    customer_id: int
    number: int
    title: str
    annotation: str | None
    description: str | None
    tz_text: str | None
    tz_filename: str | None = None
    prizepool: int
    status: str
    type_id: int | None
    template_id: int | None = None
    files: list
    created_at: datetime
    ends_at: datetime
    current_stage_id: int | None = None
    stages: list[StageOut] = []
    winner: WinnerOut | None = None

    model_config = {"from_attributes": True}


class ContestListOut(BaseModel):
    items: list[ContestOut]
    total: int
    page: int
    pages: int


def _relations():
    return [selectinload(Contest.stages), selectinload(Contest.winner)]


def _parse_csv_ints(raw: str | None) -> list[int]:
    if not raw:
        return []
    return [int(part) for part in raw.split(",") if part.strip()]


def _parse_csv_strings(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


@router.get("", response_model=ContestListOut)
async def list_contests(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    statuses: str | None = None,
    type_id: int | None = None,
    types: str | None = None,
    min_reward: int | None = None,
    max_reward: int | None = None,
    customer_id: int | None = None,
    endBy: date | None = None,
    endAfter: date | None = None,
    sort_by: str = Query("created_at", regex="^(title|prizepool|created_at|ends_at)$"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if search:
        filters.append(Contest.title.ilike(f"%{search}%"))
    status_values = _parse_csv_strings(statuses)
    if status_values:
        filters.append(Contest.status.in_(status_values))
    elif status:
        filters.append(Contest.status == status)
    type_ids = _parse_csv_ints(types)
    if type_ids:
        filters.append(Contest.type_id.in_(type_ids))
    elif type_id:
        filters.append(Contest.type_id == type_id)
    if min_reward is not None:
        filters.append(Contest.prizepool >= min_reward)
    if max_reward is not None:
        filters.append(Contest.prizepool <= max_reward)
    if customer_id:
        filters.append(Contest.customer_id == customer_id)
    if endBy is not None:
        filters.append(
            Contest.ends_at <= datetime.combine(endBy, time.max, tzinfo=timezone.utc)
        )
    if endAfter is not None:
        filters.append(
            Contest.ends_at >= datetime.combine(endAfter, time.min, tzinfo=timezone.utc)
        )

    count_q = select(func.count(Contest.id))
    if filters:
        count_q = count_q.where(and_(*filters))
    total = (await db.execute(count_q)).scalar()

    sort_col = {
        "title": Contest.title,
        "prizepool": Contest.prizepool,
        "created_at": Contest.created_at,
        "ends_at": Contest.ends_at,
    }.get(sort_by, Contest.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()

    q = select(Contest).options(*_relations())
    if filters:
        q = q.where(and_(*filters))
    q = q.order_by(order).offset((page - 1) * limit).limit(limit)
    items = (await db.execute(q)).scalars().all()

    return ContestListOut(
        items=items,
        total=total,
        page=page,
        pages=max(1, -(-total // limit)),
    )


@router.post("", response_model=ContestOut, status_code=201)
async def create_contest(
    data: ContestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    max_num = await db.execute(select(func.max(Contest.number)))
    next_num = (max_num.scalar() or 0) + 1

    contest = Contest(
        customer_id=current_user["id"],
        number=next_num,
        title=data.title,
        annotation=data.annotation,
        description=data.description,
        tz_text=data.tz_text,
        prizepool=data.prizepool,
        ends_at=data.ends_at,
        type_id=data.type_id,
        template_id=data.template_id,
        status=ContestStatus.draft,
    )
    db.add(contest)
    await db.flush()

    for stage_data in data.stages:
        db.add(
            ContestStage(
                contest_id=contest.id,
                name=stage_data.name,
                description=stage_data.description,
                deadline=stage_data.deadline,
                order=stage_data.order,
                prize_amount=stage_data.prize_amount,
            )
        )

    await db.commit()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest.id)
    )
    return result.scalar_one()


class ContestUpdate(BaseModel):
    title: str | None = None
    annotation: str | None = None
    description: str | None = None
    tz_text: str | None = None
    prizepool: int | None = None
    ends_at: datetime | None = None
    type_id: int | None = None


@router.put("/{contest_id}", response_model=ContestOut)
async def update_contest(
    contest_id: int,
    data: ContestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if (
        contest.customer_id != current_user["id"]
        and current_user.get("role") != "admin"
    ):
        raise HTTPException(status_code=403, detail="Not your contest")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(contest, field, value)

    await db.commit()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()


@router.patch("/{contest_id}/cancel-internal", dependencies=[Depends(verify_internal)])
async def cancel_contest_internal(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest:
        contest.status = ContestStatus.cancelled
        await db.commit()
    return {"status": "cancelled", "contest_id": contest_id}


@router.patch("/{contest_id}/activate")
async def activate_contest(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if (
        contest.customer_id != current_user["id"]
        and current_user.get("role") != "admin"
    ):
        raise HTTPException(status_code=403, detail="Not your contest")
    if contest.status == ContestStatus.active:
        return {"status": "already_active", "contest_id": contest_id}

    held = await check_escrow_held(contest_id)
    if not held:
        raise HTTPException(status_code=402, detail="Payment not confirmed yet")

    contest.status = ContestStatus.active
    await db.commit()
    return {"status": "activated", "contest_id": contest_id}


@router.patch(
    "/{contest_id}/activate-internal", dependencies=[Depends(verify_internal)]
)
async def activate_contest_internal(
    contest_id: int, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        return {"status": "not_found"}
    if contest.status != ContestStatus.draft:
        return {"status": "already_active"}
    contest.status = ContestStatus.active
    await db.commit()
    return {"status": "activated", "contest_id": contest_id}


@router.get("/number/{number}", response_model=ContestOut)
async def get_contest_by_number(number: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.number == number)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return contest


@router.get("/{contest_id}", response_model=ContestOut)
async def get_contest(contest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return contest


@router.post("/{contest_id}/tz-file", response_model=ContestOut)
async def upload_tz_file(
    contest_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if (
        current_user["role"] not in ("admin",)
        and contest.customer_id != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Forbidden")

    fname = file.filename or "file"
    if not (fname.lower().endswith(".pdf") or fname.lower().endswith(".docx")):
        raise HTTPException(
            status_code=422, detail="Only PDF and DOCX files are supported"
        )

    data = await file.read()

    upload_dir = f"/app/uploads/contests/{contest_id}"
    os.makedirs(upload_dir, exist_ok=True)
    dest = f"{upload_dir}/{fname}"
    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)

    text = extract_file_text(fname, data)
    if text:
        contest.tz_text = text
    contest.tz_filename = fname
    await db.commit()
    await db.refresh(contest)
    return contest


@router.get("/{contest_id}/tz-file")
async def download_tz_file(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if not contest.tz_filename:
        raise HTTPException(status_code=404, detail="No TZ file uploaded")
    path = f"/app/uploads/contests/{contest_id}/{contest.tz_filename}"
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path, filename=contest.tz_filename)


@router.post("/{contest_id}/files", response_model=ContestOut)
async def upload_contest_files(
    contest_id: int,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if (
        current_user["role"] not in ("admin",)
        and contest.customer_id != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Forbidden")

    upload_dir = f"/app/uploads/contests/{contest_id}"
    os.makedirs(upload_dir, exist_ok=True)

    existing = list(contest.files or [])
    for file in files:
        safe_name = os.path.basename(file.filename or "file")
        dest = f"{upload_dir}/{safe_name}"
        async with aiofiles.open(dest, "wb") as f:
            await f.write(await file.read())
        if safe_name not in existing:
            existing.append(safe_name)

    contest.files = existing
    flag_modified(contest, "files")
    await db.commit()
    await db.refresh(contest)
    return contest


@router.get("/{contest_id}/files/{filename}")
async def download_contest_file(
    contest_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    safe_name = os.path.basename(filename)
    if safe_name not in (contest.files or []):
        raise HTTPException(status_code=404, detail="File not found")
    path = f"/app/uploads/contests/{contest_id}/{safe_name}"
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=safe_name)


@router.delete("/{contest_id}/files/{filename}", response_model=ContestOut)
async def delete_contest_file(
    contest_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if (
        current_user["role"] not in ("admin",)
        and contest.customer_id != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Forbidden")

    existing = list(contest.files or [])
    if filename in existing:
        existing.remove(filename)
    contest.files = existing
    flag_modified(contest, "files")

    path = f"/app/uploads/contests/{contest_id}/{filename}"
    if os.path.isfile(path):
        os.remove(path)

    await db.commit()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()


@router.delete("/{contest_id}", status_code=204)
async def delete_contest(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    await db.delete(contest)
    await db.commit()


@router.post("/{contest_id}/winner", response_model=ContestOut)
async def select_winner(
    contest_id: int,
    submission_id: int,
    executor_id: int,
    stage_id: int | None = Query(
        None, description="If set — partial milestone release for this stage only"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.customer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not your contest")
    if contest.status != ContestStatus.active:
        raise HTTPException(status_code=409, detail="Contest is not active")

    if stage_id:
        stage_result = await db.execute(
            select(ContestStage).where(
                ContestStage.id == stage_id, ContestStage.contest_id == contest_id
            )
        )
        stage = stage_result.scalar_one_or_none()
        if not stage:
            raise HTTPException(status_code=404, detail="Stage not found")

        prize = stage.prize_amount or (contest.prizepool // max(len(contest.stages), 1))
        try:
            await release_stage_escrow(
                contest_id,
                stage_id,
                executor_id,
                prize,
                stage_name=stage.name,
                contest_title=contest.title,
            )
        except Exception:
            logger.exception("Failed to release stage escrow for contest %s stage %s", contest_id, stage_id)

        await db.commit()
        db.expire_all()
        result = await db.execute(
            select(Contest).options(*_relations()).where(Contest.id == contest_id)
        )
        return result.scalar_one()

    db.add(
        Winner(
            contest_id=contest_id,
            submission_id=submission_id,
            executor_id=executor_id,
        )
    )
    contest.status = ContestStatus.finished

    sub_result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = sub_result.scalar_one_or_none()
    if submission:
        submission.status = 3

    try:
        await release_escrow(contest_id, executor_id, contest_title=contest.title)
    except Exception:
        logger.exception("Failed to release escrow for contest %s", contest_id)

    await db.commit()
    db.expire_all()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()


@router.put("/{contest_id}/stages", response_model=ContestOut)
async def update_stages(
    contest_id: int,
    stages: list[StageIn],
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.customer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not your contest")

    for stage in list(contest.stages):
        await db.delete(stage)
    await db.flush()

    contest.current_stage_id = None

    for stage_data in stages:
        db.add(
            ContestStage(
                contest_id=contest.id,
                name=stage_data.name,
                description=stage_data.description,
                deadline=stage_data.deadline,
                order=stage_data.order,
                prize_amount=stage_data.prize_amount,
            )
        )

    await db.commit()
    db.expire_all()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()


@router.patch("/{contest_id}/current-stage", response_model=ContestOut)
async def set_current_stage(
    contest_id: int,
    stage_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.customer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not your contest")

    if stage_id is not None:
        stage_ids = {s.id for s in contest.stages}
        if stage_id not in stage_ids:
            raise HTTPException(
                status_code=400, detail="Stage does not belong to this contest"
            )

    contest.current_stage_id = stage_id
    await db.commit()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()
