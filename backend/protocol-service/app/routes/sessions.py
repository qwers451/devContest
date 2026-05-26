import hashlib
import json
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clients import create_audit_event, fetch_audit_events, fetch_submission_context
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    MessageType,
    ProtocolCommand,
    ProtocolMessage,
    ProtocolSession,
    ProtocolState,
    RequirementItem,
    SpecVersion,
    SpecVersionStatus,
)

router = APIRouter(prefix="/protocols", tags=["protocols"])

FINAL_STATES = {ProtocolState.done, ProtocolState.cancelled}
DISCUSSION_STATES = {
    ProtocolState.active,
    ProtocolState.negotiation,
    ProtocolState.review,
    ProtocolState.rework,
}
AUDIT_EVENT_BY_MESSAGE = {
    MessageType.info: "message.info",
    MessageType.clarification: "message.clarification",
    MessageType.scope_change: "message.scope_change",
    MessageType.submission: "message.submission",
    MessageType.defect: "message.defect",
}
AUDIT_EVENT_BY_ACTION = {
    "start": "action.start",
    "approve-scope-change": "action.approve_scope_change",
    "reject-scope-change": "action.reject_scope_change",
    "accept": "action.accept",
    "cancel": "action.cancel",
}


class RequirementCreate(BaseModel):
    command_id: str | None = None
    external_ref: str | None = None
    title: str
    description: str | None = None
    is_critical: bool = False


class RequirementOut(BaseModel):
    id: int
    spec_version_id: int
    external_ref: str | None
    title: str
    description: str | None
    is_critical: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SpecVersionOut(BaseModel):
    id: int
    session_id: int
    version_number: int
    status: SpecVersionStatus
    tz_text: str
    change_summary: str | None
    created_by_id: int | None
    source_message_id: int | None
    created_at: datetime
    requirements: list[RequirementOut] = []

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    submission_id: int
    stage_id: int | None = None
    command_id: str | None = None


class SessionOut(BaseModel):
    id: int
    submission_id: int
    contest_id: int
    customer_id: int
    executor_id: int
    stage_id: int | None
    current_state: ProtocolState
    current_spec_version_id: int | None
    pending_spec_version_id: int | None
    created_at: datetime
    updated_at: datetime
    current_spec_version: SpecVersionOut | None = None
    pending_spec_version: SpecVersionOut | None = None
    message_count: int = 0
    spec_version_count: int = 0

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    command_id: str | None = None
    message_type: MessageType
    content: str = Field(min_length=1)
    requirement_id: int | None = None
    proposed_tz_text: str | None = None
    metadata: dict = Field(default_factory=dict)


class MessageOut(BaseModel):
    id: int
    session_id: int
    message_type: MessageType
    author_id: int
    author_role: str
    content: str
    payload: dict
    task_state_at_send: ProtocolState
    spec_version_id: int | None
    requirement_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActionIn(BaseModel):
    command_id: str | None = None


class StructureReportOut(BaseModel):
    session_id: int
    submission_id: int
    current_state: ProtocolState
    total_messages: int
    total_spec_versions: int
    total_requirements: int
    messages_with_state_snapshot: int
    messages_with_spec_link: int
    messages_with_requirement_link: int
    applicable_requirement_messages: int
    applicable_requirement_messages_with_link: int
    audit_event_count: int
    processed_command_count: int
    state_snapshot_ratio: float
    spec_link_ratio: float
    requirement_link_ratio: float
    audit_coverage_ratio: float
    structural_connectedness_score: float


def _ensure_command_id(command_id: str | None) -> str:
    return command_id or str(uuid4())


