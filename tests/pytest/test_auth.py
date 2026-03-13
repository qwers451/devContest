"""
Сценарии 1–5: Аутентификация
"""
import time
import pytest
import httpx
from conftest import USER_URL, auth_headers

TS = int(time.time())


# ── 1. Регистрация ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_executor():
    login = f"reg_exec_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": login,
            "email": f"{login}@test.local",
            "password": "Test1234!",
            "role": "executor",
        })
    assert r.status_code in (200, 201)
    data = r.json()
    assert "access_token" in data
    assert data["user"]["login"] == login
    assert data["user"]["role"] == "executor"


@pytest.mark.asyncio
async def test_register_customer():
    login = f"reg_cust_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": login,
            "email": f"{login}@test.local",
            "password": "Test1234!",
            "role": "customer",
        })
    assert r.status_code in (200, 201)
    assert r.json()["user"]["role"] == "customer"


@pytest.mark.asyncio
async def test_register_duplicate_login():
    login = f"dup_{TS}"
    body = {"login": login, "email": f"{login}@test.local",
            "password": "Test1234!", "role": "executor"}
    async with httpx.AsyncClient() as c:
        await c.post(f"{USER_URL}/auth/register", json=body)
        r = await c.post(f"{USER_URL}/auth/register", json=body)
    assert r.status_code == 409


# ── 2. Вход ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(customer_token):
    assert customer_token is not None and len(customer_token) > 10


@pytest.mark.asyncio
async def test_login_wrong_password():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/login",
                         json={"login": "admin", "password": "wrong"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/login",
                         json={"login": "no_such_user_xyz", "password": "pass"})
    assert r.status_code in (401, 404)


# ── 3. Выход (клиентская логика) ──────────────────────────────────────────────
# Logout очищает токен на клиенте — серверного эндпоинта нет.
# Проверяем, что после «выхода» запрос с удалённым токеном отклоняется.

@pytest.mark.asyncio
async def test_logout_token_invalidation():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users/profile",
                        headers={"Authorization": "Bearer invalid_token"})
    assert r.status_code == 401


# ── 4. Просмотр профиля ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_profile(customer_token):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users/profile",
                        headers=auth_headers(customer_token))
    assert r.status_code == 200
    data = r.json()
    assert "login" in data
    assert "email" in data
    assert "role" in data


@pytest.mark.asyncio
async def test_get_profile_unauthorized():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users/profile")
    assert r.status_code == 401


# ── 5. Редактирование профиля ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_profile_login(executor_token):
    new_login = f"upd_exec_{TS}"
    async with httpx.AsyncClient() as c:
        r = await c.put(f"{USER_URL}/users/profile",
                        json={"login": new_login},
                        headers=auth_headers(executor_token))
    assert r.status_code == 200
    assert r.json()["login"] == new_login


@pytest.mark.asyncio
async def test_update_profile_requires_auth():
    async with httpx.AsyncClient() as c:
        r = await c.put(f"{USER_URL}/users/profile", json={"login": "x"})
    assert r.status_code == 401
