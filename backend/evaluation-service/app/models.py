from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON, UniqueConstraint
from app.database import Base


class ContestRequirements(Base):
    __tablename__ = "contest_requirements"
    __table_args__ = (UniqueConstraint("contest_id", "tz_hash"),)

    id          = Column(Integer, primary_key=True, index=True)
    contest_id  = Column(Integer, nullable=False, index=True)
    tz_hash     = Column(String(64), nullable=False)
    requirements = Column(JSON, nullable=False)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id                  = Column(Integer, primary_key=True, index=True)
    submission_id       = Column(Integer, nullable=False, unique=True, index=True)
    contest_id          = Column(Integer, nullable=False, index=True)
    compliance_score    = Column(Integer, nullable=False)
    passed_requirements = Column(JSON, default=list)
    failed_requirements = Column(JSON, default=list)
    requirements_detail = Column(JSON, default=list)
    critical_issues     = Column(Boolean, default=False)
    raw_llm_response    = Column(Text, nullable=True)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
