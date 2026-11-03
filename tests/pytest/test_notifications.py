"""
Задача 2: контроль приёма решений (статус/срок конкурса) и email-уведомления (Mailpit).
Почтовые тесты пропускаются, если Mailpit недоступен.
"""

import asyncio
import datetime
import os
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
import pytz
from conftest import (
    CONTEST_URL,
    INTERNAL_SECRET,
    PAYMENT_URL,
    USER_URL,
    auth_headers,
    register_user,
)

MAILPIT_URL = os.getenv("PYTEST_MAILPIT_URL", "http://localhost:8025")
INTERNAL = {"x-internal-secret": INTERNAL_SECRET}

_created_contests: list[int] = []


def _iso(days: float) -> str:
    return (
        datetime.datetime.now(pytz.utc) + datetime.timedelta(days=days)
    ).isoformat()


async def _profile(token: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _make_contest(customer_token, type_id, *, state="active", ends_in_days=30):
    """Создаёт конкурс в нужном состоянии: draft | active | cancelled."""
    title = f"Notif {state} {uuid4().hex[:6]}"
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": title,
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ",
                "prizepool": 3000,
                "ends_at": _iso(ends_in_days),
                "type_id": type_id,
                "stages": [],
            },
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 201, r.text
        data = r.json()
        _created_contests.append(data["id"])
        if state != "draft":
            await c.post(
                f"{PAYMENT_URL}/escrow/reserve",
                json={
                    "contest_id": data["id"],
                    "customer_id": data["customer_id"],
                    "amount": data["prizepool"],
                },
                headers=INTERNAL,
            )
            await c.patch(
                f"{CONTEST_URL}/contests/{data['id']}/activate-internal",
                headers=INTERNAL,
            )
        if state == "cancelled":
            await c.patch(
                f"{CONTEST_URL}/contests/{data['id']}/cancel-internal",
                headers=INTERNAL,
            )
    return data


async def _submit(token, contest_id, expect=201):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest_id,
                "title": "Решение",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(token),
        )
    assert r.status_code == expect, r.text
    return r.json()


async def _set_ends_at(customer_token, contest_id, days):
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/contests/{contest_id}",
            json={"ends_at": _iso(days)},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200, r.text


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _cleanup_contests(admin_token, contest_type_id):
    """Удаляет созданные тестом конкурсы до удаления типа конкурса."""
    yield
    async with httpx.AsyncClient() as c:
        for cid in _created_contests:
            await c.delete(
                f"{CONTEST_URL}/contests/{cid}", headers=auth_headers(admin_token)
            )
    _created_contests.clear()


@pytest_asyncio.fixture
async def fresh_customer():
    return await register_user("customer")


@pytest_asyncio.fixture
async def fresh_executor():
    return await register_user("executor")


# ── Приём решений: статус конкурса и срок ────────────────────────────────────


async def test_submit_to_active_contest_ok(
    fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    sub = await _submit(fresh_executor, contest["id"], 201)
    assert sub["contest_id"] == contest["id"]


@pytest.mark.parametrize("state", ["draft", "cancelled", "finished"])
async def test_submit_to_non_active_contest_409(
    fresh_customer, fresh_executor, contest_type_id, state
):
    if state == "finished":
        contest = await _make_contest(fresh_customer, contest_type_id)
        first = await _submit(fresh_executor, contest["id"], 201)
        me = await _profile(fresh_executor)
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{CONTEST_URL}/contests/{contest['id']}/winner",
                params={"submission_id": first["id"], "executor_id": me["id"]},
                headers=auth_headers(fresh_customer),
            )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "finished"
    else:
        contest = await _make_contest(fresh_customer, contest_type_id, state=state)
    other = await register_user("executor")
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={"contest_id": contest["id"], "title": "Поздно"},
            headers=auth_headers(other),
        )
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == "Конкурс не принимает решения"


async def test_submit_after_deadline_409(
    fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    await _set_ends_at(fresh_customer, contest["id"], -1)
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={"contest_id": contest["id"], "title": "После срока"},
            headers=auth_headers(fresh_executor),
        )
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == "Срок приёма решений истёк"


async def test_edit_and_upload_after_deadline_409(
    fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    sub = await _submit(fresh_executor, contest["id"])
    # До срока правка работает
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/submissions/{sub['id']}",
            json={"title": "Правка до срока"},
            headers=auth_headers(fresh_executor),
        )
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "Правка до срока"

    await _set_ends_at(fresh_customer, contest["id"], -1)
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/submissions/{sub['id']}",
            json={"title": "Правка после срока"},
            headers=auth_headers(fresh_executor),
        )
        assert r.status_code == 409, r.text
        assert r.json()["detail"] == "Срок приёма решений истёк"

        r = await c.post(
            f"{CONTEST_URL}/submissions/{sub['id']}/files",
            files=[("files", ("a.pdf", b"%PDF-1.4 test", "application/pdf"))],
            headers=auth_headers(fresh_executor),
        )
        assert r.status_code == 409, r.text

        # Заголовок не изменился
        r = await c.get(
            f"{CONTEST_URL}/submissions/{sub['id']}",
            headers=auth_headers(fresh_executor),
        )
        assert r.json()["title"] == "Правка до срока"


