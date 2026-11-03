"""
Интеграционные тесты чата (contest-service): REST /chat/* и WebSocket /ws/chat.
Исполнитель = executor_token (есть решение в contest), заказчик = customer_token (владелец contest),
посторонний = outsider_token.
"""

import asyncio
import base64
import json

import httpx
import pytest
import pytest_asyncio
import websockets
from websockets.exceptions import ConnectionClosed

from conftest import (
    CONTEST_URL,
    GATEWAY_URL,
    USER_URL,
    auth_headers,
    register_user,
)

CONTEST_WS = CONTEST_URL.replace("http", "ws", 1)
GATEWAY_WS = GATEWAY_URL.replace("http", "ws", 1)


def user_id_of(token: str) -> int:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return int(json.loads(base64.urlsafe_b64decode(payload))["sub"])


async def open_conv(token: str, contest_id: int, executor_id: int | None = None):
    body = {"contest_id": contest_id}
    if executor_id is not None:
        body["executor_id"] = executor_id
    async with httpx.AsyncClient() as c:
        return await c.post(
            f"{CONTEST_URL}/chat/conversations", json=body, headers=auth_headers(token)
        )


async def send(token: str, conv_id: int, text: str):
    async with httpx.AsyncClient() as c:
        return await c.post(
            f"{CONTEST_URL}/chat/conversations/{conv_id}/messages",
            json={"text": text},
            headers=auth_headers(token),
        )


async def get_json(token: str, path: str, **params):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}{path}", params=params, headers=auth_headers(token))
        assert r.status_code == 200, r.text
        return r.json()


async def recv_event(ws, expected_type: str, timeout: float = 5.0) -> dict:
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        raw = await asyncio.wait_for(ws.recv(), timeout=max(remaining, 0.1))
        event = json.loads(raw)
        if event.get("type") == expected_type:
            return event


@pytest_asyncio.fixture
async def conv(customer_token, executor_token, contest, submission):
    """Беседа заказчик <-> исполнитель по тестовому конкурсу (open-or-get)."""
    r = await open_conv(customer_token, contest["id"], user_id_of(executor_token))
    assert r.status_code == 200, r.text
    return r.json()


# ── Открытие беседы ──────────────────────────────────────────────────────────


async def test_customer_and_executor_open_same_conversation(
    customer_token, executor_token, contest, submission
):
    exec_id = user_id_of(executor_token)
    cust_id = user_id_of(customer_token)

    r1 = await open_conv(customer_token, contest["id"], exec_id)
    assert r1.status_code == 200, r1.text
    r2 = await open_conv(executor_token, contest["id"])
    assert r2.status_code == 200, r2.text

    a, b = r1.json(), r2.json()
    assert a["id"] == b["id"], "open-or-get должен вернуть ту же беседу"
    assert a["customer_id"] == cust_id and a["executor_id"] == exec_id
    assert a["contest_id"] == contest["id"]
    assert a["other_user_id"] == exec_id and b["other_user_id"] == cust_id


async def test_customer_cannot_open_chat_with_user_without_submission(
    customer_token, contest, submission
):
    stranger = await register_user("executor")
    r = await open_conv(customer_token, contest["id"], user_id_of(stranger))
    assert r.status_code == 403, r.text


async def test_customer_requires_executor_id(customer_token, contest):
    r = await open_conv(customer_token, contest["id"])
    assert r.status_code == 422, r.text


async def test_foreign_customer_cannot_open_chat_for_contest(
    outsider_token, executor_token, contest, submission
):
    r = await open_conv(outsider_token, contest["id"], user_id_of(executor_token))
    assert r.status_code == 403, r.text


async def test_executor_cannot_open_chat_as_someone_else(
    executor_token, customer_token, contest
):
    r = await open_conv(executor_token, contest["id"], user_id_of(customer_token))
    assert r.status_code == 403, r.text


async def test_open_chat_for_missing_contest_is_404(executor_token):
    r = await open_conv(executor_token, 99999999)
    assert r.status_code == 404, r.text


async def test_unauthenticated_requests_rejected():
    async with httpx.AsyncClient() as c:
        assert (await c.get(f"{CONTEST_URL}/chat/conversations")).status_code == 401
        assert (await c.get(f"{CONTEST_URL}/chat/unread-count")).status_code == 401


# ── Сообщения ────────────────────────────────────────────────────────────────


