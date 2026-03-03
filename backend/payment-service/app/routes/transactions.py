from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models import Transaction, Payout
from app.dependencies import get_current_user

router = APIRouter(tags=["transactions"])


class TransactionOut(BaseModel):
    id: int
    payment_id: int
    type: str
    amount: int
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayoutOut(BaseModel):
    id: int
    executor_id: int
    contest_id: int
    amount: int
    status: str
    created_at: datetime

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
        select(Payout).where(Payout.executor_id == executor_id).order_by(Payout.created_at.desc())
    )
    return result.scalars().all()
