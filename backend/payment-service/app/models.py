import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class PaymentStatus(str, enum.Enum):
    pending  = "pending"
    held     = "held"
    released = "released"
    refunded = "refunded"
    failed   = "failed"


class Payment(Base):
    __tablename__ = "payments"

    id           = Column(Integer, primary_key=True, index=True)
    contest_id   = Column(Integer, nullable=False, unique=True, index=True)
    customer_id  = Column(Integer, nullable=False)
    amount       = Column(Integer, nullable=False)
    currency     = Column(String(3), default="RUB")
    status       = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    yookassa_id  = Column(String(100), unique=True, nullable=True)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    escrow       = relationship("EscrowAccount", back_populates="payment", uselist=False)
    transactions = relationship("Transaction", back_populates="payment")


class EscrowAccount(Base):
    __tablename__ = "escrow_accounts"

    id          = Column(Integer, primary_key=True, index=True)
    payment_id  = Column(Integer, ForeignKey("payments.id"), unique=True, nullable=False)
    contest_id  = Column(Integer, nullable=False, unique=True)
    amount      = Column(Integer, nullable=False)
    status      = Column(SAEnum(PaymentStatus), default=PaymentStatus.held)
    released_to = Column(Integer, nullable=True)
    released_at = Column(DateTime(timezone=True), nullable=True)

    payment     = relationship("Payment", back_populates="escrow")


class Transaction(Base):
    __tablename__ = "transactions"

    id          = Column(Integer, primary_key=True, index=True)
    payment_id  = Column(Integer, ForeignKey("payments.id"), nullable=False)
    type        = Column(String(50), nullable=False)
    amount      = Column(Integer, nullable=False)
    description = Column(String(500))
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    payment     = relationship("Payment", back_populates="transactions")


class Payout(Base):
    __tablename__ = "payouts"

    id          = Column(Integer, primary_key=True, index=True)
    executor_id = Column(Integer, nullable=False, index=True)
    contest_id  = Column(Integer, nullable=False)
    amount      = Column(Integer, nullable=False)
    yookassa_id = Column(String(100), nullable=True)
    status      = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
