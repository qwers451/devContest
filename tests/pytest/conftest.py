"""
Shared fixtures for devContest integration tests.
Run against a live stack: podman-compose up --build
"""
import time
import pytest
import httpx

USER_URL    = "http://localhost:8001"
CONTEST_URL = "http://localhost:8002"

# Unique suffix so repeated runs don't collide
TS = int(time.time())


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Token fixtures ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
async def admin_token():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/login",
                         json={"login": "admin", "password": "admin123"})
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        return r.json()["access_token"]


@pytest.fixture(scope="session")
async def customer_token():
    """Registers a fresh customer for the test session."""
    login = f"cust_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": login, "email": f"{login}@test.local",
            "password": "Test1234!", "role": "customer",
        })
        assert r.status_code in (200, 201), r.text
        return r.json()["access_token"]


@pytest.fixture(scope="session")
async def executor_token():
    """Registers a fresh executor for the test session."""
    login = f"exec_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": login, "email": f"{login}@test.local",
            "password": "Test1234!", "role": "executor",
        })
        assert r.status_code in (200, 201), r.text
        return r.json()["access_token"]


# ── Shared data created once per session ─────────────────────────────────────

@pytest.fixture(scope="session")
async def contest_type_id(admin_token):
    """Creates a contest type and returns its id."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/contest-types",
                         json={"name": f"TestType_{TS}"},
                         headers=auth_headers(admin_token))
        assert r.status_code == 201, r.text
        return r.json()["id"]


@pytest.fixture(scope="session")
async def contest(customer_token, contest_type_id):
    """Creates a contest and returns its full response dict."""
    import datetime, pytz
    ends_at = (datetime.datetime.now(pytz.utc) +
               datetime.timedelta(days=30)).isoformat()
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/contests", json={
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
        }, headers=auth_headers(customer_token))
        assert r.status_code == 201, r.text
        return r.json()


@pytest.fixture(scope="session")
async def submission(executor_token, contest):
    """Creates a submission and returns its full response dict."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{CONTEST_URL}/submissions", json={
            "contest_id": contest["id"],
            "title": f"Test Submission {TS}",
            "annotation": "A" * 30,
            "description": "D" * 100,
        }, headers=auth_headers(executor_token))
        assert r.status_code == 201, r.text
        return r.json()