def _hash_session_state(session: ProtocolSession) -> str:
    snapshot = {
        "session_id": session.id,
        "submission_id": session.submission_id,
        "contest_id": session.contest_id,
        "stage_id": session.stage_id,
        "current_state": session.current_state.value,
        "current_spec_version_id": session.current_spec_version_id,
        "pending_spec_version_id": session.pending_spec_version_id,
    }
    raw = json.dumps(snapshot, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


async def _load_session(session_id: int, db: AsyncSession) -> ProtocolSession | None:
    result = await db.execute(
        select(ProtocolSession)
        .options(
            selectinload(ProtocolSession.current_spec_version).selectinload(
                SpecVersion.requirements
            ),
            selectinload(ProtocolSession.pending_spec_version).selectinload(
                SpecVersion.requirements
            ),
            selectinload(ProtocolSession.spec_versions).selectinload(
                SpecVersion.requirements
            ),
            selectinload(ProtocolSession.messages),
            selectinload(ProtocolSession.commands),
        )
        .where(ProtocolSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def _load_session_by_submission(
    submission_id: int, db: AsyncSession
) -> ProtocolSession | None:
    result = await db.execute(
        select(ProtocolSession).where(ProtocolSession.submission_id == submission_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    return await _load_session(session.id, db)


async def _get_processed_command(
    command_id: str, db: AsyncSession
) -> ProtocolCommand | None:
    result = await db.execute(
        select(ProtocolCommand).where(ProtocolCommand.command_id == command_id)
    )
    return result.scalar_one_or_none()


async def _store_processed_command(
    *,
    command_id: str,
    session: ProtocolSession | None,
    submission_id: int | None,
    user: dict,
    operation_kind: str,
    payload: dict,
    db: AsyncSession,
):
    db.add(
        ProtocolCommand(
            command_id=command_id,
            session_id=session.id if session else None,
            submission_id=submission_id or (session.submission_id if session else None),
            actor_id=user["id"],
            actor_role=user["role"],
            operation_kind=operation_kind,
            result_payload=payload,
        )
    )


def _ensure_session_access(session: ProtocolSession, user: dict):
    if user["role"] == "admin":
        return
    if user["id"] not in {session.customer_id, session.executor_id}:
        raise HTTPException(status_code=403, detail="Forbidden")


def _ensure_customer_or_admin(session: ProtocolSession, user: dict):
    if user["role"] == "admin":
        return
    if user["id"] != session.customer_id:
        raise HTTPException(status_code=403, detail="Only the customer may do this")


def _ensure_executor_or_admin(session: ProtocolSession, user: dict):
    if user["role"] == "admin":
        return
    if user["id"] != session.executor_id:
        raise HTTPException(status_code=403, detail="Only the executor may do this")


def _ensure_participant(context: dict, user: dict):
    if user["role"] == "admin":
        return
    if user["id"] not in {context["customer_id"], context["executor_id"]}:
        raise HTTPException(status_code=403, detail="Forbidden")


def _validate_stage(context: dict, stage_id: int | None):
    if stage_id is None:
        return
    stage_ids = {stage["id"] for stage in context["stages"]}
    if stage_id not in stage_ids:
        raise HTTPException(status_code=400, detail="Stage does not belong to contest")


async def _get_requirement(
    requirement_id: int, session_id: int, db: AsyncSession
) -> RequirementItem:
    result = await db.execute(
        select(RequirementItem)
        .join(SpecVersion, RequirementItem.spec_version_id == SpecVersion.id)
        .where(RequirementItem.id == requirement_id, SpecVersion.session_id == session_id)
    )
    requirement = result.scalar_one_or_none()
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return requirement


def _session_out(session: ProtocolSession) -> dict:
    payload = SessionOut.model_validate(session).model_dump(mode="json")
    payload["message_count"] = len(session.messages)
    payload["spec_version_count"] = len(session.spec_versions)
    return payload


def _message_out(message: ProtocolMessage) -> dict:
    return MessageOut.model_validate(message).model_dump(mode="json")


def _require_session(session: ProtocolSession | None) -> ProtocolSession:
    if not session:
        raise HTTPException(status_code=404, detail="Protocol session not found")
    return session


async def _record_audit(
    *,
    command_id: str,
    session: ProtocolSession,
    user: dict,
    event_type: str,
    old_state: ProtocolState | None,
    new_state: ProtocolState | None,
    old_spec_version_id: int | None,
    new_spec_version_id: int | None,
    message_id: int | None,
    hash_before: str | None,
    hash_after: str | None,
    payload: dict,
):
    await create_audit_event(
        {
            "command_id": command_id,
            "correlation_id": command_id,
            "service_name": "protocol-service",
            "actor_id": user["id"],
            "actor_role": user["role"],
            "session_id": session.id,
            "submission_id": session.submission_id,
            "contest_id": session.contest_id,
            "message_id": message_id,
            "event_type": event_type,
            "old_state": old_state.value if old_state else None,
            "new_state": new_state.value if new_state else None,
            "old_spec_version_id": old_spec_version_id,
            "new_spec_version_id": new_spec_version_id,
            "hash_before": hash_before,
            "hash_after": hash_after,
            "payload": payload,
        }
    )


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    command_id = _ensure_command_id(data.command_id)
    processed = await _get_processed_command(command_id, db)
    if processed:
        return processed.result_payload

    context = await fetch_submission_context(data.submission_id)
    _ensure_participant(context, current_user)
    _validate_stage(context, data.stage_id)

    existing = await _load_session_by_submission(data.submission_id, db)
    if existing:
        payload = _session_out(existing)
        await _store_processed_command(
            command_id=command_id,
            session=existing,
            submission_id=existing.submission_id,
            user=current_user,
            operation_kind="session.get_or_create",
            payload=jsonable_encoder(payload),
            db=db,
        )
        await db.commit()
        return payload

    session = ProtocolSession(
        submission_id=context["submission_id"],
        contest_id=context["contest_id"],
        customer_id=context["customer_id"],
        executor_id=context["executor_id"],
        stage_id=data.stage_id,
        current_state=ProtocolState.draft,
    )
    db.add(session)
    await db.flush()

    initial_spec = SpecVersion(
        session_id=session.id,
        version_number=1,
        status=SpecVersionStatus.active,
        tz_text=context.get("tz_text") or "",
        created_by_id=current_user["id"],
        change_summary="Initial technical specification snapshot",
    )
    db.add(initial_spec)
    await db.flush()

    session.current_spec_version_id = initial_spec.id
    await db.flush()

    created = _require_session(await _load_session(session.id, db))
    payload = _session_out(created)
    await _record_audit(
        command_id=command_id,
        session=created,
        user=current_user,
        event_type="session.created",
        old_state=None,
        new_state=created.current_state,
        old_spec_version_id=None,
        new_spec_version_id=created.current_spec_version_id,
        message_id=None,
        hash_before=None,
        hash_after=_hash_session_state(created),
        payload={
            "submission_id": created.submission_id,
            "contest_id": created.contest_id,
            "stage_id": created.stage_id,
        },
    )
    await _store_processed_command(
        command_id=command_id,
        session=created,
        submission_id=created.submission_id,
        user=current_user,
        operation_kind="session.create",
        payload=jsonable_encoder(payload),
        db=db,
    )
    await db.commit()
    return payload


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)
    return _session_out(session)


@router.get("/sessions/by-submission/{submission_id}", response_model=SessionOut)
async def get_session_by_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session_by_submission(submission_id, db))
    _ensure_session_access(session, current_user)
    return _session_out(session)


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)
    return [_message_out(message) for message in session.messages]


@router.post("/sessions/{session_id}/messages", response_model=MessageOut, status_code=201)
async def create_message(
    session_id: int,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    command_id = _ensure_command_id(data.command_id)
    processed = await _get_processed_command(command_id, db)
    if processed:
        return processed.result_payload

    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)

    if session.current_state in FINAL_STATES:
        raise HTTPException(status_code=409, detail="The session is already finished")

    old_state = session.current_state
    old_spec_version_id = session.current_spec_version_id
    hash_before = _hash_session_state(session)
    requirement = None
    message_spec_version_id = session.current_spec_version_id
    payload = dict(data.metadata or {})

    if data.requirement_id is not None:
        requirement = await _get_requirement(data.requirement_id, session.id, db)

    if data.message_type in {MessageType.info, MessageType.clarification}:
        if session.current_state not in DISCUSSION_STATES:
            raise HTTPException(
                status_code=409,
                detail="This message type is not allowed in the current state",
            )
        if (
            data.message_type == MessageType.clarification
            and settings.strict_validation
            and data.requirement_id is None
        ):
            raise HTTPException(
                status_code=422,
                detail="requirement_id is required for clarification under strict_validation",
            )
    elif data.message_type == MessageType.scope_change:
        if session.current_state not in {ProtocolState.active, ProtocolState.rework}:
            raise HTTPException(
                status_code=409,
                detail="Scope change is only allowed in active or rework state",
            )
        if session.pending_spec_version_id is not None:
            raise HTTPException(
                status_code=409,
                detail="There is already a pending scope change",
            )
        if not data.proposed_tz_text:
            if settings.strict_validation:
                raise HTTPException(
                    status_code=422,
                    detail="proposed_tz_text is required for scope change under strict_validation",
                )
            data.proposed_tz_text = (
                "(relaxed mode: scope change without TZ text snapshot)"
            )
        max_version = await db.execute(
            select(func.max(SpecVersion.version_number)).where(
                SpecVersion.session_id == session.id
            )
        )
        next_version = (max_version.scalar() or 0) + 1
        pending_spec = SpecVersion(
            session_id=session.id,
            version_number=next_version,
            status=SpecVersionStatus.pending,
            tz_text=data.proposed_tz_text,
            change_summary=data.content,
            created_by_id=current_user["id"],
        )
        db.add(pending_spec)
        await db.flush()
        session.pending_spec_version_id = pending_spec.id
        session.current_state = ProtocolState.negotiation
        message_spec_version_id = pending_spec.id
        payload["proposed_tz_text"] = data.proposed_tz_text
    elif data.message_type == MessageType.submission:
        _ensure_executor_or_admin(session, current_user)
        if session.current_state not in {ProtocolState.active, ProtocolState.rework}:
            raise HTTPException(
                status_code=409,
                detail="Submission is only allowed in active or rework state",
            )
        session.current_state = ProtocolState.review
    elif data.message_type == MessageType.defect:
        _ensure_customer_or_admin(session, current_user)
        if session.current_state != ProtocolState.review:
            raise HTTPException(
                status_code=409,
                detail="Defect can only be sent while the session is in review",
            )
        if settings.strict_validation and data.requirement_id is None:
            raise HTTPException(
                status_code=422,
                detail="requirement_id is required for defect under strict_validation",
            )
        session.current_state = ProtocolState.rework

    message = ProtocolMessage(
        session_id=session.id,
        message_type=data.message_type,
        author_id=current_user["id"],
        author_role=current_user["role"],
        content=data.content,
        payload=payload,
        task_state_at_send=old_state,
        spec_version_id=message_spec_version_id,
        requirement_id=requirement.id if requirement else None,
    )
    db.add(message)
    await db.flush()

    if data.message_type == MessageType.scope_change:
        pending_spec = session.pending_spec_version or await db.get(
            SpecVersion, session.pending_spec_version_id
        )
        if pending_spec:
            pending_spec.source_message_id = message.id
            await db.flush()

    updated = _require_session(await _load_session(session.id, db))
    await _record_audit(
        command_id=command_id,
        session=updated,
        user=current_user,
        event_type=AUDIT_EVENT_BY_MESSAGE[data.message_type],
        old_state=old_state,
        new_state=updated.current_state,
        old_spec_version_id=old_spec_version_id,
        new_spec_version_id=updated.pending_spec_version_id
        if data.message_type == MessageType.scope_change
        else updated.current_spec_version_id,
        message_id=message.id,
        hash_before=hash_before,
        hash_after=_hash_session_state(updated),
        payload={
            "message_type": data.message_type.value,
            "content": data.content,
            "requirement_id": requirement.id if requirement else None,
        },
    )
    response_payload = _message_out(message)
    await _store_processed_command(
        command_id=command_id,
        session=updated,
        submission_id=updated.submission_id,
        user=current_user,
        operation_kind=f"message.{data.message_type.value}",
        payload=jsonable_encoder(response_payload),
        db=db,
    )
    await db.commit()
    return response_payload


@router.post(
    "/sessions/{session_id}/actions/{action_name}",
    response_model=SessionOut,
)
async def apply_action(
    session_id: int,
    action_name: str,
    data: ActionIn,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if action_name not in AUDIT_EVENT_BY_ACTION:
        raise HTTPException(status_code=404, detail="Unknown action")

    command_id = _ensure_command_id(data.command_id)
    processed = await _get_processed_command(command_id, db)
    if processed:
        return processed.result_payload

    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)

    old_state = session.current_state
    old_spec_version_id = session.current_spec_version_id
    hash_before = _hash_session_state(session)

    if action_name == "start":
        _ensure_customer_or_admin(session, current_user)
        if session.current_state != ProtocolState.draft:
            raise HTTPException(status_code=409, detail="Only draft sessions can start")
        session.current_state = ProtocolState.active
    elif action_name == "approve-scope-change":
        if session.current_state != ProtocolState.negotiation:
            raise HTTPException(
                status_code=409, detail="No pending scope change to approve"
            )
        pending_spec = session.pending_spec_version
        if not pending_spec:
            raise HTTPException(status_code=409, detail="No pending spec version")
        if current_user["role"] != "admin" and pending_spec.created_by_id == current_user["id"]:
            raise HTTPException(
                status_code=403,
                detail="The same actor cannot approve their own scope change",
            )
        if session.current_spec_version:
            session.current_spec_version.status = SpecVersionStatus.superseded
        pending_spec.status = SpecVersionStatus.active
        session.current_spec_version_id = pending_spec.id
        session.pending_spec_version_id = None
        session.current_state = ProtocolState.active
    elif action_name == "reject-scope-change":
        if session.current_state != ProtocolState.negotiation:
            raise HTTPException(
                status_code=409, detail="No pending scope change to reject"
            )
        pending_spec = session.pending_spec_version
        if not pending_spec:
            raise HTTPException(status_code=409, detail="No pending spec version")
        if current_user["role"] != "admin" and pending_spec.created_by_id == current_user["id"]:
            raise HTTPException(
                status_code=403,
                detail="The same actor cannot reject their own scope change",
            )
        pending_spec.status = SpecVersionStatus.rejected
        session.pending_spec_version_id = None
        session.current_state = ProtocolState.active
    elif action_name == "accept":
        _ensure_customer_or_admin(session, current_user)
        if session.current_state != ProtocolState.review:
            raise HTTPException(status_code=409, detail="Only review sessions can be accepted")
        session.current_state = ProtocolState.done
    elif action_name == "cancel":
        _ensure_customer_or_admin(session, current_user)
        if session.current_state in FINAL_STATES:
            raise HTTPException(status_code=409, detail="The session is already final")
        session.current_state = ProtocolState.cancelled

    updated = _require_session(await _load_session(session.id, db))
    await _record_audit(
        command_id=command_id,
        session=updated,
        user=current_user,
        event_type=AUDIT_EVENT_BY_ACTION[action_name],
        old_state=old_state,
        new_state=updated.current_state,
        old_spec_version_id=old_spec_version_id,
        new_spec_version_id=updated.current_spec_version_id,
        message_id=None,
        hash_before=hash_before,
        hash_after=_hash_session_state(updated),
        payload={"action": action_name},
    )
    response_payload = _session_out(updated)
    await _store_processed_command(
        command_id=command_id,
        session=updated,
        submission_id=updated.submission_id,
        user=current_user,
        operation_kind=f"action.{action_name}",
        payload=jsonable_encoder(response_payload),
        db=db,
    )
    await db.commit()
    return response_payload


@router.get("/sessions/{session_id}/spec-versions", response_model=list[SpecVersionOut])
async def list_spec_versions(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)
    return [
        SpecVersionOut.model_validate(spec).model_dump(mode="json")
        for spec in session.spec_versions
    ]


@router.get(
    "/sessions/{session_id}/spec-versions/{version_id}/requirements",
    response_model=list[RequirementOut],
)
async def list_requirements(
    session_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)
    version = next((spec for spec in session.spec_versions if spec.id == version_id), None)
    if not version:
        raise HTTPException(status_code=404, detail="Spec version not found")
    return [
        RequirementOut.model_validate(requirement).model_dump(mode="json")
        for requirement in version.requirements
    ]


@router.post(
    "/sessions/{session_id}/spec-versions/{version_id}/requirements",
    response_model=RequirementOut,
    status_code=201,
)
async def create_requirement(
    session_id: int,
    version_id: int,
    data: RequirementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    command_id = _ensure_command_id(data.command_id)
    processed = await _get_processed_command(command_id, db)
    if processed:
        return processed.result_payload

    session = _require_session(await _load_session(session_id, db))
    _ensure_customer_or_admin(session, current_user)
    version = next((spec for spec in session.spec_versions if spec.id == version_id), None)
    if not version:
        raise HTTPException(status_code=404, detail="Spec version not found")

    hash_before = _hash_session_state(session)
    requirement = RequirementItem(
        spec_version_id=version.id,
        external_ref=data.external_ref,
        title=data.title,
        description=data.description,
        is_critical=data.is_critical,
    )
    db.add(requirement)
    await db.flush()

    updated = _require_session(await _load_session(session.id, db))
    await _record_audit(
        command_id=command_id,
        session=updated,
        user=current_user,
        event_type="spec.requirement_added",
        old_state=session.current_state,
        new_state=updated.current_state,
        old_spec_version_id=version.id,
        new_spec_version_id=version.id,
        message_id=None,
        hash_before=hash_before,
        hash_after=_hash_session_state(updated),
        payload={
            "spec_version_id": version.id,
            "requirement_id": requirement.id,
            "title": requirement.title,
            "is_critical": requirement.is_critical,
        },
    )
    response_payload = RequirementOut.model_validate(requirement).model_dump(mode="json")
    await _store_processed_command(
        command_id=command_id,
        session=updated,
        submission_id=updated.submission_id,
        user=current_user,
        operation_kind="spec.requirement_added",
        payload=jsonable_encoder(response_payload),
        db=db,
    )
    await db.commit()
    return response_payload


@router.get("/sessions/{session_id}/timeline")
async def get_timeline(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)
    return await fetch_audit_events(session.id)


@router.get("/sessions/{session_id}/structure-report", response_model=StructureReportOut)
async def get_structure_report(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    session = _require_session(await _load_session(session_id, db))
    _ensure_session_access(session, current_user)

    total_messages = len(session.messages)
    total_spec_versions = len(session.spec_versions)
    total_requirements = sum(len(spec.requirements) for spec in session.spec_versions)
    messages_with_state_snapshot = sum(
        1 for message in session.messages if message.task_state_at_send is not None
    )
    messages_with_spec_link = sum(
        1 for message in session.messages if message.spec_version_id is not None
    )
    messages_with_requirement_link = sum(
        1 for message in session.messages if message.requirement_id is not None
    )
    applicable_requirement_messages = sum(
        1
        for message in session.messages
        if message.message_type in {MessageType.clarification, MessageType.defect}
    )
    applicable_requirement_messages_with_link = sum(
        1
        for message in session.messages
        if message.message_type in {MessageType.clarification, MessageType.defect}
        and message.requirement_id is not None
    )
    timeline = await fetch_audit_events(session.id)
    audit_event_count = len(timeline)
    processed_command_count = len(session.commands)

    state_snapshot_ratio = round(
        messages_with_state_snapshot / total_messages if total_messages else 1.0, 3
    )
    spec_link_ratio = round(
        messages_with_spec_link / total_messages if total_messages else 1.0, 3
    )
    requirement_link_ratio = round(
        applicable_requirement_messages_with_link / applicable_requirement_messages
        if applicable_requirement_messages
        else 1.0,
        3,
    )
    audit_coverage_ratio = round(
        min(audit_event_count / processed_command_count, 1.0)
        if processed_command_count
        else 1.0,
        3,
    )
    structural_connectedness_score = round(
        (
            state_snapshot_ratio
            + spec_link_ratio
            + requirement_link_ratio
            + audit_coverage_ratio
        )
        / 4,
        3,
    )

    return StructureReportOut(
        session_id=session.id,
        submission_id=session.submission_id,
        current_state=session.current_state,
        total_messages=total_messages,
        total_spec_versions=total_spec_versions,
        total_requirements=total_requirements,
        messages_with_state_snapshot=messages_with_state_snapshot,
        messages_with_spec_link=messages_with_spec_link,
        messages_with_requirement_link=messages_with_requirement_link,
        applicable_requirement_messages=applicable_requirement_messages,
        applicable_requirement_messages_with_link=applicable_requirement_messages_with_link,
        audit_event_count=audit_event_count,
        processed_command_count=processed_command_count,
        state_snapshot_ratio=state_snapshot_ratio,
        spec_link_ratio=spec_link_ratio,
        requirement_link_ratio=requirement_link_ratio,
        audit_coverage_ratio=audit_coverage_ratio,
        structural_connectedness_score=structural_connectedness_score,
    )