async def test_exchange_messages_in_ascending_order(customer_token, executor_token, conv):
    r1 = await send(customer_token, conv["id"], "  Привет, есть вопросы по ТЗ  ")
    assert r1.status_code == 201, r1.text
    assert r1.json()["text"] == "Привет, есть вопросы по ТЗ", "текст должен обрезаться"
    assert r1.json()["sender_id"] == user_id_of(customer_token)
    assert r1.json()["read_at"] is None

    r2 = await send(executor_token, conv["id"], "Да, уточните формат файлов")
    assert r2.status_code == 201, r2.text

    for tok in (customer_token, executor_token):
        msgs = await get_json(tok, f"/chat/conversations/{conv['id']}/messages")
        ids = [m["id"] for m in msgs]
        assert ids == sorted(ids)
        texts = [m["text"] for m in msgs]
        assert texts[-2:] == ["Привет, есть вопросы по ТЗ", "Да, уточните формат файлов"]


async def test_messages_pagination_before_id_and_limit(customer_token, conv):
    ids = []
    for i in range(5):
        r = await send(customer_token, conv["id"], f"page-{i}")
        ids.append(r.json()["id"])

    last3 = await get_json(customer_token, f"/chat/conversations/{conv['id']}/messages", limit=3)
    assert [m["id"] for m in last3] == ids[-3:], "limit отдаёт самые свежие, по возрастанию"

    older = await get_json(
        customer_token,
        f"/chat/conversations/{conv['id']}/messages",
        before_id=ids[-3],
        limit=2,
    )
    assert [m["id"] for m in older] == ids[-5:-3] or [m["id"] for m in older][-1] < ids[-3]
    assert all(m["id"] < ids[-3] for m in older)


@pytest.mark.parametrize("bad", ["", "   ", "\n\t "])
async def test_empty_or_whitespace_message_rejected(customer_token, conv, bad):
    r = await send(customer_token, conv["id"], bad)
    assert r.status_code == 422, r.text


async def test_too_long_message_rejected_and_max_accepted(customer_token, conv):
    assert (await send(customer_token, conv["id"], "x" * 4001)).status_code == 422
    assert (await send(customer_token, conv["id"], "y" * 4000)).status_code == 201


