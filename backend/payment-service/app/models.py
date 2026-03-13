import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Numeric, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class PaymentStatus(str, enum.Enum):
    pending  = "pending"
    held     = "held"
    released = "released"
    refunded = "refunded"
    failed   = "failed"


class PaymentType(str, enum.Enum):
    contest      = "contest"
    wallet_topup = "wallet_topup"


class WalletTxType(str, enum.Enum):
    topup           = "topup"
    contest_payment = "contest_payment"
    income          = "income"
    withdrawal      = "withdrawal"


class Payment(Base):
    __tablename__ = "payments"

    id                  = Column(Integer, primary_key=True, index=True)
    contest_id          = Column(Integer, nullable=True, unique=True, index=True)
    customer_id         = Column(Integer, nullable=False)
    amount              = Column(Numeric(12, 2), nullable=False)
    currency            = Column(String(3), default="RUB")
    status              = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    payment_type        = Column(SAEnum(PaymentType), default=PaymentType.contest)
    wallet_user_id      = Column(Integer, nullable=True)  # for wallet_topup: user being credited
    yookassa_payment_id = Column(String(100), unique=True, nullable=True)
    redirect_url        = Column(String(500), nullable=True)
    paid_at             = Column(DateTime(timezone=True), nullable=True)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    escrow       = relationship("EscrowAccount", back_populates="payment", uselist=False)
    transactions = relationship("Transaction", back_populates="payment")


class EscrowAccount(Base):
    __tablename__ = "escrow_accounts"

    id              = Column(Integer, primary_key=True, index=True)
    payment_id      = Column(Integer, ForeignKey("payments.id"), unique=True, nullable=False)
    contest_id      = Column(Integer, nullable=False, unique=True)
    amount          = Column(Numeric(12, 2), nullable=False)
    released_amount = Column(Numeric(12, 2), default=0)
    status          = Column(SAEnum(PaymentStatus), default=PaymentStatus.held)
    released_to     = Column(Integer, nullable=True)
    released_at     = Column(DateTime(timezone=True), nullable=True)

    payment    = relationship("Payment", back_populates="escrow")
    milestones = relationship("MilestoneRelease", back_populates="escrow")


class MilestoneRelease(Base):
    __tablename__ = "milestone_releases"

    id          = Column(Integer, primary_key=True, index=True)
    escrow_id   = Column(Integer, ForeignKey("escrow_accounts.id"), nullable=False)
    stage_id    = Column(Integer, nullable=False)
    executor_id = Column(Integer, nullable=False)
    amount      = Column(Numeric(12, 2), nullable=False)
    status      = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    released_at = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    escrow = relationship("EscrowAccount", back_populates="milestones")


class Transaction(Base):
    __tablename__ = "transactions"

    id          = Column(Integer, primary_key=True, index=True)
    payment_id  = Column(Integer, ForeignKey("payments.id"), nullable=False)
    type        = Column(String(50), nullable=False)
    amount      = Column(Numeric(12, 2), nullable=False)
    description = Column(String(500))
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    payment = relationship("Payment", back_populates="transactions")


class Payout(Base):
    __tablename__ = "payouts"

    id                  = Column(Integer, primary_key=True, index=True)
    executor_id         = Column(Integer, nullable=False, index=True)
    contest_id          = Column(Integer, nullable=True)  # nullable: wallet withdrawals have no contest
    amount              = Column(Numeric(12, 2), nullable=False)
    yookassa_payout_id  = Column(String(100), nullable=True)
    recipient_account   = Column(String(100), nullable=True)
    status              = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    paid_at             = Column(DateTime(timezone=True), nullable=True)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Wallet(Base):
    __tablename__ = "wallets"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, unique=True, nullable=False, index=True)
    balance    = Column(Numeric(12, 2), nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    transactions = relationship("WalletTransaction", back_populates="wallet")


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id           = Column(Integer, primary_key=True, index=True)
    wallet_id    = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    user_id      = Column(Integer, nullable=False, index=True)
    amount       = Column(Numeric(12, 2), nullable=False)  # positive = credit, negative = debit
    tx_type      = Column(SAEnum(WalletTxType), nullable=False)
    reference_id = Column(Integer, nullable=True)  # contest_id / payout_id / payment_id
    description  = Column(String(500), nullable=True)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    wallet = relationship("Wallet", back_populates="transactions")
