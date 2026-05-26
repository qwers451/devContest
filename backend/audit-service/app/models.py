import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text
from sqlalchemy import Enum as SAEnum

from app.database import Base


class AuditEventType(str, enum.Enum):
    session_created = "session.created"
    spec_requirement_added = "spec.requirement_added"
    message_info = "message.info"
    message_clarification = "message.clarification"
    message_scope_change = "message.scope_change"
    message_submission = "message.submission"
    message_defect = "message.defect"
    action_start = "action.start"
    action_approve_scope_change = "action.approve_scope_change"
    action_reject_scope_change = "action.reject_scope_change"
    action_accept = "action.accept"
    action_cancel = "action.cancel"


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(String(120), unique=True, nullable=False, index=True)
    correlation_id = Column(String(120), nullable=True, index=True)
    service_name = Column(String(120), nullable=False, default="protocol-service")
    actor_id = Column(Integer, nullable=True, index=True)
    actor_role = Column(String(50), nullable=True)
    session_id = Column(Integer, nullable=True, index=True)
    submission_id = Column(Integer, nullable=True, index=True)
    contest_id = Column(Integer, nullable=True, index=True)
    message_id = Column(Integer, nullable=True, index=True)
    event_type = Column(SAEnum(AuditEventType), nullable=False, index=True)
    old_state = Column(String(50), nullable=True, index=True)
    new_state = Column(String(50), nullable=True, index=True)
    old_spec_version_id = Column(Integer, nullable=True)
    new_spec_version_id = Column(Integer, nullable=True)
    hash_before = Column(String(128), nullable=True)
    hash_after = Column(String(128), nullable=True)
    payload = Column(JSON, default=dict)
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
