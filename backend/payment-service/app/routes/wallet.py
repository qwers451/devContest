import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, verify_internal
from app.models import Payment, PaymentStatus, PaymentType, Payout, WalletTxType
from app.wallet_helpers import credit_wallet, debit_wallet, get_or_create_wallet

router = APIRouter(prefix="/wallet", tags=["wallet"])


def _yk_configured() -> bool:
    return bool(settings.yookassa_shop_id and settings.yookassa_secret_key)


async def _yk_create_wallet_payment(
    amount: float, user_id: int, payment_id_hint: int
) -> dict:
    from yookassa import Configuration
    from yookassa import Payment as YKPayment

    Configuration.account_id = settings.yookassa_shop_id
    Configuration.secret_key = settings.yookassa_secret_key

    # Return URL: frontend /wallet page with payment_id so frontend can poll status
    wallet_return_url = (
        f"{settings.frontend_url.rstrip('/')}/wallet"
        f"?wallet_topup=1&payment_id={payment_id_hint}"
    )

    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": False,
        "confirmation": {
            "type": "redirect",
            "return_url": wallet_return_url,
        },
        "description": f"Пополнение кошелька пользователя #{user_id}",
        "metadata": {
            "payment_type": "wallet_topup",
            "user_id": str(user_id),
        },
    }
    result = await asyncio.to_thread(YKPayment.create, payload, idempotency_key)
    return result.dict() if hasattr(result, "dict") else dict(result)


async def _yk_verify_payment(yk_payment_id: str) -> str | None:
    """Re-fetch payment from YooKassa and return its status. Returns None on error."""
    try:
        from yookassa import Configuration
        from yookassa import Payment as YKPayment

        Configuration.account_id = settings.yookassa_shop_id
        Configuration.secret_key = settings.yookassa_secret_key
        obj = await asyncio.to_thread(YKPayment.find_one, yk_payment_id)
        return getattr(obj, "status", None)
    except Exception as e:
        print(f"[wallet] YooKassa verify failed: {e}")
        return None


async def _yk_create_payout_local(
    amount: float, executor_id: int, card_number: str
) -> dict | None:
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
            "description": f"Вывод с кошелька, пользователь #{executor_id}",
            "metadata": {"executor_id": str(executor_id)},
        }
        result = await asyncio.to_thread(YKPayout.create, payload, idempotency_key)
        return result.dict() if hasattr(result, "dict") else dict(result)
    except Exception as e:
        print(f"[wallet] YooKassa payout error: {e}")
        return None


# ─── Schemas ─────────────────────────────────────────────────────────────────


class WalletBalanceOut(BaseModel):
    balance: float
    currency: str = "RUB"


class TopupWalletRequest(BaseModel):
    amount: float


class InternalCreditRequest(BaseModel):
    user_id: int
    amount: float
    description: str = "Internal credit"


class WithdrawWalletRequest(BaseModel):
    amount: float
    card_number: str | None = None  # тест: 5555555555554477


class WalletTransactionOut(BaseModel):
    id: int
    amount: float
    tx_type: str
    reference_id: int | None
    description: str | None
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


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/balance", response_model=WalletBalanceOut)
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return current user's wallet balance (creates wallet if first visit)."""
    wallet = await get_or_create_wallet(current_user["id"], db)
    await db.commit()
    return {"balance": float(wallet.balance), "currency": "RUB"}


@router.post("/topup")
async def topup_wallet(
    data: TopupWalletRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Initiate wallet top-up via YooKassa (stub in dev mode — auto-credits immediately)."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    # Create payment record first (with placeholder yk_id) to get the DB id
    payment = Payment(
        contest_id=None,
        customer_id=current_user["id"],
        wallet_user_id=current_user["id"],
        amount=data.amount,
        status=PaymentStatus.pending,
        payment_type=PaymentType.wallet_topup,
        yookassa_payment_id=None,
        redirect_url=None,
    )
    db.add(payment)
    await db.flush()  # get payment.id before calling YooKassa

    if _yk_configured():
        try:
            yk = await _yk_create_wallet_payment(
                data.amount, current_user["id"], payment.id
            )
            yk_payment_id = yk.get("id")
            confirmation = yk.get("confirmation") or {}
            redirect_url = confirmation.get("confirmation_url") or confirmation.get(
                "redirect_url"
            )
            payment.yookassa_payment_id = yk_payment_id
            payment.redirect_url = redirect_url
        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=502, detail=f"YooKassa error: {e}")

    await db.commit()
    await db.refresh(payment)

    # Stub mode: auto-credit wallet immediately
    if not _yk_configured():
        await _confirm_wallet_topup(payment.id, db)
        await db.refresh(payment)

    return {
        "payment_id": payment.id,
        "redirect_url": payment.redirect_url,
        "status": payment.status,
        "amount": float(payment.amount),
    }


