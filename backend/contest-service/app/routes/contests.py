import logging
import os
from datetime import date, datetime, time, timezone
from typing import List

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, field_validator
from sqlalchemy import String, and_, case, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.clients import (
    check_escrow_held,
    get_escrow_info,
    get_user,
    release_award_escrow,
    release_escrow,
    release_stage_escrow,
)
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_role, verify_internal
from app.file_text import extract_file_text
from app.mailer import notify_contest_finished, notify_winner
from app.models import (
    Contest,
    ContestAward,
    ContestStage,
    ContestStatus,
    Submission,
    Winner,
)

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


def validate_prize_distribution(value: list[int] | None) -> list[int] | None:
    if value is None:
        return value
    if not 1 <= len(value) <= 5:
        raise ValueError("Призовых мест должно быть от 1 до 5")
    if any(p < 1 for p in value):
        raise ValueError("Доля каждого призового места должна быть не меньше 1%")
    if sum(value) != 100:
        raise ValueError("Сумма долей призовых мест должна быть равна 100%")
    return value


class AwardShortOut(BaseModel):
    place: int
    submission_id: int
    executor_id: int
    amount: float
    net_amount: float | None = None

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
    prize_distribution: list[int] = [100]

    _check_distribution = field_validator("prize_distribution")(
        validate_prize_distribution
    )


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
    prize_distribution: list[int] = [100]
    awards: list[AwardShortOut] = []

    @field_validator("prize_distribution", mode="before")
    @classmethod
    def _default_distribution(cls, value):
        return value or [100]

    model_config = {"from_attributes": True}


class ContestListOut(BaseModel):
    items: list[ContestOut]
    total: int
    page: int
    pages: int


def _relations():
    return [
        selectinload(Contest.stages),
        selectinload(Contest.winner),
        selectinload(Contest.awards),
    ]


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
    result = await db.execute(text("SELECT nextval('contest_number_seq')"))
    next_num = result.scalar()

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
        prize_distribution=data.prize_distribution,
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
    prize_distribution: list[int] | None = None

    _check_distribution = field_validator("prize_distribution")(
        validate_prize_distribution
    )


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

    if data.prize_distribution is not None and contest.status == ContestStatus.finished:
        raise HTTPException(
            status_code=409, detail="Нельзя менять призовые места завершённого конкурса"
        )

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


def _net_of(gross: float | int | Decimal) -> float:
    """Сумма на руки исполнителю после комиссии платформы (копейки округляются)."""
    gross_d = Decimal(str(gross)).quantize(Decimal("0.01"), ROUND_HALF_UP)
    commission = (
        gross_d * Decimal(str(settings.platform_commission_percent)) / Decimal(100)
    ).quantize(Decimal("0.01"), ROUND_HALF_UP)
    return float(gross_d - commission)


class AwardIn(BaseModel):
    submission_id: int
    place: int


class AwardsIn(BaseModel):
    awards: list[AwardIn]


class AwardOut(BaseModel):
    place: int
    submission_id: int
    submission_number: int | None = None
    submission_title: str | None = None
    executor_id: int
    executor_login: str | None = None
    amount: float
    net_amount: float | None = None
    commission: float | None = None


def _split_prize(
    total: Decimal, distribution: list[int], places: list[int]
) -> dict[int, Decimal]:
    """Суммы по местам. Последнее присуждённое место получает остаток, чтобы сумма сошлась."""
    ordered = sorted(places)
    amounts: dict[int, Decimal] = {}
    spent = Decimal("0")
    for place in ordered[:-1]:
        part = (total * distribution[place - 1] / Decimal(100)).quantize(
            Decimal("0.01"), ROUND_HALF_UP
        )
        amounts[place] = part
        spent += part
    amounts[ordered[-1]] = total - spent
    return amounts


