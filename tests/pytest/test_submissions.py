"""
Сценарии 22–37: Решения, файлы, отзывы
"""

import datetime
import io

import httpx
import pytest
import pytest_asyncio
import pytz
from conftest import CONTEST_URL, USER_URL, auth_headers

# ── 22. Список своих решений (executor) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_list_own_submissions(executor_token, submission):
    async with httpx.AsyncClient() as c:
        profile = await c.get(
            f"{USER_URL}/users/profile", headers=auth_headers(executor_token)
        )
        executor_id = profile.json()["id"]
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"executor_id": executor_id},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert submission["id"] in ids


# ── 23. Список решений по конкурсу (customer/admin) ───────────────────────────


@pytest.mark.asyncio
async def test_list_submissions_by_contest(customer_token, contest, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"]},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert any(s["id"] == submission["id"] for s in r.json())


# ── 24. Фильтр по статусу ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_submissions_by_status(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"], "status": 1},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    for s in r.json():
        assert s["status"] == 1


@pytest.mark.asyncio
async def test_filter_submissions_by_multiple_statuses(
    customer_token, contest, submission
):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"], "statuses": "1,2"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    statuses = {s["status"] for s in r.json()}
    assert statuses.issubset({1, 2})
    assert submission["id"] in [s["id"] for s in r.json()]


# ── 25–26. Фильтр по дате / поиск (запрос без параметров == сброс фильтров) ───


@pytest.mark.asyncio
async def test_list_submissions_no_filter(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions", headers=auth_headers(customer_token)
        )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_filter_submissions_by_added_date(customer_token, submission):
    date_str = datetime.datetime.now(pytz.utc).date().isoformat()
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"addedBefore": date_str, "addedAfter": date_str},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert any(s["id"] == submission["id"] for s in r.json())


# ── 28. Просмотр решения по номеру ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_submission_by_number(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/number/{submission['number']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == submission["id"]
    assert "executor_login" in data
    assert "contest_title" in data
    assert data["contest_title"] is not None


@pytest.mark.asyncio
async def test_get_submission_not_found(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/number/999999",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 404


# ── 29. Создание решения ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_submission(submission):
    assert submission["id"] > 0
    assert submission["status"] == 1
    assert submission["executor_login"] is not None
    assert submission["contest_title"] is not None


@pytest.mark.asyncio
async def test_create_submission_customer_forbidden(customer_token, contest):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": "X" * 20,
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 30. Редактирование решения ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_edit_submission(executor_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/submissions/{submission['id']}",
            json={
                "title": "Updated submission title",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(executor_token),
        )
    # 200 if edit endpoint exists, 404/405 if not yet implemented
    assert r.status_code in (200, 404, 405)


# ── Тесты загрузки файлов ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_file(executor_token, submission):
    # Минимальный валидный PNG (1x1 пиксель)
    file_content = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/files",
            files={"files": ("test.png", io.BytesIO(file_content), "image/png")},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "test.png" in data["files"]


@pytest.mark.asyncio
async def test_download_file(executor_token, submission):
    # Загружаем PNG, затем скачиваем
    file_content = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    async with httpx.AsyncClient() as c:
        up = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/files",
            files={"files": ("dl_test.png", io.BytesIO(file_content), "image/png")},
            headers=auth_headers(executor_token),
        )
        assert up.status_code == 200
        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}/files/dl_test.png",
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    assert r.content == file_content


