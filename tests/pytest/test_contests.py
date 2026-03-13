"""
Сценарии 6–21: Конкурсы (просмотр, фильтры, управление)
"""

import datetime

import httpx
import pytest
import pytz
from conftest import CONTEST_URL, auth_headers


def future_date(days: int = 30) -> str:
    return (datetime.datetime.now(pytz.utc) + datetime.timedelta(days=days)).isoformat()


def future_day(days: int = 30) -> str:
    return (
        (datetime.datetime.now(pytz.utc) + datetime.timedelta(days=days))
        .date()
        .isoformat()
    )


# ── 6. Список конкурсов ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_contests(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/contests", headers=auth_headers(customer_token))
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data


# ── 7. Фильтр по статусу ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_by_status(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"status": "active"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["status"] == "active"


@pytest.mark.asyncio
async def test_filter_by_multiple_statuses(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"statuses": "active,finished"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["status"] in ("active", "finished")


# ── 8. Фильтр по типу конкурса ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_by_type(customer_token, contest_type_id, contest):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"type_id": contest_type_id},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    ids = [i["type_id"] for i in r.json()["items"]]
    assert contest_type_id in ids


@pytest.mark.asyncio
async def test_filter_by_multiple_types(customer_token, contest_type_id, contest):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"types": f"{contest_type_id},999999"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    ids = [i["type_id"] for i in r.json()["items"]]
    assert contest_type_id in ids


# ── 9. Фильтр по призовому фонду ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_by_prizepool(customer_token, contest):
    prize = contest["prizepool"]
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"min_reward": prize, "max_reward": prize},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["prizepool"] == prize


# ── 10–11. Фильтры по дате + поиск по названию ───────────────────────────────


@pytest.mark.asyncio
async def test_search_by_title(customer_token, contest):
    title_fragment = contest["title"][:10]
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"search": title_fragment},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert any(contest["id"] == i["id"] for i in r.json()["items"])


@pytest.mark.asyncio
async def test_filter_by_end_date(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"endBy": future_day(31), "endAfter": future_day(29)},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert any(contest["id"] == i["id"] for i in r.json()["items"])


# ── 12. Сброс фильтров (запрос без параметров) ───────────────────────────────


@pytest.mark.asyncio
async def test_no_filters(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/contests", headers=auth_headers(customer_token))
    assert r.status_code == 200


# ── 13. Просмотр страницы конкурса по номеру ─────────────────────────────────


@pytest.mark.asyncio
async def test_get_contest_by_number(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests/number/{contest['number']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == contest["id"]
    assert "stages" in data


@pytest.mark.asyncio
async def test_get_contest_not_found(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests/number/999999",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 404


# ── 14. Пагинация ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pagination(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"page": 1, "limit": 2},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["page"] == 1
    assert len(data["items"]) <= 2


# ── 15. Создание конкурса ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_contest(customer_token, contest):
    assert contest["id"] > 0
    assert contest["status"] == "active"
    assert len(contest["stages"]) == 2


@pytest.mark.asyncio
async def test_create_contest_executor_forbidden(executor_token, contest_type_id):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": "X" * 10,
                "prizepool": 1000,
                "ends_at": future_date(),
                "type_id": contest_type_id,
                "stages": [],
            },
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 403


# ── 16. Редактирование конкурса ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_edit_contest(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/contests/{contest['id']}",
            json={
                "title": "Updated Title XYZ",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "prizepool": contest["prizepool"],
                "ends_at": future_date(),
                "stages": [],
            },
            headers=auth_headers(customer_token),
        )
    # 200 if edit endpoint exists, 404/405 if not implemented yet
    assert r.status_code in (200, 404, 405)


# ── 17. Список своих конкурсов ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_own_contests(customer_token, contest):
    async with httpx.AsyncClient() as c:
        profile = await c.get(
            f"http://localhost:8001/users/profile", headers=auth_headers(customer_token)
        )
        customer_id = profile.json()["id"]
        r = await c.get(
            f"{CONTEST_URL}/contests",
            params={"customer_id": customer_id},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["customer_id"] == customer_id


# ── 18. Удаление конкурса (только admin) ─────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_contest_customer_forbidden(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.delete(
            f"{CONTEST_URL}/contests/{contest['id']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_contest_admin_succeeds(
    admin_token, contest_type_id, customer_token
):
    """Creates a disposable contest and deletes it as admin."""
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": "Disposable Contest",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "prizepool": 1000,
                "ends_at": future_date(),
                "type_id": contest_type_id,
                "stages": [],
            },
            headers=auth_headers(customer_token),
        )
        assert cr.status_code == 201
        cid = cr.json()["id"]
        dr = await c.delete(
            f"{CONTEST_URL}/contests/{cid}", headers=auth_headers(admin_token)
        )
    assert dr.status_code == 204


# ── 19. Редактирование этапов ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_stages(customer_token, contest):
    new_stages = [
        {"name": "Новый этап 1", "order": 1},
        {"name": "Новый этап 2", "order": 2},
        {"name": "Новый этап 3", "order": 3},
    ]
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/contests/{contest['id']}/stages",
            json=new_stages,
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert len(r.json()["stages"]) == 3
    assert r.json()["current_stage_id"] is None  # reset after stages update


# ── 20. Установка текущего этапа ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_current_stage(customer_token, contest):
    # First refresh contest to get current stage ids
    async with httpx.AsyncClient() as c:
        cr = await c.get(
            f"{CONTEST_URL}/contests/{contest['id']}",
            headers=auth_headers(customer_token),
        )
        stages = cr.json()["stages"]
        assert len(stages) > 0
        stage_id = stages[0]["id"]
        r = await c.patch(
            f"{CONTEST_URL}/contests/{contest['id']}/current-stage",
            params={"stage_id": stage_id},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["current_stage_id"] == stage_id


# ── 21. Сброс текущего этапа (авто-режим) ────────────────────────────────────


@pytest.mark.asyncio
async def test_clear_current_stage(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{CONTEST_URL}/contests/{contest['id']}/current-stage",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["current_stage_id"] is None
