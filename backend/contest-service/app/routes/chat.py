import asyncio
from datetime import datetime, timezone

import jwt
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat_manager import manager
from app.clients import get_user
from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, Contest, ContestStatus, Conversation, Submission

router = APIRouter(prefix="/chat", tags=["chat"])
ws_router = APIRouter(tags=["chat"])

MAX_MESSAGE_LEN = 4000


# ── Schemas ──────────────────────────────────────────────────────────────────


class ConversationOpen(BaseModel):
    contest_id: int
    executor_id: int | None = None


class MessageCreate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def _validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message must not be empty")
        if len(v) > MAX_MESSAGE_LEN:
            raise ValueError(f"Message must be at most {MAX_MESSAGE_LEN} characters")
        return v


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    text: str
    created_at: datetime
    read_at: datetime | None = None

    model_config = {"from_attributes": True}


class LastMessageOut(BaseModel):
    id: int
    sender_id: int
    text: str
    created_at: datetime


class ConversationOut(BaseModel):
    id: int
    contest_id: int
    customer_id: int
    executor_id: int
    created_at: datetime
    last_message_at: datetime | None = None
    contest_title: str | None = None
    contest_number: int | None = None
    other_user_id: int | None = None
    other_user_login: str | None = None
    last_message: LastMessageOut | None = None
    unread_count: int = 0


# ── Helpers ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _other_id(conv: Conversation, user_id: int) -> int:
    return conv.executor_id if conv.customer_id == user_id else conv.customer_id


