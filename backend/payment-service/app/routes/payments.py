import asyncio
import json
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    EscrowAccount,
    Payment,
    PaymentStatus,
    PaymentType,
    Payout,
    Transaction,
    WalletTxType,
)
from app.wallet_helpers import credit_wallet, debit_wallet

router = APIRouter(prefix="/payments", tags=["payments"])


def _yk_configured() -> bool:
    return bool(settings.yookassa_shop_id and settings.yookassa_secret_key)


async def _yk_create_payment(amount: float, contest_id: int, customer_id: int) -> dict:
    from yookassa import Configuration
    from yookassa import Payment as YKPayment

    Configuration.account_id = settings.yookassa_shop_id
    Configuration.secret_key = settings.yookassa_secret_key

    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": False,
        "confirmation": {
            "type": "redirect",
            "return_url": f"{settings.yookassa_return_url}?contest_id={contest_id}",
        },
        "description": f"Призовой фонд конкурса #{contest_id}",
        "metadata": {
            "contest_id": str(contest_id),
            "customer_id": str(customer_id),
        },
    }
    result = await asyncio.to_thread(YKPayment.create, payload, idempotency_key)
    return result.dict() if hasattr(result, "dict") else dict(result)


async def _yk_capture_payment(yk_payment_id: str, amount: float) -> dict:
    from yookassa import Configuration
    from yookassa import Payment as YKPayment

    Configuration.account_id = settings.yookassa_shop_id
    Configuration.secret_key = settings.yookassa_secret_key

    result = await asyncio.to_thread(
        YKPayment.capture,
        yk_payment_id,
        {"amount": {"value": f"{amount:.2f}", "currency": "RUB"}},
    )
    return result.dict() if hasattr(result, "dict") else dict(result)


async def _yk_create_payout(
    amount: float, contest_id: int, executor_id: int, card_number: str | None
) -> dict | None:
    if not card_number:
        return None
    try:
        from yookassa import Configuration
        from yookassa import Payout as YKPayout

        Configuration.account_id = settings.yookassa_shop_id
        Configuration.secret_key = settings.yookassa_secret_key

        idempotency_key = str(uuid.uuid4())
        payload = {
            "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
            "payout_destination_data": {
                "type": "bank_card",
                "card": {"number": card_number},
            },
            "description": f"Выплата за конкурс #{contest_id}, исполнитель #{executor_id}",
            "metadata": {
                "contest_id": str(contest_id),
                "executor_id": str(executor_id),
            },
        }
        result = await asyncio.to_thread(YKPayout.create, payload, idempotency_key)
        return result.dict() if hasattr(result, "dict") else dict(result)
    except Exception as e:
        print(f"[payment-service] YooKassa payout error: {e}")
        return None


async def _yk_create_refund(yk_payment_id: str, amount: float) -> dict:
    from yookassa import Configuration
    from yookassa import Refund as YKRefund

    Configuration.account_id = settings.yookassa_shop_id
    Configuration.secret_key = settings.yookassa_secret_key

    idempotency_key = str(uuid.uuid4())
    payload = {
        "payment_id": yk_payment_id,
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
    }
    result = await asyncio.to_thread(YKRefund.create, payload, idempotency_key)
    return result.dict() if hasattr(result, "dict") else dict(result)


async def _notify_contest_service_cancel(contest_id: int) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.patch(
                f"{settings.contest_service_url}/contests/{contest_id}/cancel-internal",
                headers={"x-internal-secret": settings.internal_secret},
            )
    except Exception as e:
        print(f"[payment-service] Failed to cancel contest: {e}")


async def _notify_contest_service_activate(contest_id: int) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.patch(
                f"{settings.contest_service_url}/contests/{contest_id}/activate-internal",
                headers={"x-internal-secret": settings.internal_secret},
            )
    except Exception as e:
        print(f"[payment-service] Failed to notify contest-service: {e}")


class TopupRequest(BaseModel):
    contest_id: int
    amount: float
    use_balance: bool = False


class WithdrawRequest(BaseModel):
    contest_id: int
    card_number: str | None = None


class PaymentOut(BaseModel):
    id: int
    contest_id: int | None
    amount: float
    status: str
    redirect_url: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayoutOut(BaseModel):
    id: int
    executor_id: int
    contest_id: int | None
    amount: float
    status: str
    recipient_account: str | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/topup", response_model=PaymentOut)
