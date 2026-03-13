from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import EscrowAccount, MilestoneRelease, Payout, Transaction

router = APIRouter(tags=["transactions"])


class TransactionOut(BaseModel):
    id: int
    payment_id: int
    type: str
    amount: float
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayoutOut(BaseModel):
    id: int
    executor_id: int
    contest_id: int
    amount: float
    status: str
    recipient_account: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MilestoneOut(BaseModel):
    id: int
    escrow_id: int
    stage_id: int
    executor_id: int
    amount: float
    status: str
    released_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EscrowStatusOut(BaseModel):
    id: int
    contest_id: int
    amount: float
    released_amount: float
    status: str
    released_to: int | None
    released_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Transaction).order_by(Transaction.created_at.desc()))
    return result.scalars().all()


@router.get("/payouts/{executor_id}", response_model=list[PayoutOut])
async def list_payouts(
    executor_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Payout)
        .where(Payout.executor_id == executor_id)
        .order_by(Payout.created_at.desc())
    )
    return result.scalars().all()


@router.get("/escrow/{contest_id}", response_model=EscrowStatusOut)
async def get_escrow(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Escrow not found")
    return escrow


@router.get("/escrow/{contest_id}/milestones", response_model=list[MilestoneOut])
async def list_milestones(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    escrow_result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == contest_id)
    )
    escrow = escrow_result.scalar_one_or_none()
    if not escrow:
        return []
    result = await db.execute(
        select(MilestoneRelease)
        .where(MilestoneRelease.escrow_id == escrow.id)
        .order_by(MilestoneRelease.created_at)
    )
    return result.scalars().all()
