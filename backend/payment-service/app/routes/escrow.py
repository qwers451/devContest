from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, verify_internal
from app.models import (
    AwardRelease,
    EscrowAccount,
    MilestoneRelease,
    Payment,
    PaymentStatus,
    PaymentType,
    Payout,
    Transaction,
    WalletTxType,
)
from app.wallet_helpers import credit_wallet, payout_description, split_commission

router = APIRouter(prefix="/escrow", tags=["escrow"])


class ReserveRequest(BaseModel):
    contest_id: int
    customer_id: int
    amount: float


class ReleaseRequest(BaseModel):
    contest_id: int
    executor_id: int
    contest_title: str | None = None


class ReleaseStageRequest(BaseModel):
    contest_id: int
    stage_id: int
    executor_id: int
    amount: float
    stage_name: str | None = None
    contest_title: str | None = None


class ReleaseAwardRequest(BaseModel):
    contest_id: int
    place: int
    executor_id: int
    amount: float
    contest_title: str | None = None


@router.post("/reserve", dependencies=[Depends(verify_internal)])
async def reserve_escrow(data: ReserveRequest, db: AsyncSession = Depends(get_db)):
    existing_escrow = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
    )
    if existing_escrow.scalar_one_or_none():
        raise HTTPException(
            status_code=409, detail="Escrow already exists for this contest"
        )

    payment_result = await db.execute(
        select(Payment).where(Payment.contest_id == data.contest_id)
    )
    payment = payment_result.scalar_one_or_none()

    if not payment:
        payment = Payment(
            contest_id=data.contest_id,
            customer_id=data.customer_id,
            amount=data.amount,
            status=PaymentStatus.held,
            payment_type=PaymentType.contest,
            yookassa_payment_id=f"stub_{data.contest_id}",
            paid_at=datetime.now(timezone.utc),
        )
        db.add(payment)
        await db.flush()
    else:
        payment.status = PaymentStatus.held
        payment.payment_type = PaymentType.contest
        payment.paid_at = payment.paid_at or datetime.now(timezone.utc)
        payment.updated_at = datetime.now(timezone.utc)

    escrow = EscrowAccount(
        payment_id=payment.id,
        contest_id=data.contest_id,
        amount=payment.amount,
        status=PaymentStatus.held,
    )
    db.add(escrow)

    tx = Transaction(
        payment_id=payment.id,
        type="hold",
        amount=payment.amount,
        description=f"Эскроу зарезервирован для конкурса {data.contest_id}",
    )
    db.add(tx)

    await db.commit()
    return {
        "status": "held",
        "contest_id": data.contest_id,
        "amount": float(payment.amount),
    }


def _add_commission_tx(
    db: AsyncSession,
    payment_id: int,
    commission: float,
    contest_label: str,
    executor_id: int,
) -> None:
    if commission <= 0:
        return
    db.add(
        Transaction(
            payment_id=payment_id,
            type="commission",
            amount=commission,
            description=f"Комиссия платформы с выплаты по конкурсу «{contest_label}» (исполнитель {executor_id})",
        )
    )


