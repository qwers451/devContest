from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON
from app.database import Base


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id                  = Column(Integer, primary_key=True, index=True)
    submission_id       = Column(Integer, nullable=False, unique=True, index=True)
    contest_id          = Column(Integer, nullable=False, index=True)
    compliance_score    = Column(Integer, nullable=False)
    passed_requirements = Column(JSON, default=list)
    failed_requirements = Column(JSON, default=list)
    critical_issues     = Column(Boolean, default=False)
    raw_llm_response    = Column(Text, nullable=True)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