async def _get_participant_conversation(
    conversation_id: int, user: dict, db: AsyncSession
) -> Conversation:
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["id"] not in (conv.customer_id, conv.executor_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return conv


async def _has_submission(db: AsyncSession, contest_id: int, executor_id: int) -> bool:
    row = await db.execute(
        select(Submission.id)
        .where(Submission.contest_id == contest_id, Submission.executor_id == executor_id)
        .limit(1)
    )
    return row.first() is not None


async def _enrich_conversations(
    convs: list[Conversation], me: int, db: AsyncSession
) -> list[ConversationOut]:
    if not convs:
        return []
    conv_ids = [c.id for c in convs]
    contest_ids = list({c.contest_id for c in convs})

    c_rows = await db.execute(
        select(Contest.id, Contest.title, Contest.number).where(Contest.id.in_(contest_ids))
    )
    contest_map = {r[0]: (r[1], r[2]) for r in c_rows}

    other_ids = list({_other_id(c, me) for c in convs})
    users = await asyncio.gather(*[get_user(uid) for uid in other_ids])
    login_map = {u["id"]: u["login"] for u in users if u}

    unread_rows = await db.execute(
        select(ChatMessage.conversation_id, func.count(ChatMessage.id))
        .where(
            ChatMessage.conversation_id.in_(conv_ids),
            ChatMessage.sender_id != me,
            ChatMessage.read_at.is_(None),
        )
        .group_by(ChatMessage.conversation_id)
    )
    unread_map = {r[0]: r[1] for r in unread_rows}

    # Последнее сообщение каждой беседы
    last_ids = (
        select(func.max(ChatMessage.id))
        .where(ChatMessage.conversation_id.in_(conv_ids))
        .group_by(ChatMessage.conversation_id)
    )
    last_rows = await db.execute(select(ChatMessage).where(ChatMessage.id.in_(last_ids)))
    last_map = {m.conversation_id: m for m in last_rows.scalars()}

    result = []
    for c in convs:
        other = _other_id(c, me)
        title, number = contest_map.get(c.contest_id, (None, None))
        last = last_map.get(c.id)
        result.append(
            ConversationOut(
                id=c.id,
                contest_id=c.contest_id,
                customer_id=c.customer_id,
                executor_id=c.executor_id,
                created_at=c.created_at,
                last_message_at=c.last_message_at,
                contest_title=title,
                contest_number=number,
                other_user_id=other,
                other_user_login=login_map.get(other) or f"Пользователь #{other}",
                last_message=(
                    LastMessageOut(
                        id=last.id,
                        sender_id=last.sender_id,
                        text=last.text[:120],
                        created_at=last.created_at,
                    )
                    if last
                    else None
                ),
                unread_count=unread_map.get(c.id, 0),
            )
        )
    return result


# ── REST ─────────────────────────────────────────────────────────────────────


@router.post("/conversations", response_model=ConversationOut)
async def open_conversation(
    data: ConversationOpen,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    contest = await db.get(Contest, data.contest_id)
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    role = user["role"]
    if role == "executor":
        if data.executor_id is not None and data.executor_id != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        executor_id = user["id"]
        if contest.status != ContestStatus.active and not await _has_submission(
            db, contest.id, executor_id
        ):
            raise HTTPException(status_code=403, detail="Contest is not available for chat")
    elif role == "customer":
        if contest.customer_id != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        if data.executor_id is None:
            raise HTTPException(status_code=422, detail="executor_id is required")
        executor_id = data.executor_id
        if not await _has_submission(db, contest.id, executor_id):
            raise HTTPException(
                status_code=403, detail="Executor has no submission in this contest"
            )
    elif role == "admin":
        if data.executor_id is None:
            raise HTTPException(status_code=422, detail="executor_id is required")
        executor_id = data.executor_id
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    async def _find() -> Conversation | None:
        r = await db.execute(
            select(Conversation).where(
                Conversation.contest_id == contest.id,
                Conversation.executor_id == executor_id,
            )
        )
        return r.scalar_one_or_none()

    conv = await _find()
    if not conv:
        conv = Conversation(
            contest_id=contest.id,
            customer_id=contest.customer_id,
            executor_id=executor_id,
        )
        db.add(conv)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            conv = await _find()
        else:
            await db.refresh(conv)

    return (await _enrich_conversations([conv], user["id"], db))[0]


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    uid = user["id"]
    result = await db.execute(
        select(Conversation)
        .where(or_(Conversation.customer_id == uid, Conversation.executor_id == uid))
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
    )
    return await _enrich_conversations(list(result.scalars()), uid, db)


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    uid = user["id"]
    result = await db.execute(
        select(func.count(ChatMessage.id))
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(
            or_(Conversation.customer_id == uid, Conversation.executor_id == uid),
            ChatMessage.sender_id != uid,
            ChatMessage.read_at.is_(None),
        )
    )
    return {"unread_count": result.scalar() or 0}


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: int,
    before_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_participant_conversation(conversation_id, user, db)
    stmt = select(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
    if before_id is not None:
        stmt = stmt.where(ChatMessage.id < before_id)
    result = await db.execute(stmt.order_by(ChatMessage.id.desc()).limit(limit))
    return list(reversed(result.scalars().all()))


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
)
async def send_message(
    conversation_id: int,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    conv = await _get_participant_conversation(conversation_id, user, db)
    now = _now()
    msg = ChatMessage(
        conversation_id=conv.id, sender_id=user["id"], text=data.text, created_at=now
    )
    db.add(msg)
    conv.last_message_at = now
    await db.commit()
    await db.refresh(msg)

    out = MessageOut.model_validate(msg)
    event = {
        "type": "message",
        "conversation_id": conv.id,
        "message": out.model_dump(mode="json"),
    }
    await asyncio.gather(
        manager.send_to_user(conv.customer_id, event),
        manager.send_to_user(conv.executor_id, event),
    )
    return out


@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    conv = await _get_participant_conversation(conversation_id, user, db)
    result = await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.conversation_id == conv.id,
            ChatMessage.sender_id != user["id"],
            ChatMessage.read_at.is_(None),
        )
        .values(read_at=_now())
    )
    await db.commit()
    if result.rowcount:
        await manager.send_to_user(
            _other_id(conv, user["id"]),
            {"type": "read", "conversation_id": conv.id, "reader_id": user["id"]},
        )
    return {"marked": result.rowcount or 0}


# ── WebSocket ────────────────────────────────────────────────────────────────


@ws_router.websocket("/ws/chat")
async def chat_ws(websocket: WebSocket, token: str | None = None):
    try:
        if not token:
            raise jwt.InvalidTokenError("missing token")
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        # Сначала accept, иначе клиент увидит HTTP 403 вместо кода закрытия 4401
        await websocket.accept()
        await websocket.close(code=4401)
        return

    await websocket.accept()
    manager.connect(user_id, websocket)
    try:
        while True:
            try:
                data = await websocket.receive_json()
            except ValueError:
                continue  # невалидный JSON игнорируем
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
            elif kind == "typing":
                conv_id = data.get("conversation_id")
                if not isinstance(conv_id, int) or isinstance(conv_id, bool):
                    continue
                async with AsyncSessionLocal() as db:
                    conv = await db.get(Conversation, conv_id)
                if conv and user_id in (conv.customer_id, conv.executor_id):
                    await manager.send_to_user(
                        _other_id(conv, user_id),
                        {"type": "typing", "conversation_id": conv.id, "user_id": user_id},
                    )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(user_id, websocket)
