from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from app.database import get_db
from app.models import Contest, ContestStage, Winner, ContestStatus
from app.dependencies import get_current_user, require_role
from app.clients import reserve_escrow, release_escrow

router = APIRouter(prefix="/contests", tags=["contests"])


class StageIn(BaseModel):
    name: str
    description: str | None = None
    deadline: datetime | None = None
    order: int


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
    prizepool: int
    status: str
    type_id: int | None
    files: list
    created_at: datetime
    ends_at: datetime

    model_config = {"from_attributes": True}


class ContestListOut(BaseModel):
    items: list[ContestOut]
    total: int
    page: int
    pages: int


@router.get("", response_model=ContestListOut)
async def list_contests(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    type_id: int | None = None,
    min_reward: int | None = None,
    max_reward: int | None = None,
    customer_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Contest)
    filters = []
    if search:
        filters.append(Contest.title.ilike(f"%{search}%"))
    if status:
        filters.append(Contest.status == status)
    if type_id:
        filters.append(Contest.type_id == type_id)
    if min_reward is not None:
        filters.append(Contest.prizepool >= min_reward)
    if max_reward is not None:
        filters.append(Contest.prizepool <= max_reward)
    if customer_id:
        filters.append(Contest.customer_id == customer_id)
    if filters:
        q = q.where(and_(*filters))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    q = q.order_by(Contest.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()

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
        stage = ContestStage(
            contest_id=contest.id,
            name=stage_data.name,
            description=stage_data.description,
            deadline=stage_data.deadline,
            order=stage_data.order,
        )
        db.add(stage)

    # Reserve escrow — activate contest only if payment succeeds
    try:
        await reserve_escrow(contest.id, current_user["id"], data.prizepool)
        contest.status = ContestStatus.active
    except Exception:
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    await db.commit()
    await db.refresh(contest)
    return contest


@router.get("/{contest_id}", response_model=ContestOut)
async def get_contest(contest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return contest


@router.get("/number/{number}", response_model=ContestOut)
async def get_contest_by_number(number: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contest).where(Contest.number == number))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    return contest


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
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("customer", "admin")),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.customer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not your contest")

    winner = Winner(
        contest_id=contest_id,
        submission_id=submission_id,
        executor_id=executor_id,
    )
    db.add(winner)
    contest.status = ContestStatus.finished

    await release_escrow(contest_id, executor_id)

    await db.commit()
    await db.refresh(contest)
    return contest
