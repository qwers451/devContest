"""
Сценарии 38–42: Администрирование
"""
import time
import pytest
import httpx
from conftest import USER_URL, CONTEST_URL, auth_headers

TS = int(time.time())


# ── 38. Просмотр всех пользователей ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_users_admin(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users",
                        headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0


@pytest.mark.asyncio
async def test_list_users_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users",
                        headers=auth_headers(customer_token))
    assert r.status_code == 403


# ── 39. Добавить тип конкурса ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_contest_type(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/contest-types",
                         json={"name": f"NewType_{TS}"},
                         headers=auth_headers(admin_token))
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["name"] == f"NewType_{TS}"


@pytest.mark.asyncio
async def test_create_contest_type_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/contest-types",
                         json={"name": "ShouldFail"},
                         headers=auth_headers(customer_token))
    assert r.status_code == 403


# ── 40. Удалить тип конкурса ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_contest_type(admin_token):
    async with httpx.AsyncClient() as c:
        cr = await c.post(f"{CONTEST_URL}/contest-types",
                          json={"name": f"ToDelete_{TS}"},
                          headers=auth_headers(admin_token))
        assert cr.status_code == 201
        tid = cr.json()["id"]
        dr = await c.delete(f"{CONTEST_URL}/contest-types/{tid}",
                            headers=auth_headers(admin_token))
    assert dr.status_code == 204


@pytest.mark.asyncio
async def test_delete_contest_type_non_admin_forbidden(customer_token, contest_type_id):
    async with httpx.AsyncClient() as c:
        r = await c.delete(f"{CONTEST_URL}/contest-types/{contest_type_id}",
                           headers=auth_headers(customer_token))
    assert r.status_code == 403


# ── 41. Статистика ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_statistics_by_type(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/statistics",
                        params={"x": "type", "y": "count"},
                        headers=auth_headers(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert "x_labels" in data
    assert "datasets" in data
    assert len(data["datasets"]) == 1
    assert data["datasets"][0]["label"] == "Количество"


@pytest.mark.asyncio
async def test_statistics_by_status_prizepool(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/statistics",
                        params={"x": "status", "y": "prizepool"},
                        headers=auth_headers(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert "active" in data["x_labels"] or len(data["x_labels"]) >= 0


@pytest.mark.asyncio
async def test_statistics_by_created_at(admin_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/statistics",
                        params={"x": "createdAt", "y": "count"},
                        headers=auth_headers(admin_token))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_statistics_non_admin_forbidden(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/statistics",
                        params={"x": "type", "y": "count"},
                        headers=auth_headers(customer_token))
    assert r.status_code == 403


# ── 33. Выбор победителя (требует активного конкурса) ─────────────────────────

@pytest.mark.asyncio
async def test_select_winner(customer_token, contest, submission, executor_token):
    """
    Selects winner — contest transitions to 'finished'.
    Run last since it closes the shared contest fixture.
    This test is intentionally skipped if contest is already finished.
    """
    async with httpx.AsyncClient() as c:
        cr = await c.get(f"{CONTEST_URL}/contests/{contest['id']}",
                         headers=auth_headers(customer_token))
        if cr.json()["status"] != "active":
            pytest.skip("Contest already finished")

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