@router.post("/internal/credit", dependencies=[Depends(verify_internal)])
async def internal_credit_wallet(
    data: InternalCreditRequest,
    db: AsyncSession = Depends(get_db),
):
    """Directly credit a user's wallet (for seeding/testing)."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    await credit_wallet(
        data.user_id,
        data.amount,
        WalletTxType.topup,
        data.description,
        None,
        db,
    )
    await db.commit()
    return {"status": "success", "user_id": data.user_id, "credited": data.amount}


@router.get("/transactions", response_model=list[WalletTransactionOut])
async def get_wallet_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Wallet transaction history for current user."""
    from app.models import WalletTransaction

    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == current_user["id"])
        .order_by(WalletTransaction.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.post("/withdraw", response_model=PayoutOut)
async def withdraw_from_wallet(
    data: WithdrawWalletRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Withdraw funds from wallet balance to a bank card."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше нуля")

    # Debit wallet (raises 400 if insufficient balance)
    await debit_wallet(
        current_user["id"],
        data.amount,
        WalletTxType.withdrawal,
        "Вывод средств на карту",
        None,
        db,
    )

    yk_payout_id = None
    paid_at = None

    if _yk_configured() and data.card_number:
        yk = await _yk_create_payout_local(
            data.amount, current_user["id"], data.card_number
        )
        if yk:
            yk_payout_id = yk.get("id")
            if yk.get("status") == "succeeded":
                paid_at = datetime.now(timezone.utc)
    else:
        # Stub: immediate success
        yk_payout_id = f"wallet_payout_stub_{current_user['id']}_{uuid.uuid4().hex[:8]}"
        paid_at = datetime.now(timezone.utc)

    payout = Payout(
        executor_id=current_user["id"],
        contest_id=None,
        amount=data.amount,
        yookassa_payout_id=yk_payout_id,
        recipient_account=data.card_number,
        status=PaymentStatus.released if paid_at else PaymentStatus.pending,
        paid_at=paid_at,
    )
    db.add(payout)
    await db.commit()
    await db.refresh(payout)
    return payout


@router.get("/payment/{payment_id}")
async def get_wallet_payment_status(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Poll the status of a wallet top-up payment after returning from YooKassa."""
    result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.payment_type == PaymentType.wallet_topup,
            Payment.customer_id == current_user["id"],
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # If still pending and YooKassa is configured — re-fetch live status to auto-confirm
    if (
        payment.status == PaymentStatus.pending
        and _yk_configured()
        and payment.yookassa_payment_id
    ):
        yk_status = await _yk_verify_payment(payment.yookassa_payment_id)
        if yk_status in ("waiting_for_capture", "succeeded"):
            await _confirm_wallet_topup(payment.id, db)
            await db.refresh(payment)
        elif yk_status == "canceled":
            payment.status = PaymentStatus.failed
            payment.updated_at = datetime.now(timezone.utc)
            await db.commit()

    return {
        "payment_id": payment.id,
        "status": payment.status,
        "amount": float(payment.amount),
    }


# ─── Internal helper ──────────────────────────────────────────────────────────


async def _confirm_wallet_topup(payment_id: int, db: AsyncSession) -> None:
    """Mark wallet topup payment as held and credit the user's wallet.
    Uses SELECT FOR UPDATE to prevent double-credit on concurrent requests."""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .with_for_update(skip_locked=True)
    )
    payment = result.scalar_one_or_none()
    # skip_locked returns nothing if another transaction holds the lock;
    # also bail if already confirmed
    if not payment or payment.status != PaymentStatus.pending:
        return

    payment.status = PaymentStatus.held
    payment.paid_at = datetime.now(timezone.utc)
    payment.updated_at = datetime.now(timezone.utc)

    user_id = payment.wallet_user_id or payment.customer_id
    await credit_wallet(
        user_id,
        float(payment.amount),
        WalletTxType.topup,
        "Пополнение кошелька",
        payment.id,
        db,
    )

    await db.commit()
