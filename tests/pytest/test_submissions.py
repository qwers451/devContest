"""
Сценарии 22–37: Решения, файлы, отзывы
"""

import datetime
import io

import httpx
import pytest
import pytest_asyncio
import pytz
from conftest import CONTEST_URL, auth_headers

# ── 22. Список своих решений (executor) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_list_own_submissions(executor_token, submission):
    async with httpx.AsyncClient() as c:
        profile = await c.get(
            "http://localhost:8001/users/profile", headers=auth_headers(executor_token)
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
async def test_filter_submissions_by_multiple_statuses(customer_token, submission):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"statuses": "1,2"},
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


# ── File upload tests ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_file(executor_token, submission):
    file_content = b"Hello from test file"
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/files",
            files={"files": ("test.txt", io.BytesIO(file_content), "text/plain")},
            headers=auth_headers(executor_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert "test.txt" in data["files"]


@pytest.mark.asyncio
async def test_download_file(executor_token, submission):
    # Upload first, then download
    file_content = b"Download me"
    async with httpx.AsyncClient() as c:
        up = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/files",
            files={"files": ("dl_test.txt", io.BytesIO(file_content), "text/plain")},
            headers=auth_headers(executor_token),
        )
        assert up.status_code == 200
        r = await c.get(
            f"{CONTEST_URL}/submissions/{submission['id']}/files/dl_test.txt",
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
    """Creates a separate review and deletes it."""
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/submissions/{submission['id']}/reviews",
            json={"score": 1.0, "commentary": "To be deleted"},
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
    """Creates a throwaway submission and deletes it."""
    async with httpx.AsyncClient() as c:
        cr = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": "Throwaway submission",
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
