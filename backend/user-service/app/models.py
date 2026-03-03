import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum
from app.database import Base


class UserRole(str, enum.Enum):
    customer = "customer"
    executor = "executor"
    admin = "admin"


class UserStatus(int, enum.Enum):
    active = 1
    blocked = 2


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    login         = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(SAEnum(UserRole), nullable=False, default=UserRole.executor)
    status        = Column(Integer, nullable=False, default=UserStatus.active)
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
