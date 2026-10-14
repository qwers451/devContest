from __future__ import annotations

import os
from uuid import uuid4

import httpx
import pytest

PROTOCOL_URL = os.getenv("PYTEST_PROTOCOL_URL", "http://localhost:8005")
MONITORING_URL = os.getenv("PYTEST_MONITORING_URL", "http://localhost:8007")
AUDIT_URL = os.getenv("PYTEST_AUDIT_URL", "http://localhost:8006")
CONTEST_URL = os.getenv("PYTEST_CONTEST_URL", "http://localhost:8002")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _new_submission(contest_id: int, executor_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest_id,
                "title": f"RBAC Submission {uuid4().hex[:8]}",
                "annotation": "rbac",
                "description": "RBAC integration test submission",
            },
            headers=_auth(executor_token),
        )
        assert r.status_code == 201, r.text
        return r.json()


async def _new_session(submission_id: int, customer_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions",
            json={"submission_id": submission_id, "command_id": f"sess-{uuid4().hex}"},
            headers=_auth(customer_token),
        )
        assert r.status_code == 201, r.text
        return r.json()


async def _start(session_id: int, customer_token: str) -> None:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"start-{uuid4().hex}"},
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_rbac_executor_cannot_accept(
    contest, customer_token, executor_token
):
    submission = await _new_submission(contest["id"], executor_token)
    session = await _new_session(submission["id"], customer_token)
    await _start(session["id"], customer_token)

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/messages",
            json={
                "command_id": f"sub-{uuid4().hex}",
                "message_type": "submission",
                "content": "ready",
            },
            headers=_auth(executor_token),
        )
        assert r.status_code == 201, r.text

        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/accept",
            json={"command_id": f"accept-{uuid4().hex}"},
            headers=_auth(executor_token),
        )
        assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_rbac_customer_cannot_submit(
    contest, customer_token, executor_token
):
    submission = await _new_submission(contest["id"], executor_token)
    session = await _new_session(submission["id"], customer_token)
    await _start(session["id"], customer_token)

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/messages",
            json={
                "command_id": f"sub-{uuid4().hex}",
                "message_type": "submission",
                "content": "Customer must not submit",
            },
            headers=_auth(customer_token),
        )
        assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_rbac_anonymous_protocol_call_is_401(contest, customer_token, executor_token):
    submission = await _new_submission(contest["id"], executor_token)
    session = await _new_session(submission["id"], customer_token)

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{PROTOCOL_URL}/protocols/sessions/{session['id']}")
        assert r.status_code == 401, r.text

        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/start",
            json={"command_id": f"start-{uuid4().hex}"},
        )
        assert r.status_code == 401, r.text


@pytest.mark.asyncio
async def test_rbac_admin_cannot_silently_finish_active_session(
    contest, customer_token, executor_token, admin_token
):
    submission = await _new_submission(contest["id"], executor_token)
    session = await _new_session(submission["id"], customer_token)
    await _start(session["id"], customer_token)

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/accept",
            json={"command_id": f"admin-accept-{uuid4().hex}"},
            headers=_auth(admin_token),
        )
        assert r.status_code in (403, 409), r.text


@pytest.mark.asyncio
async def test_rbac_monitoring_admin_endpoint_isolation(
    admin_token, customer_token
):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{MONITORING_URL}/monitoring/check-runs/latest")
        assert r.status_code == 401, r.text

        r = await client.get(
            f"{MONITORING_URL}/monitoring/check-runs/latest",
            headers=_auth(customer_token),
        )
        assert r.status_code == 403, r.text

        r = await client.get(
            f"{MONITORING_URL}/monitoring/check-runs/latest",
            headers=_auth(admin_token),
        )
        if r.status_code == 404:
            trigger = await client.post(
                f"{MONITORING_URL}/monitoring/check-runs",
                headers=_auth(admin_token),
            )
            assert trigger.status_code == 201, trigger.text
            r = await client.get(
                f"{MONITORING_URL}/monitoring/check-runs/latest",
                headers=_auth(admin_token),
            )
        assert r.status_code == 200, r.text
