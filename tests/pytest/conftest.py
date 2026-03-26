"""
Shared fixtures for devContest integration tests.
Run against a live stack: podman-compose up --build
"""

import asyncio
import os
import time

import httpx
import pytest
import pytest_asyncio

USER_URL = os.getenv("PYTEST_USER_URL", "http://localhost:8001")
CONTEST_URL = os.getenv("PYTEST_CONTEST_URL", "http://localhost:8002")
EVAL_URL = os.getenv("PYTEST_EVAL_URL", "http://localhost:8003")
PAYMENT_URL = os.getenv("PYTEST_PAYMENT_URL", "http://localhost:8004")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")
SERVICE_STARTUP_TIMEOUT = float(os.getenv("PYTEST_SERVICE_STARTUP_TIMEOUT", "30"))
SERVICE_POLL_INTERVAL = float(os.getenv("PYTEST_SERVICE_POLL_INTERVAL", "1"))

# Уникальный суффикс чтобы повторные запуски не конфликтовали
TS = int(time.time())


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def delete_if_exists(client: httpx.AsyncClient, url: str, token: str) -> None:
    response = await client.delete(url, headers=auth_headers(token))
    assert response.status_code in (204, 404), response.text


async def wait_for_service(base_url: str) -> None:
    deadline = time.monotonic() + SERVICE_STARTUP_TIMEOUT
    last_error = None

    async with httpx.AsyncClient(timeout=5.0) as client:
        while time.monotonic() < deadline:
            try:
                response = await client.get(f"{base_url}/docs")
                if response.status_code == 200:
                    return
                last_error = (
                    f"Unexpected status {response.status_code} from {base_url}/docs"
                )
            except httpx.HTTPError as exc:
                last_error = str(exc)

            await asyncio.sleep(SERVICE_POLL_INTERVAL)

    raise RuntimeError(f"Service {base_url} did not become ready: {last_error}")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def wait_for_stack():
    await wait_for_service(USER_URL)
    await wait_for_service(CONTEST_URL)
    await wait_for_service(EVAL_URL)
    await wait_for_service(PAYMENT_URL)


# ── Токены ───────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="session")
async def admin_token():
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/login", json={"login": "admin", "password": "admin123"}
        )
        if r.status_code == 200:
            return r.json()["access_token"]
        # Чистая БД — регистрируем admin если его ещё нет
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": "admin",
                "email": "admin@example.com",
                "password": "admin123",
                "role": "admin",
            },
        )
        assert r.status_code in (200, 201), f"Admin setup failed: {r.text}"
        return r.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def customer_token():
    """Регистрирует нового заказчика для тестовой сессии."""
    login = f"cust_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": login,
                "email": f"{login}@test.com",
                "password": "Test1234!",
                "role": "customer",
            },
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def executor_token():
    """Регистрирует нового исполнителя для тестовой сессии."""
    login = f"exec_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/register",
            json={
                "login": login,
                "email": f"{login}@test.com",
                "password": "Test1234!",
                "role": "executor",
            },
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["access_token"]


# ── Общие данные создаются один раз за сессию ────────────────────────────────


@pytest_asyncio.fixture(scope="session")
async def contest_type_id(admin_token):
    """Создаёт тип конкурса и возвращает его id."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contest-types",
            json={"name": f"TestType_{TS}"},
            headers=auth_headers(admin_token),
        )
        assert r.status_code == 201, r.text
        type_id = r.json()["id"]
        yield type_id
        await delete_if_exists(c, f"{CONTEST_URL}/contest-types/{type_id}", admin_token)


@pytest_asyncio.fixture(scope="session")
async def contest(admin_token, customer_token, contest_type_id):
    """Создаёт конкурс и возвращает полный словарь ответа."""
    import datetime

    import pytz

    ends_at = (
        datetime.datetime.now(pytz.utc) + datetime.timedelta(days=30)
    ).isoformat()
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": f"Test Contest {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ text",
                "prizepool": 5000,
                "ends_at": ends_at,
                "type_id": contest_type_id,
                "stages": [
                    {"name": "Этап 1", "order": 1},
                    {"name": "Этап 2", "order": 2},
                ],
            },
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 201, r.text
        contest_data = r.json()

        # Резервируем эскроу (заглушка) и активируем конкурс
        internal_headers = {"x-internal-secret": INTERNAL_SECRET}
        await c.post(
            f"{PAYMENT_URL}/escrow/reserve",
            json={"contest_id": contest_data["id"], "customer_id": contest_data["customer_id"], "amount": contest_data["prizepool"]},
            headers=internal_headers,
        )
        await c.patch(
            f"{CONTEST_URL}/contests/{contest_data['id']}/activate-internal",
            headers=internal_headers,
        )
        contest_data["status"] = "active"

        yield contest_data
        await delete_if_exists(
            c, f"{CONTEST_URL}/contests/{contest_data['id']}", admin_token
        )


@pytest_asyncio.fixture(scope="session")
async def submission(admin_token, executor_token, contest):
    """Создаёт решение и возвращает полный словарь ответа."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest["id"],
                "title": f"Test Submission {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(executor_token),
        )
        assert r.status_code == 201, r.text
        submission_data = r.json()
        yield submission_data