async def topup(
    data: TopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):

    existing = await db.execute(
        select(Payment).where(Payment.contest_id == data.contest_id)
    )
    payment = existing.scalar_one_or_none()

    if payment and payment.status == PaymentStatus.held:
        raise HTTPException(
            status_code=409, detail="Payment already completed for this contest"
        )

    if data.use_balance:
        await debit_wallet(
            current_user["id"],
            data.amount,
            WalletTxType.contest_payment,
            f"Оплата конкурса #{data.contest_id}",
            data.contest_id,
            db,
        )

        if payment and payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.held
            payment.paid_at = datetime.now(timezone.utc)
            payment.updated_at = datetime.now(timezone.utc)
            payment.yookassa_payment_id = (
                payment.yookassa_payment_id
                or f"wallet_{data.contest_id}_{uuid.uuid4().hex[:8]}"
            )
        else:
            payment = Payment(
                contest_id=data.contest_id,
                customer_id=current_user["id"],
                amount=data.amount,
                status=PaymentStatus.held,
                payment_type=PaymentType.contest,
                yookassa_payment_id=f"wallet_{data.contest_id}_{uuid.uuid4().hex[:8]}",
                redirect_url=None,
                paid_at=datetime.now(timezone.utc),
            )
            db.add(payment)
            await db.flush()

        escrow_result = await db.execute(
            select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
        )
        if not escrow_result.scalar_one_or_none():
            escrow = EscrowAccount(
                payment_id=payment.id,
                contest_id=data.contest_id,
                amount=data.amount,
                status=PaymentStatus.held,
            )
            db.add(escrow)
            await db.flush()
            tx = Transaction(
                payment_id=payment.id,
                type="hold",
                amount=data.amount,
                description=f"Эскроу создан для конкурса {data.contest_id} (из кошелька)",
            )
            db.add(tx)

        await db.commit()
        await db.refresh(payment)
        asyncio.create_task(_notify_contest_service_activate(data.contest_id))
        return payment

    if payment and payment.status == PaymentStatus.pending and payment.redirect_url:
        return payment

    redirect_url = None
    yk_payment_id = None

    if _yk_configured():
        try:
            yk = await _yk_create_payment(
                data.amount, data.contest_id, current_user["id"]
            )
            yk_payment_id = yk.get("id")
            confirmation = yk.get("confirmation") or {}
            redirect_url = confirmation.get("confirmation_url") or confirmation.get(
                "redirect_url"
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"YooKassa error: {e}")
    else:
        yk_payment_id = f"stub_{data.contest_id}_{uuid.uuid4().hex[:8]}"
        redirect_url = (
            f"{settings.yookassa_return_url}?contest_id={data.contest_id}&stub=1"
        )

    if payment:
        payment.yookassa_payment_id = yk_payment_id
        payment.redirect_url = redirect_url
        payment.amount = data.amount
    else:
        payment = Payment(
            contest_id=data.contest_id,
            customer_id=current_user["id"],
            amount=data.amount,
            status=PaymentStatus.pending,
            yookassa_payment_id=yk_payment_id,
            redirect_url=redirect_url,
        )
        db.add(payment)

    await db.commit()
    await db.refresh(payment)

    if not _yk_configured():
        await _confirm_payment(payment.id, db)

    return payment


