from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients import fetch_submission_context
from app.database import get_db
from app.dependencies import get_current_user, verify_internal
from app.models import AuditEvent, AuditEventType

router = APIRouter(tags=["audit"])


class AuditEventIn(BaseModel):
    command_id: str
    correlation_id: str | None = None
    service_name: str = "protocol-service"
    actor_id: int | None = None
    actor_role: str | None = None
    session_id: int | None = None
    submission_id: int | None = None
    contest_id: int | None = None
    message_id: int | None = None
    event_type: AuditEventType
    old_state: str | None = None
    new_state: str | None = None
    old_spec_version_id: int | None = None
    new_spec_version_id: int | None = None
    hash_before: str | None = None
    hash_after: str | None = None
    payload: dict = Field(default_factory=dict)
    notes: str | None = None


class AuditEventOut(BaseModel):
    id: int
    command_id: str
    correlation_id: str | None
    service_name: str
    actor_id: int | None
    actor_role: str | None
    session_id: int | None
    submission_id: int | None
    contest_id: int | None
    message_id: int | None
    event_type: AuditEventType
    old_state: str | None
    new_state: str | None
    old_spec_version_id: int | None
    new_spec_version_id: int | None
    hash_before: str | None
    hash_after: str | None
    payload: dict
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


def _apply_filters(
    query,
    *,
    session_id: int | None,
    submission_id: int | None,
    contest_id: int | None,
    actor_id: int | None,
    event_type: AuditEventType | None,
    created_after: datetime | None,
    created_before: datetime | None,
):
    if session_id is not None:
        query = query.where(AuditEvent.session_id == session_id)
    if submission_id is not None:
        query = query.where(AuditEvent.submission_id == submission_id)
    if contest_id is not None:
        query = query.where(AuditEvent.contest_id == contest_id)
    if actor_id is not None:
        query = query.where(AuditEvent.actor_id == actor_id)
    if event_type is not None:
        query = query.where(AuditEvent.event_type == event_type)
    if created_after is not None:
        query = query.where(AuditEvent.created_at >= created_after)
    if created_before is not None:
        query = query.where(AuditEvent.created_at <= created_before)
    return query


async def _resolve_submission_id_for_session(
    session_id: int,
    db: AsyncSession,
) -> int | None:
    result = await db.execute(
        select(AuditEvent.submission_id)
        .where(
            AuditEvent.session_id == session_id,
            AuditEvent.submission_id.is_not(None),
        )
        .order_by(AuditEvent.created_at, AuditEvent.id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _ensure_public_access(
    *,
    user: dict,
    session_id: int | None,
    submission_id: int | None,
    db: AsyncSession,
):
    if user["role"] == "admin":
        return

    if submission_id is None and session_id is None:
        raise HTTPException(
            status_code=400,
            detail="session_id or submission_id is required for non-admin access",
        )

    target_submission_id = submission_id
    if target_submission_id is None and session_id is not None:
        target_submission_id = await _resolve_submission_id_for_session(session_id, db)
        if target_submission_id is None:
            return

    context = await fetch_submission_context(target_submission_id)
    if user["id"] not in {context["customer_id"], context["executor_id"]}:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post(
    "/internal/audit/events",
    response_model=AuditEventOut,
    dependencies=[Depends(verify_internal)],
)
async def create_audit_event(
    payload: AuditEventIn,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditEvent).where(AuditEvent.command_id == payload.command_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    event = AuditEvent(**payload.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get(
    "/internal/audit/events",
    response_model=list[AuditEventOut],
    dependencies=[Depends(verify_internal)],
)
async def list_internal_audit_events(
    session_id: int | None = None,
    submission_id: int | None = None,
    contest_id: int | None = None,
    actor_id: int | None = None,
    event_type: AuditEventType | None = Query(None),
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditEvent).order_by(AuditEvent.created_at, AuditEvent.id)
    query = _apply_filters(
        query,
        session_id=session_id,
        submission_id=submission_id,
        contest_id=contest_id,
        actor_id=actor_id,
        event_type=event_type,
        created_after=created_after,
        created_before=created_before,
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/audit/events", response_model=list[AuditEventOut])
async def list_audit_events(
    session_id: int | None = None,
    submission_id: int | None = None,
    contest_id: int | None = None,
    actor_id: int | None = None,
    event_type: AuditEventType | None = Query(None),
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await _ensure_public_access(
        user=current_user,
        session_id=session_id,
        submission_id=submission_id,
        db=db,
    )
    query = select(AuditEvent).order_by(AuditEvent.created_at, AuditEvent.id)
    query = _apply_filters(
        query,
        session_id=session_id,
        submission_id=submission_id,
        contest_id=contest_id,
        actor_id=actor_id,
        event_type=event_type,
        created_after=created_after,
        created_before=created_before,
    )
    result = await db.execute(query)
    return result.scalars().all()
