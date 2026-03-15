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
            "email": f"{login}@test.com",
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
            "email": f"{login}@test.com",
            "password": "Test1234!",
            "role": "customer",
        })
    assert r.status_code in (200, 201)
    assert r.json()["user"]["role"] == "customer"


@pytest.mark.asyncio
async def test_register_duplicate_login():
    login = f"dup_{TS}"
    body = {"login": login, "email": f"{login}@test.com",
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


# ── 1b. Дополнительные сценарии регистрации ───────────────────────────────────

@pytest.mark.asyncio
async def test_register_invalid_email():
    """Сервер должен отклонить невалидный email."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": f"bad_email_{TS}",
            "email": "not-an-email",
            "password": "Test1234!",
            "role": "executor",
        })
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_register_missing_role():
    """Регистрация без поля role — role defaults to executor, returns 201."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": f"norole_{TS}",
            "email": f"norole_{TS}@test.com",
            "password": "Test1234!",
        })
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "executor"


@pytest.mark.asyncio
async def test_register_empty_password():
    """Пустой пароль должен быть отклонён."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{USER_URL}/auth/register", json={
            "login": f"nopass_{TS}",
            "email": f"nopass_{TS}@test.com",
            "password": "",
            "role": "executor",
        })
    assert r.status_code in (400, 422)


# ── 4b. Получение пользователя по ID ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_user_by_id(customer_token):
    """Получить профиль, затем проверить GET /users/{id}."""
    async with httpx.AsyncClient() as c:
        profile_r = await c.get(
            f"{USER_URL}/users/profile", headers=auth_headers(customer_token)
        )
        user_id = profile_r.json()["id"]
        r = await c.get(
            f"{USER_URL}/users/{user_id}", headers=auth_headers(customer_token)
        )
    assert r.status_code == 200
    assert r.json()["id"] == user_id


@pytest.mark.asyncio
async def test_get_nonexistent_user(customer_token):
    """Запрос несуществующего пользователя должен вернуть 404."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{USER_URL}/users/999999999", headers=auth_headers(customer_token)
        )
    assert r.status_code == 404


# ── 5b. Обновление email ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_profile_email(customer_token):
    """Обновление email — должно вернуть новый email."""
    new_email = f"updated_{TS}@test.com"
    async with httpx.AsyncClient() as c:
        r = await c.put(
            f"{USER_URL}/users/profile",
            json={"email": new_email},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["email"] == new_email