@router.get("/history", response_model=list[PaymentOut])
async def payment_history(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment)
        .where(
            Payment.customer_id == current_user["id"],
            Payment.payment_type == PaymentType.contest,
        )
        .order_by(Payment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{contest_id}", response_model=PaymentOut)
async def get_payment(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(Payment.contest_id == contest_id).with_for_update()
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if (
        payment.status == PaymentStatus.pending
        and _yk_configured()
        and payment.yookassa_payment_id
    ):
        try:
            from yookassa import Configuration
            from yookassa import Payment as YKPayment

            Configuration.account_id = settings.yookassa_shop_id
            Configuration.secret_key = settings.yookassa_secret_key
            yk_obj = await asyncio.to_thread(
                YKPayment.find_one, payment.yookassa_payment_id
            )
            yk_status = getattr(yk_obj, "status", None)

            if yk_status == "waiting_for_capture":
                await _yk_capture_payment(
                    payment.yookassa_payment_id, float(payment.amount)
                )
                await _confirm_payment(payment.id, db)
                await db.refresh(payment)
            elif yk_status == "succeeded":
                await _confirm_payment(payment.id, db)
                await db.refresh(payment)
            elif yk_status == "canceled":
                payment.status = PaymentStatus.failed
                payment.updated_at = datetime.now(timezone.utc)
                await db.commit()
        except Exception as e:
            print(f"[get_payment] live sync failed: {e}")

    return payment


@router.post("/withdraw", response_model=PayoutOut)
async def withdraw(
    data: WithdrawRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("executor", "admin"):
        raise HTTPException(status_code=403, detail="Only executors can withdraw")

    escrow_result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == data.contest_id)
    )
    escrow = escrow_result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")
    if (
        escrow.released_to != current_user["id"]
        and escrow.status != PaymentStatus.released
    ):
        raise HTTPException(
            status_code=403, detail="No released escrow for this executor"
        )

    existing_payout = await db.execute(
        select(Payout).where(
            Payout.contest_id == data.contest_id,
            Payout.executor_id == current_user["id"],
        )
    )
    payout = existing_payout.scalar_one_or_none()
    if payout and payout.status in (PaymentStatus.released, PaymentStatus.pending):
        raise HTTPException(status_code=409, detail="Payout already exists")

    amount = float(escrow.amount)
    yk_payout_id = None
    paid_at = None

    if _yk_configured() and data.card_number:
        yk = await _yk_create_payout(
            amount, data.contest_id, current_user["id"], data.card_number
        )
        if yk:
            yk_payout_id = yk.get("id")
            if yk.get("status") == "succeeded":
                paid_at = datetime.now(timezone.utc)
    else:
        yk_payout_id = f"payout_stub_{data.contest_id}"
        paid_at = datetime.now(timezone.utc)

    payout = Payout(
        executor_id=current_user["id"],
        contest_id=data.contest_id,
        amount=amount,
        yookassa_payout_id=yk_payout_id,
        recipient_account=data.card_number,
        status=PaymentStatus.released if paid_at else PaymentStatus.pending,
        paid_at=paid_at,
    )
    db.add(payout)
    await db.commit()
    await db.refresh(payout)
    return payout


@router.get("/withdrawals/my", response_model=list[PayoutOut])
async def my_withdrawals(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Payout)
        .where(Payout.executor_id == current_user["id"])
        .order_by(Payout.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{contest_id}/refund", response_model=PaymentOut)
async def refund_payment(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Payment).where(Payment.contest_id == contest_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.customer_id != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not your payment")
    if payment.status != PaymentStatus.held:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot refund payment in status '{payment.status}'",
        )

    escrow_result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == contest_id)
    )
    escrow = escrow_result.scalar_one_or_none()
    if escrow and escrow.status == PaymentStatus.released:
        raise HTTPException(
            status_code=409,
            detail="Escrow already released to executor — cannot refund",
        )
    if escrow and float(escrow.released_amount) > 0:
        raise HTTPException(
            status_code=409, detail="Milestone payments have been made — cannot refund"
        )

    yk_id = payment.yookassa_payment_id or ""
    is_wallet_payment = yk_id.startswith("wallet_")

    if is_wallet_payment:
        from app.wallet_helpers import credit_wallet

        await credit_wallet(
            payment.customer_id,
            float(payment.amount),
            WalletTxType.topup,
            f"Возврат за конкурс #{contest_id}",
            payment.id,
            db,
        )
    elif _yk_configured() and yk_id and not yk_id.startswith("stub_"):
        try:
            await _yk_create_refund(yk_id, float(payment.amount))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"YooKassa refund error: {e}")

    payment.status = PaymentStatus.refunded
    payment.updated_at = datetime.now(timezone.utc)

    if escrow:
        escrow.status = PaymentStatus.refunded

    tx = Transaction(
        payment_id=payment.id,
        type="refund",
        amount=float(payment.amount),
        description=f"Возврат платежа за конкурс #{contest_id}",
    )
    db.add(tx)
    await db.commit()
    await db.refresh(payment)
    await _notify_contest_service_cancel(contest_id)
    return payment


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    obj = event.get("object", {})
    yk_payment_id = obj.get("id")

    if not yk_payment_id:
        return {"ok": True}

    result = await db.execute(
        select(Payment).where(Payment.yookassa_payment_id == yk_payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return {"ok": True}

    if _yk_configured():
        try:
            from yookassa import Configuration
            from yookassa import Payment as YKPayment

            Configuration.account_id = settings.yookassa_shop_id
            Configuration.secret_key = settings.yookassa_secret_key
            yk_obj = await asyncio.to_thread(YKPayment.find_one, yk_payment_id)
            yk_status = getattr(yk_obj, "status", None)
        except Exception as e:
            print(f"[webhook] YooKassa re-fetch failed: {e}")
            return {"ok": True}
    else:
        yk_status = event.get("event", "").removeprefix("payment.")

    if yk_status == "waiting_for_capture":
        if _yk_configured():
            try:
                await _yk_capture_payment(yk_payment_id, float(payment.amount))
            except Exception as e:
                print(f"[webhook] capture failed: {e}")
        await _confirm_by_type(payment.id, payment.payment_type, db)

    elif yk_status == "succeeded":
        await _confirm_by_type(payment.id, payment.payment_type, db)

    elif yk_status == "canceled":
        payment.status = PaymentStatus.failed
        payment.updated_at = datetime.now(timezone.utc)
        await db.commit()

    return {"ok": True}


async def _confirm_by_type(payment_id: int, payment_type: PaymentType, db) -> None:
    if payment_type == PaymentType.wallet_topup:
        from app.routes.wallet import _confirm_wallet_topup

        await _confirm_wallet_topup(payment_id, db)
    else:
        await _confirm_payment(payment_id, db)


async def _confirm_payment(payment_id: int, db: AsyncSession) -> None:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment or payment.status == PaymentStatus.held:
        return

    payment.status = PaymentStatus.held
    payment.paid_at = datetime.now(timezone.utc)
    payment.updated_at = datetime.now(timezone.utc)

    escrow_result = await db.execute(
        select(EscrowAccount).where(EscrowAccount.contest_id == payment.contest_id)
    )
    escrow = escrow_result.scalar_one_or_none()
    if not escrow:
        escrow = EscrowAccount(
            payment_id=payment.id,
            contest_id=payment.contest_id,
            amount=payment.amount,
            status=PaymentStatus.held,
        )
        db.add(escrow)
        await db.flush()

        tx = Transaction(
            payment_id=payment.id,
            type="hold",
            amount=payment.amount,
            description=f"Эскроу создан для конкурса {payment.contest_id}",
        )
        db.add(tx)

    await db.commit()
    await _notify_contest_service_activate(payment.contest_id)
