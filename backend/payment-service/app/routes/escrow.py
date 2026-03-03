from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Payment, EscrowAccount, Transaction, Payout, PaymentStatus
from app.dependencies import verify_internal

router = APIRouter(prefix="/escrow", tags=["escrow"])


class ReserveRequest(BaseModel):
    contest_id: int
    customer_id: int
    amount: int


class ReleaseRequest(BaseModel):
    contest_id: int
    executor_id: int


@router.post("/reserve", dependencies=[Depends(verify_internal)])
async def reserve_escrow(data: ReserveRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Payment).where(Payment.contest_id == data.contest_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Escrow already exists for this contest")

    payment = Payment(
        contest_id=data.contest_id,
        customer_id=data.customer_id,
        amount=data.amount,
        status=PaymentStatus.held,
        yookassa_id=f"stub_{data.contest_id}",  # stub until real YooKassa integration
    )
    db.add(payment)
    await db.flush()

    escrow = EscrowAccount(
        payment_id=payment.id,
        contest_id=data.contest_id,
        amount=data.amount,
        status=PaymentStatus.held,
    )
    db.add(escrow)

    tx = Transaction(
        payment_id=payment.id,
        type="hold",
        amount=data.amount,
        description=f"Escrow reserved for contest {data.contest_id}",
    )
    db.add(tx)

    await db.commit()
    return {"status": "held", "contest_id": data.contest_id, "amount": data.amount}


@router.post("/release", dependencies=[Depends(verify_internal)])
async def release_escrow(data: ReleaseRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")
    if escrow.status != PaymentStatus.held:
        raise HTTPException(status_code=409, detail="Escrow is not in held state")

    escrow.status = PaymentStatus.released
    escrow.released_to = data.executor_id
    escrow.released_at = datetime.now(timezone.utc)

    payout = Payout(
        executor_id=data.executor_id,
        contest_id=data.contest_id,
        amount=escrow.amount,
        yookassa_id=f"payout_stub_{data.contest_id}",
        status=PaymentStatus.released,
    )
    db.add(payout)

    tx = Transaction(
        payment_id=escrow.payment_id,
        type="release",
        amount=escrow.amount,
        description=f"Escrow released to executor {data.executor_id}",
    )
    db.add(tx)

    await db.commit()
    return {"status": "released", "contest_id": data.contest_id, "executor_id": data.executor_id}