# ── Email (Mailpit) ──────────────────────────────────────────────────────────


async def _mailpit_messages() -> list[dict]:
    async with httpx.AsyncClient(timeout=5.0) as c:
        r = await c.get(f"{MAILPIT_URL}/api/v1/messages", params={"limit": 500})
    assert r.status_code == 200
    return r.json()["messages"]


def _matches(m: dict, to: str, subject_part: str) -> bool:
    return any(t["Address"] == to for t in m["To"]) and subject_part in m["Subject"]


async def _wait_mail(to: str, subject_part: str, timeout: float = 10.0):
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    while True:
        for m in await _mailpit_messages():
            if _matches(m, to, subject_part):
                return m
        if loop.time() > deadline:
            return None
        await asyncio.sleep(0.5)


async def _mails_to(to: str, subject_part: str) -> list[dict]:
    return [m for m in await _mailpit_messages() if _matches(m, to, subject_part)]


async def _mail_body(mail_id: str) -> dict:
    async with httpx.AsyncClient() as c:
        return (await c.get(f"{MAILPIT_URL}/api/v1/message/{mail_id}")).json()


@pytest_asyncio.fixture
async def mailpit():
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{MAILPIT_URL}/api/v1/messages", params={"limit": 1})
            if r.status_code != 200:
                pytest.skip("Mailpit недоступен")
    except httpx.HTTPError:
        pytest.skip("Mailpit недоступен")
    return MAILPIT_URL


async def test_email_new_submission_to_customer(
    mailpit, fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    customer = await _profile(fresh_customer)
    executor = await _profile(fresh_executor)
    sub = await _submit(fresh_executor, contest["id"])

    mail = await _wait_mail(
        customer["email"], f"Новая заявка на конкурс «{contest['title']}»"
    )
    assert mail is not None, "письмо заказчику не пришло"
    full = await _mail_body(mail["ID"])
    assert executor["login"] in full["Text"]
    assert f"/solution/{sub['number']}" in full["Text"]
    assert f"/solution/{sub['number']}" in full["HTML"]
    # Исполнитель письмо о своей же заявке не получает
    assert not await _mails_to(executor["email"], "Новая заявка")


async def test_email_winner_and_losers(mailpit, fresh_customer, contest_type_id):
    contest = await _make_contest(fresh_customer, contest_type_id)
    winner_tok = await register_user("executor")
    loser_tok = await register_user("executor")
    winner, loser = await _profile(winner_tok), await _profile(loser_tok)
    win_sub = await _submit(winner_tok, contest["id"])
    await _submit(loser_tok, contest["id"])

    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests/{contest['id']}/winner",
            params={"submission_id": win_sub["id"], "executor_id": winner["id"]},
            headers=auth_headers(fresh_customer),
        )
    assert r.status_code == 200, r.text

    win_mail = await _wait_mail(
        winner["email"], f"Ваше решение победило в конкурсе «{contest['title']}»"
    )
    assert win_mail is not None, "победитель не получил письмо"
    full = await _mail_body(win_mail["ID"])
    assert "3 000" in full["Text"]  # сумма приза

    lose_mail = await _wait_mail(
        loser["email"], f"Конкурс «{contest['title']}» завершён"
    )
    assert lose_mail is not None, "участник не получил письмо о завершении"
    # Проигравший не получает письмо о победе, победитель — о «завершён»
    assert not await _mails_to(loser["email"], "победило")
    assert not await _mails_to(winner["email"], "завершён")


async def test_email_status_change_to_executor(
    mailpit, fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    sub = await _submit(fresh_executor, contest["id"])
    executor = await _profile(fresh_executor)
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{CONTEST_URL}/submissions/{sub['id']}/status",
            params={"status": 4},
            headers=auth_headers(fresh_customer),
        )
    assert r.status_code == 200, r.text
    mail = await _wait_mail(executor["email"], "Статус вашего решения изменён")
    assert mail is not None
    full = await _mail_body(mail["ID"])
    assert "Необходимы правки" in full["Text"]


async def test_email_chat_offline_recipient_throttled(
    mailpit, fresh_customer, fresh_executor, contest_type_id
):
    contest = await _make_contest(fresh_customer, contest_type_id)
    await _submit(fresh_executor, contest["id"])
    executor = await _profile(fresh_executor)
    customer = await _profile(fresh_customer)
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/chat/conversations",
            json={"contest_id": contest["id"], "executor_id": executor["id"]},
            headers=auth_headers(fresh_customer),
        )
        assert r.status_code == 200, r.text
        conv_id = r.json()["id"]
        for text in ("Первое сообщение", "Второе сообщение"):
            r = await c.post(
                f"{CONTEST_URL}/chat/conversations/{conv_id}/messages",
                json={"text": text},
                headers=auth_headers(fresh_customer),
            )
            assert r.status_code == 201, r.text

    mail = await _wait_mail(executor["email"], "Новое сообщение")
    assert mail is not None, "оффлайн-получатель не получил письмо"
    await asyncio.sleep(1.5)
    # Троттлинг: второе сообщение в течение 10 минут второго письма не даёт
    assert len(await _mails_to(executor["email"], "Новое сообщение")) == 1
    # Отправитель себе не пишет
    assert not await _mails_to(customer["email"], "Новое сообщение")
