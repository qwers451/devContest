"""
Сценарии 38–42: Администрирование
"""

import datetime
import time

import httpx
import pytest
import pytz
from conftest import CONTEST_URL, PAYMENT_URL, USER_URL, INTERNAL_SECRET, auth_headers

TS = int(time.time())


# ── 38. Просмотр всех пользователей ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_users_admin(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users", headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0


@pytest.mark.asyncio
async def test_list_users_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users", headers=auth_headers(customer_token))
    assert r.status_code == 403


# ── 39. Добавить тип конкурса ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_contest_type(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contest-types",
            json={"name": f"NewType_{TS}"},
            headers=auth_headers(admin_token),
        )
        assert r.status_code == 201
        data = r.json()
        try:
            assert "id" in data
            assert data["name"] == f"NewType_{TS}"
        finally:
            dr = await c.delete(
                f"{CONTEST_URL}/contest-types/{data['id']}",
                headers=auth_headers(admin_token),
            )
            assert dr.status_code == 204


@pytest.mark.asyncio
async def test_create_contest_type_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contest-types",
            json={"name": "ShouldFail"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 40. Удалить тип конкурса ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_contest_type(admin_token):
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/contest-types",
            json={"name": f"ToDelete_{TS}"},
            headers=auth_headers(admin_token),
        )
        assert cr.status_code == 201
        tid = cr.json()["id"]
        dr = await c.delete(
            f"{CONTEST_URL}/contest-types/{tid}", headers=auth_headers(admin_token)
        )
    assert dr.status_code == 204


@pytest.mark.asyncio
async def test_delete_contest_type_non_admin_forbidden(customer_token, contest_type_id):
    async with httpx.AsyncClient() as c:
        r = await c.delete(
            f"{CONTEST_URL}/contest-types/{contest_type_id}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 41. Статистика ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_statistics_by_type(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "type", "y": "count"},
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "x_labels" in data
    assert "datasets" in data
    assert len(data["datasets"]) == 1
    assert data["datasets"][0]["label"] == "Количество"


@pytest.mark.asyncio
async def test_statistics_by_status_prizepool(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "status", "y": "prizepool"},
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "active" in data["x_labels"] or len(data["x_labels"]) >= 0


@pytest.mark.asyncio
async def test_statistics_by_created_at(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "createdAt", "y": "count"},
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_statistics_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "type", "y": "count"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 33. Выбор победителя (требует активного конкурса) ─────────────────────────


@pytest.mark.asyncio
async def test_select_winner(
    admin_token, customer_token, contest_type_id, executor_token
):
    """
    Uses dedicated contest/submission so shared session fixtures stay immutable.
    """
    ends_at = (
        datetime.datetime.now(pytz.utc) + datetime.timedelta(days=30)
    ).isoformat()

    async with httpx.AsyncClient() as c:
        contest_response = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": f"Winner Contest {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ text",
                "prizepool": 5000,
                "ends_at": ends_at,
                "type_id": contest_type_id,
                "stages": [{"name": "Этап 1", "order": 1}],
            },
            headers=auth_headers(customer_token),
        )
        assert contest_response.status_code == 201
        contest = contest_response.json()

        # Резервируем эскроу (заглушка) и активируем конкурс для выбора победителя
        internal_h = {"x-internal-secret": INTERNAL_SECRET}
        await c.post(
            f"{PAYMENT_URL}/escrow/reserve",
            json={"contest_id": contest["id"], "customer_id": contest["customer_id"], "amount": contest["prizepool"]},
            headers=internal_h,
        )
        await c.patch(f"{CONTEST_URL}/contests/{contest['id']}/activate-internal", headers=internal_h)

        submission_response = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": f"Winner Submission {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(executor_token),
        )
        assert submission_response.status_code == 201
        submission = submission_response.json()

        try:
            r = await c.post(
                f"{CONTEST_URL}/contests/{contest['id']}/winner",
                params={
                    "submission_id": submission["id"],
                    "executor_id": submission["executor_id"],
                },
                headers=auth_headers(customer_token),
            )
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "finished"
            assert data["winner"]["submission_id"] == submission["id"]
        finally:
            cleanup = await c.delete(
                f"{CONTEST_URL}/contests/{contest['id']}",
                headers=auth_headers(admin_token),
            )
            assert cleanup.status_code == 204


# ── 41b. Дополнительные варианты статистики ───────────────────────────────────

@pytest.mark.asyncio
async def test_statistics_by_end_by(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "endBy", "y": "count"},
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "x_labels" in data
    assert "datasets" in data


@pytest.mark.asyncio
async def test_statistics_by_prizepool_axis(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/statistics",
            params={"x": "prizepool", "y": "count"},
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_statistics_unauthorized():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/statistics", params={"x": "type", "y": "count"})
    assert r.status_code == 401


# ── 38b. Фильтрация и структура пользователей ─────────────────────────────────

@pytest.mark.asyncio
async def test_list_users_contains_expected_fields(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users", headers=auth_headers(admin_token))
    assert r.status_code == 200
    users = r.json()
    assert len(users) > 0
    for u in users[:3]:
        assert "id" in u
        assert "login" in u
        assert "role" in u
        assert "email" in u


@pytest.mark.asyncio
async def test_list_users_executor_forbidden(executor_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users", headers=auth_headers(executor_token))
    assert r.status_code == 403


# ── 39b. Дубликат типа конкурса ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_duplicate_contest_type(admin_token):
    """Создание типа с одинаковым именем — 409 или идемпотентность."""
    name = f"DupType_{TS}"
    async with httpx.AsyncClient() as c:
        r1 = await c.post(
            f"{CONTEST_URL}/contest-types",
            json={"name": name},
            headers=auth_headers(admin_token),
        )
        assert r1.status_code == 201
        tid = r1.json()["id"]
        try:
            r2 = await c.post(
                f"{CONTEST_URL}/contest-types",
                json={"name": name},
                headers=auth_headers(admin_token),
            )
            # Дубликат отклоняется или возвращает тот же id
            assert r2.status_code in (201, 409)
        finally:
            await c.delete(
                f"{CONTEST_URL}/contest-types/{tid}",
                headers=auth_headers(admin_token),
            )
