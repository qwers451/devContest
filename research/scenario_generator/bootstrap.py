from __future__ import annotations

import datetime
import time
from dataclasses import dataclass
from uuid import uuid4

import httpx

from research.config import (
    CONTEST_URL,
    DEFAULT_PASSWORD,
    INTERNAL_SECRET,
    PAYMENT_URL,
    USER_URL,
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _internal() -> dict:
    return {"x-internal-secret": INTERNAL_SECRET}


def _isoformat_plus_days(days: int) -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(days=days)
    ).isoformat()


@dataclass
class Principal:
    login: str
    token: str
    id: int
    role: str


@dataclass
class StackContext:
    admin: Principal
    customer: Principal
    executor: Principal
    contest_id: int
    customer_id: int
    executor_id: int
    stage_ids: list[int]


def ensure_admin(client: httpx.Client) -> Principal:
    return _ensure_admin(client)


def _ensure_admin(client: httpx.Client) -> Principal:
    login = "admin"
    r = client.post(
        f"{USER_URL}/auth/login",
        json={"login": login, "password": "admin123"},
    )
    if r.status_code == 200:
        token = r.json()["access_token"]
    else:
        r = client.post(
            f"{USER_URL}/auth/register",
            json={
                "login": login,
                "email": "admin@example.com",
                "password": "admin123",
                "role": "admin",
            },
        )
        r.raise_for_status()
        token = r.json()["access_token"]
    me = client.get(f"{USER_URL}/users/profile", headers=_auth(token))
    me.raise_for_status()
    return Principal(login=login, token=token, id=me.json()["id"], role="admin")


def _register_user(client: httpx.Client, role: str) -> Principal:
    login = f"research_{role}_{int(time.time())}_{uuid4().hex[:6]}"
    r = client.post(
        f"{USER_URL}/auth/register",
        json={
            "login": login,
            "email": f"{login}@test.com",
            "password": DEFAULT_PASSWORD,
            "role": role,
        },
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    me = client.get(f"{USER_URL}/users/profile", headers=_auth(token))
    me.raise_for_status()
    return Principal(login=login, token=token, id=me.json()["id"], role=role)


def _ensure_contest_type(client: httpx.Client, admin_token: str) -> int:
    name = f"ResearchType_{int(time.time())}"
    r = client.post(
        f"{CONTEST_URL}/contest-types",
        json={"name": name},
        headers=_auth(admin_token),
    )
    r.raise_for_status()
    return r.json()["id"]


def _create_contest(
    client: httpx.Client,
    *,
    customer_token: str,
    type_id: int,
) -> dict:
    ts = int(time.time())
    r = client.post(
        f"{CONTEST_URL}/contests",
        json={
            "title": f"Research Contest {ts}",
            "annotation": "A" * 60,
            "description": "D" * 200,
            "tz_text": (
                "ТЗ для исследовательского стенда. Фриланс-платформа "
                "должна поддерживать протоколированный диалог заказчик↔"
                "исполнитель с FSM и версионированием ТЗ."
            ),
            "prizepool": 9000,
            "ends_at": _isoformat_plus_days(60),
            "type_id": type_id,
            "stages": [
                {"name": "Этап 1", "order": 1},
                {"name": "Этап 2", "order": 2},
            ],
        },
        headers=_auth(customer_token),
    )
    r.raise_for_status()
    return r.json()


def _reserve_escrow_and_activate(
    client: httpx.Client,
    contest: dict,
) -> None:
    client.post(
        f"{PAYMENT_URL}/escrow/reserve",
        json={
            "contest_id": contest["id"],
            "customer_id": contest["customer_id"],
            "amount": contest["prizepool"],
        },
        headers=_internal(),
    ).raise_for_status()
    client.patch(
        f"{CONTEST_URL}/contests/{contest['id']}/activate-internal",
        headers=_internal(),
    ).raise_for_status()


def bootstrap(client: httpx.Client) -> StackContext:
    admin = _ensure_admin(client)
    customer = _register_user(client, "customer")
    executor = _register_user(client, "executor")
    type_id = _ensure_contest_type(client, admin.token)
    contest = _create_contest(client, customer_token=customer.token, type_id=type_id)
    _reserve_escrow_and_activate(client, contest)
    stage_ids = [stage["id"] for stage in contest["stages"]]
    return StackContext(
        admin=admin,
        customer=customer,
        executor=executor,
        contest_id=contest["id"],
        customer_id=contest["customer_id"],
        executor_id=executor.id,
        stage_ids=stage_ids,
    )


def create_submission(
    client: httpx.Client,
    *,
    contest_id: int,
    executor_token: str,
    index: int,
) -> dict:
    r = client.post(
        f"{CONTEST_URL}/submissions",
        json={
            "contest_id": contest_id,
            "title": f"Research Submission {index}-{uuid4().hex[:6]}",
            "annotation": "A" * 60,
            "description": "D" * 200,
        },
        headers=_auth(executor_token),
    )
    r.raise_for_status()
    return r.json()
