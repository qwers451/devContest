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
SERVICE_STARTUP_TIMEOUT = float(os.getenv("PYTEST_SERVICE_STARTUP_TIMEOUT", "30"))
SERVICE_POLL_INTERVAL = float(os.getenv("PYTEST_SERVICE_POLL_INTERVAL", "1"))

# Unique suffix so repeated runs don't collide
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


# ── Token fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="session")
async def admin_token():
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{USER_URL}/auth/login", json={"login": "admin", "password": "admin123"}
        )
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        return r.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def customer_token():
    """Registers a fresh customer for the test session."""
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
    """Registers a fresh executor for the test session."""
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


# ── Shared data created once per session ─────────────────────────────────────


@pytest_asyncio.fixture(scope="session")
async def contest_type_id(admin_token):
    """Creates a contest type and returns its id."""
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
    """Creates a contest and returns its full response dict."""
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
        yield contest_data
        await delete_if_exists(
            c, f"{CONTEST_URL}/contests/{contest_data['id']}", admin_token
        )


@pytest_asyncio.fixture(scope="session")
async def submission(admin_token, executor_token, contest):
    """Creates a submission and returns its full response dict."""
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