@router.post("/{contest_id}/awards", response_model=ContestOut)
async def award_places(
    contest_id: int,
    data: AwardsIn,
    background_tasks: BackgroundTasks,
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

    distribution = contest.prize_distribution or [100]
    places = [a.place for a in data.awards]
    if not data.awards or 1 not in places:
        raise HTTPException(status_code=422, detail="Необходимо указать победителя (1 место)")
    if any(p < 1 or p > len(distribution) for p in places):
        raise HTTPException(
            status_code=422,
            detail=f"Номер места должен быть от 1 до {len(distribution)}",
        )
    if len(set(places)) != len(places):
        raise HTTPException(status_code=422, detail="Одно место нельзя присудить дважды")
    sub_ids = [a.submission_id for a in data.awards]
    if len(set(sub_ids)) != len(sub_ids):
        raise HTTPException(
            status_code=422, detail="Одно решение не может занять несколько мест"
        )

    subs = (
        await db.execute(
            select(Submission).where(
                Submission.id.in_(sub_ids), Submission.contest_id == contest_id
            )
        )
    ).scalars().all()
    subs_by_id = {s.id: s for s in subs}
    if len(subs_by_id) != len(sub_ids):
        raise HTTPException(
            status_code=400, detail="Решение не относится к этому конкурсу"
        )

    # Сумма к выплате: остаток эскроу, а если конкурс не оплачен — призовой фонд
    escrow = await get_escrow_info(contest_id)
    paid = bool(escrow and escrow.get("held") and escrow.get("amount") is not None)
    if paid:
        total = Decimal(str(escrow["amount"])) - Decimal(
            str(escrow.get("released_amount") or 0)
        )
    else:
        total = Decimal(contest.prizepool)
        logger.warning(
            "Contest %s awarded without held escrow; payouts skipped", contest_id
        )
    amounts = _split_prize(total, distribution, places)

    awards_by_place = {a.place: subs_by_id[a.submission_id] for a in data.awards}
    nets: dict[int, float] = {}
    for place in sorted(awards_by_place):
        sub = awards_by_place[place]
        gross = amounts[place]
        nets[place] = _net_of(gross)
        if paid and gross > 0:
            try:
                released = await release_award_escrow(
                    contest_id,
                    place,
                    sub.executor_id,
                    float(gross),
                    contest_title=contest.title,
                )
                nets[place] = float(released.get("net_amount", nets[place]))
            except Exception:
                logger.exception(
                    "Failed to release award for contest %s place %s", contest_id, place
                )
                raise HTTPException(
                    status_code=502,
                    detail="Не удалось выплатить приз. Повторите попытку позже.",
                )

    winner_sub = awards_by_place[1]
    db.add(
        Winner(
            contest_id=contest_id,
            submission_id=winner_sub.id,
            executor_id=winner_sub.executor_id,
        )
    )
    winner_sub.status = 3
    for place, sub in awards_by_place.items():
        db.add(
            ContestAward(
                contest_id=contest_id,
                place=place,
                submission_id=sub.id,
                executor_id=sub.executor_id,
                amount=amounts[place],
                net_amount=nets[place],
            )
        )
    contest.status = ContestStatus.finished

    awarded_executors = {sub.executor_id for sub in awards_by_place.values()}
    others = await db.execute(
        select(Submission.executor_id)
        .where(Submission.contest_id == contest_id)
        .distinct()
    )
    other_ids = [row[0] for row in others if row[0] not in awarded_executors]
    c_number, c_title = contest.number, contest.title
    mails = [
        (sub.executor_id, float(amounts[place]), place, nets[place])
        for place, sub in sorted(awards_by_place.items())
    ]

    await db.commit()
    for executor_id, gross, place, net in mails:
        background_tasks.add_task(
            notify_winner, executor_id, c_number, c_title, gross, place, net
        )
    for other_id in other_ids:
        background_tasks.add_task(notify_contest_finished, other_id, c_number, c_title)
    db.expire_all()
    result = await db.execute(
        select(Contest).options(*_relations()).where(Contest.id == contest_id)
    )
    return result.scalar_one()


@router.get("/{contest_id}/awards", response_model=list[AwardOut])
async def list_awards(contest_id: int, db: AsyncSession = Depends(get_db)):
    if not (
        await db.execute(select(Contest.id).where(Contest.id == contest_id))
    ).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Contest not found")
    rows = (
        await db.execute(
            select(ContestAward, Submission.number, Submission.title)
            .join(Submission, Submission.id == ContestAward.submission_id)
            .where(ContestAward.contest_id == contest_id)
            .order_by(ContestAward.place)
        )
    ).all()
    out: list[AwardOut] = []
    for award, number, title in rows:
        user = await get_user(award.executor_id)
        gross = float(award.amount)
        net = float(award.net_amount) if award.net_amount is not None else None
        out.append(
            AwardOut(
                place=award.place,
                submission_id=award.submission_id,
                submission_number=number,
                submission_title=title,
                executor_id=award.executor_id,
                executor_login=(user or {}).get("login"),
                amount=gross,
                net_amount=net,
                commission=round(gross - net, 2) if net is not None else None,
            )
        )
    return out


@router.post("/{contest_id}/winner", response_model=ContestOut)
async def select_winner(
    contest_id: int,
    submission_id: int,
    executor_id: int,
    background_tasks: BackgroundTasks,
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

    gross, net = float(contest.prizepool), _net_of(contest.prizepool)
    try:
        released = await release_escrow(
            contest_id, executor_id, contest_title=contest.title
        )
        gross = float(released.get("amount", gross))
        net = float(released.get("net_amount", net))
    except Exception:
        logger.exception("Failed to release escrow for contest %s", contest_id)

    if submission:
        db.add(
            ContestAward(
                contest_id=contest_id,
                place=1,
                submission_id=submission_id,
                executor_id=executor_id,
                amount=gross,
                net_amount=net,
            )
        )

    others = await db.execute(
        select(Submission.executor_id)
        .where(Submission.contest_id == contest_id, Submission.executor_id != executor_id)
        .distinct()
    )
    other_ids = [row[0] for row in others]
    c_number, c_title = contest.number, contest.title

    await db.commit()
    background_tasks.add_task(
        notify_winner, executor_id, c_number, c_title, gross, 1, net
    )
    for other_id in other_ids:
        background_tasks.add_task(notify_contest_finished, other_id, c_number, c_title)
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
