
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Wallet, WalletTransaction, WalletTxType


async def get_or_create_wallet(user_id: int, db: AsyncSession) -> Wallet:
    result = await db.execute(select(Wallet).where(Wallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=0)
        db.add(wallet)
        await db.flush()
    return wallet


async def credit_wallet(
    user_id: int,
    amount: float,
    tx_type: WalletTxType,
    description: str,
    reference_id: int | None,
    db: AsyncSession,
) -> Wallet:
    wallet = await get_or_create_wallet(user_id, db)
    wallet.balance = float(wallet.balance) + amount
    wallet.updated_at = datetime.now(timezone.utc)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=user_id,
        amount=amount,
        tx_type=tx_type,
        reference_id=reference_id,
        description=description,
    )
    db.add(tx)
    return wallet


async def debit_wallet(
    user_id: int,
    amount: float,
    tx_type: WalletTxType,
    description: str,
    reference_id: int | None,
    db: AsyncSession,
) -> Wallet:
    wallet = await get_or_create_wallet(user_id, db)
    if float(wallet.balance) < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно средств. Баланс: {float(wallet.balance):.2f} ₽, требуется: {amount:.2f} ₽",
        )
    wallet.balance = float(wallet.balance) - amount
    wallet.updated_at = datetime.now(timezone.utc)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=user_id,
        amount=-amount,
        tx_type=tx_type,
        reference_id=reference_id,
        description=description,
    )
    db.add(tx)
    return wallet