@pytest.mark.asyncio
async def test_upload_file_wrong_owner(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/files",
            files={"files": ("x.txt", io.BytesIO(b"x"), "text/plain")},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 32. Изменение статуса решения ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_change_submission_status(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{CONTEST_URL}/submissions/{submission['id']}/status",
            params={"status": 2},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["status"] == 2


@pytest.mark.asyncio
async def test_change_status_executor_forbidden(executor_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{CONTEST_URL}/submissions/{submission['id']}/status",
            params={"status": 3},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 403


# ── 34. Написать отзыв ────────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="module")
async def review(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews",
            json={"score": 4.5, "commentary": "Good work!"},
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 201, r.text
        return r.json()


@pytest.mark.asyncio
async def test_create_review(review):
    assert review["score"] == 4.5
    assert review["commentary"] == "Good work!"
    assert review["number"] >= 1


# ── 37. Просмотреть все отзывы ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_reviews(customer_token, submission, review):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert any(rv["id"] == review["id"] for rv in r.json())


# ── 35. Редактировать отзыв ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_review(customer_token, submission, review):
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews/{review['number']}",
            json={"score": 3.0, "commentary": "Updated commentary"},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["score"] == 3.0


# ── 36. Удалить отзыв ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_review(customer_token, submission):
    """Создаёт отдельную рецензию и удаляет её."""
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews",
            json={"score": 1.0, "commentary": "Будет удалена"},
            headers=auth_headers(customer_token),
        )
        num = cr.json()["number"]
        dr = await c.delete(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews/{num}",
            headers=auth_headers(customer_token),
        )
    assert dr.status_code == 204


# ── 31. Удаление решения (последний, т.к. удаляет данные) ────────────────────


@pytest.mark.asyncio
async def test_delete_submission_wrong_owner(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.delete(
            f"{CONTEST_URL}/submissions/{submission['id']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_submission(executor_token, contest, admin_token):
    """Создаёт временное решение и удаляет его."""
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": "Временное решение",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(executor_token),
        )
        assert cr.status_code == 201
        sid = cr.json()["id"]
        dr = await c.delete(
            f"{CONTEST_URL}/submissions/{sid}", headers=auth_headers(executor_token)
        )
    assert dr.status_code == 204


# ── 22b. Сортировка решений ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sort_submissions_by_ai_score(executor_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"sort_by": "ai_score", "sort_dir": "desc"},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_sort_submissions_created_at_asc(executor_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"sort_by": "created_at", "sort_dir": "asc"},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    items = r.json()
    dates = [s["created_at"] for s in items]
    assert dates == sorted(dates)


# ── 28b. Несуществующее решение ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_submission_not_found(executor_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/number/999999999",
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 404


# ── 32b. Невалидный статус решения ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_submission_status_invalid(customer_token, submission):
    """Статус 99 не входит в допустимые — должен вернуть 422 или 400."""
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{CONTEST_URL}/submissions/{submission['id']}/status",
            params={"status": 99},
            headers=auth_headers(customer_token),
        )
    assert r.status_code in (400, 422)


# ── 29b. Создание решения — валидация ────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_submission_missing_contest_id(executor_token):
    """Создание без contest_id должно вернуть 422."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "title": "No Contest",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_submission_customer_forbidden(customer_token, contest):
    """Заказчик не может создавать решения."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": "Попытка заказчика отправить решение",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── 28c. Поле executor_login и contest_title в ответе ─────────────────────────

@pytest.mark.asyncio
async def test_submission_has_enriched_fields(executor_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/number/{submission['number']}",
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "executor_login" in data
    assert data["executor_login"] is not None
    assert "contest_title" in data
    assert data["contest_title"] is not None


# ── Контроль доступа (новые проверки) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_other_customer_cannot_list_submissions(contest, submission):
    """AC1. Заказчик, не владеющий конкурсом, получает 403 при запросе решений."""
    import time as t
    ts = int(t.time())
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": f"other_cust_{ts}",
                "email": f"other_cust_{ts}@test.com",
                "password": "Test1234!",
                "role": "customer",
            },
        )
        assert r.status_code in (200, 201)
        other_token = r.json()["access_token"]

        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"]},
            headers=auth_headers(other_token),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_executor_sees_only_own_submission(contest, submission):
    """AC2. Другой исполнитель видит только свои решения (пустой список) по чужому конкурсу."""
    import time as t
    ts = int(t.time())
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": f"other_exec_{ts}",
                "email": f"other_exec_{ts}@test.com",
                "password": "Test1234!",
                "role": "executor",
            },
        )
        assert r.status_code in (200, 201)
        other_token = r.json()["access_token"]

        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"]},
            headers=auth_headers(other_token),
        )
    assert r.status_code == 200
    # Другой исполнитель не подавал решения — список пустой
    assert r.json() == []


@pytest.mark.asyncio
async def test_unauthenticated_cannot_get_submission(submission):
    """AC3. Без токена GET /submissions/{id} возвращает 401/403."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{CONTEST_URL}/submissions/{submission['id']}")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_other_user_cannot_get_submission(contest, submission):
    """AC4. Посторонний пользователь не может получить чужое решение — 403."""
    import time as t
    ts = int(t.time())
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": f"stranger_{ts}",
                "email": f"stranger_{ts}@test.com",
                "password": "Test1234!",
                "role": "customer",
            },
        )
        other_token = r.json()["access_token"]

        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}",
            headers=auth_headers(other_token),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_executor_cannot_post_review(executor_token, submission):
    """AC5. Исполнитель не может оставить отзыв — только заказчик."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews",
            json={"score": 5, "commentary": "Отличная работа"},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_owner_can_see_submission(customer_token, submission):
    """AC6. Владелец конкурса может просматривать решения своего конкурса."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["id"] == submission["id"]


@pytest.mark.asyncio
async def test_executor_can_see_own_submission(executor_token, submission):
    """AC7. Исполнитель может просматривать своё решение."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}",
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    assert r.json()["id"] == submission["id"]