async def test_third_user_gets_403_on_read_send_and_list(
    customer_token, outsider_token, conv
):
    cid = conv["id"]
    async with httpx.AsyncClient() as c:
        h = auth_headers(outsider_token)
        assert (await c.get(f"{CONTEST_URL}/chat/conversations/{cid}/messages", headers=h)).status_code == 403
        assert (await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/messages", json={"text": "hi"}, headers=h)).status_code == 403
        assert (await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/read", headers=h)).status_code == 403

    # и беседа не светится в его списке
    mine = await get_json(outsider_token, "/chat/conversations")
    assert cid not in [x["id"] for x in mine]


async def test_unknown_conversation_is_404(customer_token):
    r = await send(customer_token, 99999999, "hello")
    assert r.status_code == 404


# ── Непрочитанные ────────────────────────────────────────────────────────────


async def test_unread_count_increases_for_recipient_and_resets_after_read(
    customer_token, executor_token, conv
):
    cid = conv["id"]
    # Начинаем с чистого состояния: исполнитель читает всё накопленное
    async with httpx.AsyncClient() as c:
        await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/read", headers=auth_headers(executor_token))
        await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/read", headers=auth_headers(customer_token))

    base_total = (await get_json(executor_token, "/chat/unread-count"))["unread_count"]

    await send(customer_token, cid, "unread-1")
    await send(customer_token, cid, "unread-2")

    # у отправителя непрочитанных нет
    own = await get_json(customer_token, "/chat/conversations")
    assert next(x for x in own if x["id"] == cid)["unread_count"] == 0

    lst = await get_json(executor_token, "/chat/conversations")
    assert next(x for x in lst if x["id"] == cid)["unread_count"] == 2
    assert (await get_json(executor_token, "/chat/unread-count"))["unread_count"] == base_total + 2

    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/read", headers=auth_headers(executor_token))
        assert r.status_code == 200, r.text

    lst = await get_json(executor_token, "/chat/conversations")
    assert next(x for x in lst if x["id"] == cid)["unread_count"] == 0
    assert (await get_json(executor_token, "/chat/unread-count"))["unread_count"] == base_total

    # Отправитель видит read_at у своих сообщений
    msgs = await get_json(customer_token, f"/chat/conversations/{cid}/messages")
    mine = [m for m in msgs if m["text"] in ("unread-1", "unread-2")]
    assert len(mine) == 2 and all(m["read_at"] for m in mine)


async def test_reading_does_not_mark_own_messages(customer_token, executor_token, conv):
    cid = conv["id"]
    await send(customer_token, cid, "own-message-stays-unread-for-peer")
    async with httpx.AsyncClient() as c:
        # заказчик «читает» свою же беседу — сообщение для исполнителя остаётся непрочитанным
        await c.post(f"{CONTEST_URL}/chat/conversations/{cid}/read", headers=auth_headers(customer_token))
    lst = await get_json(executor_token, "/chat/conversations")
    assert next(x for x in lst if x["id"] == cid)["unread_count"] >= 1


# ── Список бесед ─────────────────────────────────────────────────────────────


async def test_conversations_list_shows_other_login_last_message_and_contest(
    customer_token, executor_token, contest, conv
):
    await send(executor_token, conv["id"], "Последнее сообщение для превью")

    async with httpx.AsyncClient() as c:
        exec_login = (await c.get(f"{USER_URL}/users/{user_id_of(executor_token)}")).json()["login"]
        cust_login = (await c.get(f"{USER_URL}/users/{user_id_of(customer_token)}")).json()["login"]

    cust_list = await get_json(customer_token, "/chat/conversations")
    item = next(x for x in cust_list if x["id"] == conv["id"])
    assert item["other_user_login"] == exec_login
    assert item["last_message"]["text"] == "Последнее сообщение для превью"
    assert item["last_message"]["sender_id"] == user_id_of(executor_token)
    assert item["contest_title"] == contest["title"]
    assert item["contest_number"] == contest["number"]

    exec_list = await get_json(executor_token, "/chat/conversations")
    item = next(x for x in exec_list if x["id"] == conv["id"])
    assert item["other_user_login"] == cust_login


async def test_conversations_sorted_by_last_message_desc(
    customer_token, executor_token, admin_token, contest, conv, contest_type_id
):
    """Новая активность поднимает беседу наверх списка."""
    import datetime

    import pytz

    async with httpx.AsyncClient() as c:
        ends_at = (datetime.datetime.now(pytz.utc) + datetime.timedelta(days=10)).isoformat()
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": "Chat order contest",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "tz",
                "prizepool": 1000,
                "ends_at": ends_at,
                "type_id": contest_type_id,
                "stages": [{"name": "Этап 1", "order": 1}],
            },
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 201, r.text
        other_contest = r.json()
        try:
            # исполнитель сам открывает беседу в draft-конкурсе — запрещено (нет решения, не active)
            r = await open_conv(executor_token, other_contest["id"])
            assert r.status_code == 403, r.text

            r = await c.post(
                f"{CONTEST_URL}/submissions",
                json={
                    "contest_id": other_contest["id"],
                    "title": "S2",
                    "annotation": "A" * 30,
                    "description": "D" * 100,
                },
                headers=auth_headers(executor_token),
            )
            assert r.status_code == 201, r.text
            r = await open_conv(customer_token, other_contest["id"], user_id_of(executor_token))
            assert r.status_code == 200, r.text
            conv2 = r.json()

            await send(customer_token, conv2["id"], "second first")
            lst = await get_json(customer_token, "/chat/conversations")
            ids = [x["id"] for x in lst]
            assert ids.index(conv2["id"]) < ids.index(conv["id"])

            await send(customer_token, conv["id"], "bump first")
            lst = await get_json(customer_token, "/chat/conversations")
            ids = [x["id"] for x in lst]
            assert ids.index(conv["id"]) < ids.index(conv2["id"])
        finally:
            await c.delete(
                f"{CONTEST_URL}/contests/{other_contest['id']}",
                headers=auth_headers(admin_token),
            )


# ── WebSocket ────────────────────────────────────────────────────────────────


async def test_ws_recipient_receives_message_event_after_rest_send(
    customer_token, executor_token, conv
):
    async with websockets.connect(f"{CONTEST_WS}/ws/chat?token={executor_token}") as ws:
        r = await send(customer_token, conv["id"], "ws-live-message")
        assert r.status_code == 201
        event = await recv_event(ws, "message")
        assert event["conversation_id"] == conv["id"]
        assert event["message"]["text"] == "ws-live-message"
        assert event["message"]["id"] == r.json()["id"]
        assert event["message"]["sender_id"] == user_id_of(customer_token)


async def test_ws_multiple_tabs_and_sender_receive_event(customer_token, executor_token, conv):
    url = f"{CONTEST_WS}/ws/chat?token="
    async with websockets.connect(url + executor_token) as tab1, websockets.connect(
        url + executor_token
    ) as tab2, websockets.connect(url + customer_token) as sender:
        await send(customer_token, conv["id"], "to-all-tabs")
        for ws in (tab1, tab2, sender):
            event = await recv_event(ws, "message")
            assert event["message"]["text"] == "to-all-tabs"


async def test_ws_outsider_does_not_receive_message(customer_token, outsider_token, conv):
    async with websockets.connect(f"{CONTEST_WS}/ws/chat?token={outsider_token}") as ws:
        await send(customer_token, conv["id"], "private")
        with pytest.raises(asyncio.TimeoutError):
            await recv_event(ws, "message", timeout=1.0)


async def test_ws_read_event_delivered_to_sender(customer_token, executor_token, conv):
    await send(customer_token, conv["id"], "will-be-read")
    async with websockets.connect(f"{CONTEST_WS}/ws/chat?token={customer_token}") as ws:
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{CONTEST_URL}/chat/conversations/{conv['id']}/read",
                headers=auth_headers(executor_token),
            )
            assert r.status_code == 200
        event = await recv_event(ws, "read")
        assert event["conversation_id"] == conv["id"]
        assert event["reader_id"] == user_id_of(executor_token)