@router.post("/release", dependencies=[Depends(verify_internal)])
async def release_escrow(data: ReleaseRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")
    if escrow.status == PaymentStatus.released:
        raise HTTPException(status_code=409, detail="Escrow already released")

    remaining = float(escrow.amount) - float(escrow.released_amount)
    if remaining <= 0:
        raise HTTPException(status_code=409, detail="Nothing left to release")

    escrow.status = PaymentStatus.released
    escrow.released_to = data.executor_id
    escrow.released_at = datetime.now(timezone.utc)
    escrow.released_amount = escrow.amount

    payment_result = await db.execute(
        select(Payment).where(Payment.id == escrow.payment_id)
    )
    if payment_obj := payment_result.scalar_one_or_none():
        payment_obj.status = PaymentStatus.released
        payment_obj.updated_at = datetime.now(timezone.utc)

    contest_label = data.contest_title or f"#{data.contest_id}"

    net, commission = split_commission(remaining)
    await credit_wallet(
        data.executor_id,
        net,
        WalletTxType.income,
        payout_description(f"Выигрыш в конкурсе «{contest_label}»", net, commission),
        data.contest_id,
        db,
    )

    payout = Payout(
        executor_id=data.executor_id,
        contest_id=data.contest_id,
        amount=net,
        yookassa_payout_id=f"wallet_credit_{data.contest_id}",
        status=PaymentStatus.released,
        paid_at=datetime.now(timezone.utc),
    )
    db.add(payout)

    tx = Transaction(
        payment_id=escrow.payment_id,
        type="release",
        amount=remaining,
        description=f"Выигрыш в конкурсе «{contest_label}» исполнителю {data.executor_id} (на кошелёк)",
    )
    db.add(tx)
    _add_commission_tx(db, escrow.payment_id, commission, contest_label, data.executor_id)

    await db.commit()
    return {
        "status": "released",
        "contest_id": data.contest_id,
        "executor_id": data.executor_id,
        "amount": remaining,
        "net_amount": net,
        "commission": commission,
    }


@router.post("/release-stage", dependencies=[Depends(verify_internal)])
async def release_stage(data: ReleaseStageRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")
    if escrow.status == PaymentStatus.released:
        raise HTTPException(status_code=409, detail="Escrow already fully released")

    remaining = float(escrow.amount) - float(escrow.released_amount)
    if data.amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Stage amount {data.amount} exceeds remaining {remaining}",
        )

    existing = await db.execute(
        select(MilestoneRelease).where(
            MilestoneRelease.escrow_id == escrow.id,
            MilestoneRelease.stage_id == data.stage_id,
            MilestoneRelease.executor_id == data.executor_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409, detail="Stage already released for this executor"
        )

    milestone = MilestoneRelease(
        escrow_id=escrow.id,
        stage_id=data.stage_id,
        executor_id=data.executor_id,
        amount=data.amount,
        status=PaymentStatus.released,
        released_at=datetime.now(timezone.utc),
    )
    db.add(milestone)

    escrow.released_amount = float(escrow.released_amount) + data.amount
    escrow.released_to = data.executor_id

    if float(escrow.released_amount) >= float(escrow.amount):
        escrow.status = PaymentStatus.released
        escrow.released_at = datetime.now(timezone.utc)
        payment_result = await db.execute(
            select(Payment).where(Payment.id == escrow.payment_id)
        )
        if payment_obj := payment_result.scalar_one_or_none():
            payment_obj.status = PaymentStatus.released
            payment_obj.updated_at = datetime.now(timezone.utc)

    stage_label = data.stage_name or f"#{data.stage_id}"
    contest_label = data.contest_title or f"#{data.contest_id}"

    net, commission = split_commission(data.amount)
    await credit_wallet(
        data.executor_id,
        net,
        WalletTxType.income,
        payout_description(
            f"Выплата за этап «{stage_label}» конкурса «{contest_label}»",
            net,
            commission,
        ),
        data.contest_id,
        db,
    )

    payout = Payout(
        executor_id=data.executor_id,
        contest_id=data.contest_id,
        amount=net,
        yookassa_payout_id=f"wallet_stage_{data.contest_id}_{data.stage_id}_{data.executor_id}",
        status=PaymentStatus.released,
        paid_at=datetime.now(timezone.utc),
    )
    db.add(payout)

    tx = Transaction(
        payment_id=escrow.payment_id,
        type="release_stage",
        amount=data.amount,
        description=f"Выплата за этап «{stage_label}» исполнителю {data.executor_id} (на кошелёк)",
    )
    db.add(tx)
    _add_commission_tx(db, escrow.payment_id, commission, contest_label, data.executor_id)

    await db.commit()
    await db.refresh(milestone)
    return {
        "status": "released",
        "contest_id": data.contest_id,
        "stage_id": data.stage_id,
        "executor_id": data.executor_id,
        "amount": data.amount,
        "net_amount": net,
        "commission": commission,
        "total_released": float(escrow.released_amount),
    }


@router.post("/release-award", dependencies=[Depends(verify_internal)])
async def release_award(data: ReleaseAwardRequest, db: AsyncSession = Depends(get_db)):
    """Выплата за призовое место. Идемпотентна по (contest_id, place)."""
    result = await db.execute(
        select(EscrowAccount)
        .where(EscrowAccount.contest_id == data.contest_id)
        .with_for_update()
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")

    existing = await db.execute(
        select(AwardRelease).where(
            AwardRelease.escrow_id == escrow.id, AwardRelease.place == data.place
        )
    )
    if award := existing.scalar_one_or_none():
        return {
            "status": "already_released",
            "contest_id": data.contest_id,
            "place": data.place,
            "executor_id": award.executor_id,
            "amount": float(award.amount),
            "net_amount": float(award.net_amount),
            "commission": float(award.commission),
        }

    if escrow.status == PaymentStatus.released:
        raise HTTPException(status_code=409, detail="Escrow already fully released")
    remaining = float(escrow.amount) - float(escrow.released_amount)
    if data.amount <= 0 or data.amount > remaining + 0.005:
        raise HTTPException(
            status_code=400,
            detail=f"Award amount {data.amount} exceeds remaining {remaining}",
        )

    net, commission = split_commission(data.amount)
    now = datetime.now(timezone.utc)
    db.add(
        AwardRelease(
            escrow_id=escrow.id,
            place=data.place,
            executor_id=data.executor_id,
            amount=data.amount,
            commission=commission,
            net_amount=net,
            released_at=now,
        )
    )

    escrow.released_amount = round(float(escrow.released_amount) + data.amount, 2)
    if data.place == 1:
        escrow.released_to = data.executor_id
    if float(escrow.released_amount) >= float(escrow.amount) - 0.005:
        escrow.status = PaymentStatus.released
        escrow.released_at = now
        payment_result = await db.execute(
            select(Payment).where(Payment.id == escrow.payment_id)
        )
        if payment_obj := payment_result.scalar_one_or_none():
            payment_obj.status = PaymentStatus.released
            payment_obj.updated_at = now

    contest_label = data.contest_title or f"#{data.contest_id}"
    await credit_wallet(
        data.executor_id,
        net,
        WalletTxType.income,
        payout_description(
            f"Приз за {data.place} место в конкурсе «{contest_label}»", net, commission
        ),
        data.contest_id,
        db,
    )
    db.add(
        Payout(
            executor_id=data.executor_id,
            contest_id=data.contest_id,
            amount=net,
            yookassa_payout_id=f"wallet_award_{data.contest_id}_{data.place}",
            status=PaymentStatus.released,
            paid_at=now,
        )
    )
    db.add(
        Transaction(
            payment_id=escrow.payment_id,
            type="release_award",
            amount=data.amount,
            description=f"Приз за {data.place} место в конкурсе «{contest_label}» исполнителю {data.executor_id} (на кошелёк)",
        )
    )
    _add_commission_tx(db, escrow.payment_id, commission, contest_label, data.executor_id)

    await db.commit()
    return {
        "status": "released",
        "contest_id": data.contest_id,
        "place": data.place,
        "executor_id": data.executor_id,
        "amount": data.amount,
        "net_amount": net,
        "commission": commission,
    }


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


@router.get("/{contest_id}/milestones", response_model=list[MilestoneOut])
async def get_milestones(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        return []
    milestones = await db.execute(
        select(MilestoneRelease)
        .where(MilestoneRelease.escrow_id == escrow.id)
        .order_by(MilestoneRelease.released_at)
    )
    return milestones.scalars().all()


@router.get("/status/{contest_id}", dependencies=[Depends(verify_internal)])
async def escrow_status(contest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == contest_id)
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        payment_result = await db.execute(
            select(Payment).where(Payment.contest_id == contest_id)
        )
        payment = payment_result.scalar_one_or_none()
        if not payment:
            return {"contest_id": contest_id, "status": "not_found", "held": False}
        return {
            "contest_id": contest_id,
            "status": payment.status,
            "held": payment.status == PaymentStatus.held,
        }

    return {
        "contest_id": contest_id,
        "status": escrow.status,
        "held": escrow.status in (PaymentStatus.held, PaymentStatus.released),
        "amount": float(escrow.amount),
        "released_amount": float(escrow.released_amount),
    }
