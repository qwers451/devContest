from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class MonitoringCheckRun(Base):
    __tablename__ = "monitoring_check_runs"

    id = Column(Integer, primary_key=True, index=True)
    triggered_by_user_id = Column(Integer, nullable=True, index=True)
    triggered_by_role = Column(String(50), nullable=True, index=True)
    overall_status = Column(String(50), nullable=False, index=True)
    service_count = Column(Integer, nullable=False)
    healthy_count = Column(Integer, nullable=False)
    unhealthy_count = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    services = relationship(
        "ServiceCheckSnapshot",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ServiceCheckSnapshot.id",
        lazy="selectin",
    )


class ServiceCheckSnapshot(Base):
    __tablename__ = "service_check_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(
        Integer,
        ForeignKey("monitoring_check_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_name = Column(String(120), nullable=False, index=True)
    base_url = Column(String(255), nullable=False)
    health_url = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, index=True)
    http_status = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=False)
    checked_at = Column(DateTime(timezone=True), nullable=False, index=True)
    detail = Column(Text, nullable=True)

    run = relationship("MonitoringCheckRun", back_populates="services")