async def test_ws_typing_relayed_to_other_participant_only(
    customer_token, executor_token, outsider_token, conv
):
    url = f"{CONTEST_WS}/ws/chat?token="
    async with websockets.connect(url + customer_token) as cust, websockets.connect(
        url + executor_token
    ) as execu:
        await cust.send(json.dumps({"type": "typing", "conversation_id": conv["id"]}))
        event = await recv_event(execu, "typing")
        assert event == {
            "type": "typing",
            "conversation_id": conv["id"],
            "user_id": user_id_of(customer_token),
        }

    # Посторонний не может «печатать» в чужой беседе — собеседнику ничего не приходит
    async with websockets.connect(url + customer_token) as cust, websockets.connect(
        url + outsider_token
    ) as out:
        await out.send(json.dumps({"type": "typing", "conversation_id": conv["id"]}))
        with pytest.raises(asyncio.TimeoutError):
            await recv_event(cust, "typing", timeout=1.0)


async def test_ws_ping_pong_and_garbage_does_not_kill_connection(executor_token):
    async with websockets.connect(f"{CONTEST_WS}/ws/chat?token={executor_token}") as ws:
        await ws.send("not json at all")
        await ws.send(json.dumps([1, 2, 3]))
        await ws.send(json.dumps({"type": "typing", "conversation_id": "x"}))
        await ws.send(json.dumps({"type": "ping"}))
        assert json.loads(await asyncio.wait_for(ws.recv(), 5)) == {"type": "pong"}


@pytest.mark.parametrize("query", ["?token=not-a-jwt", "", "?token="])
async def test_ws_invalid_token_rejected_with_4401(query):
    try:
        async with websockets.connect(f"{CONTEST_WS}/ws/chat{query}") as ws:
            await asyncio.wait_for(ws.recv(), timeout=5)
        pytest.fail("соединение с невалидным токеном не должно жить")
    except ConnectionClosed as exc:
        assert exc.rcvd is not None and exc.rcvd.code == 4401


async def test_ws_works_through_gateway(customer_token, executor_token, conv):
    async with websockets.connect(f"{GATEWAY_WS}/ws/chat?token={executor_token}") as ws:
        await ws.send(json.dumps({"type": "ping"}))
        assert json.loads(await asyncio.wait_for(ws.recv(), 5)) == {"type": "pong"}
        await send(customer_token, conv["id"], "via-gateway")
        event = await recv_event(ws, "message")
        assert event["message"]["text"] == "via-gateway"


async def test_ws_dead_socket_does_not_break_delivery(customer_token, executor_token, conv):
    url = f"{CONTEST_WS}/ws/chat?token="
    dead = await websockets.connect(url + executor_token)
    await dead.close()
    async with websockets.connect(url + executor_token) as alive:
        r = await send(customer_token, conv["id"], "after-dead-socket")
        assert r.status_code == 201
        event = await recv_event(alive, "message")
        assert event["message"]["text"] == "after-dead-socket"
