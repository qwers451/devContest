from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

PROTOCOL_URL = os.getenv("PYTEST_PROTOCOL_URL", "http://localhost:8005")
AUDIT_URL = os.getenv("PYTEST_AUDIT_URL", "http://localhost:8006")
CONTEST_URL = os.getenv("PYTEST_CONTEST_URL", "http://localhost:8002")
OUTPUT_PATH = Path(
    os.getenv(
        "FSM_COVERAGE_OUTPUT",
        str(
            Path(__file__).resolve().parents[2]
            / "research"
            / "output"
            / "fsm_coverage.json"
        ),
    )
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _cid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


async def _new_submission(contest_id: int, executor_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest_id,
                "title": f"FSM Submission {uuid4().hex[:8]}",
                "annotation": "fsm-coverage",
                "description": "FSM coverage test submission",
            },
            headers=_auth(executor_token),
        )
        assert r.status_code == 201, r.text
        return r.json()


async def _bring_to_state(
    target_state: str,
    *,
    contest_id: int,
    customer_token: str,
    executor_token: str,
) -> dict:
    submission = await _new_submission(contest_id, executor_token)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions",
            json={"submission_id": submission["id"], "command_id": _cid("sess")},
            headers=_auth(customer_token),
        )
        assert r.status_code == 201, r.text
        session = r.json()

        spec_version_id = session["current_spec_version"]["id"]
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}"
            f"/spec-versions/{spec_version_id}/requirements",
            json={
                "command_id": _cid("req"),
                "title": "FSM coverage baseline requirement",
                "description": "Seed requirement for clarification/defect link",
                "is_critical": True,
            },
            headers=_auth(customer_token),
        )
        assert r.status_code == 201, r.text

        r = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text
        session = r.json()

        if target_state == "draft":
            return session

        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/start",
            json={"command_id": _cid("start")},
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text
        session = r.json()
        if target_state == "active":
            return session

        if target_state in {"negotiation", "rework", "review", "done"}:
            if target_state == "negotiation":
                r = await client.post(
                    f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/messages",
                    json={
                        "command_id": _cid("scope"),
                        "message_type": "scope_change",
                        "content": "Нужно расширить ТЗ",
                        "proposed_tz_text": "TZ v2 for FSM coverage",
                    },
                    headers=_auth(executor_token),
                )
                assert r.status_code == 201, r.text
                r = await client.get(
                    f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
                    headers=_auth(customer_token),
                )
                assert r.status_code == 200, r.text
                return r.json()

            if target_state in {"review", "rework", "done"}:
                r = await client.post(
                    f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/messages",
                    json={
                        "command_id": _cid("submit"),
                        "message_type": "submission",
                        "content": "Первая сдача",
                    },
                    headers=_auth(executor_token),
                )
                assert r.status_code == 201, r.text
                if target_state == "review":
                    r = await client.get(
                        f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
                        headers=_auth(customer_token),
                    )
                    return r.json()
                if target_state == "rework":
                    requirement_id = _seeded_requirement_id(session)
                    r = await client.post(
                        f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/messages",
                        json={
                            "command_id": _cid("defect"),
                            "message_type": "defect",
                            "content": "Не хватает экрана",
                            "requirement_id": requirement_id,
                        },
                        headers=_auth(customer_token),
                    )
                    assert r.status_code == 201, r.text
                    r = await client.get(
                        f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
                        headers=_auth(customer_token),
                    )
                    return r.json()
                if target_state == "done":
                    r = await client.post(
                        f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/accept",
                        json={"command_id": _cid("accept")},
                        headers=_auth(customer_token),
                    )
                    assert r.status_code == 200, r.text
                    return r.json()

        if target_state == "cancelled":
            r = await client.post(
                f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/cancel",
                json={"command_id": _cid("cancel")},
                headers=_auth(customer_token),
            )
            assert r.status_code == 200, r.text
            return r.json()

    raise ValueError(f"Unreachable target_state: {target_state}")


@dataclass
class Transition:
    source: str
    event: str
    actor: str
    expected_target: str | None
    expected_http: int
    notes: str = ""
    extra_payload: dict = field(default_factory=dict)


ALLOWED: list[Transition] = [
    Transition("draft", "action.start", "customer", "active", 200),
    Transition("draft", "action.cancel", "customer", "cancelled", 200),
    Transition("active", "message.info", "customer", "active", 201),
    Transition("active", "message.clarification", "executor", "active", 201),
    Transition("active", "message.scope_change", "executor", "negotiation", 201,
               extra_payload={"proposed_tz_text": "TZ v2"}),
    Transition("active", "message.submission", "executor", "review", 201),
    Transition("active", "action.cancel", "customer", "cancelled", 200),
    Transition("negotiation", "message.info", "customer", "negotiation", 201),
    Transition("negotiation", "action.approve-scope-change", "customer", "active", 200),
    Transition("negotiation", "action.reject-scope-change", "customer", "active", 200),
    Transition("negotiation", "action.cancel", "customer", "cancelled", 200),
    Transition("review", "message.info", "customer", "review", 201),
    Transition("review", "message.defect", "customer", "rework", 201),
    Transition("review", "action.accept", "customer", "done", 200),
    Transition("review", "action.cancel", "customer", "cancelled", 200),
    Transition("rework", "message.info", "executor", "rework", 201),
    Transition("rework", "message.submission", "executor", "review", 201),
    Transition("rework", "message.scope_change", "executor", "negotiation", 201,
               extra_payload={"proposed_tz_text": "TZ v3"}),
    Transition("rework", "action.cancel", "customer", "cancelled", 200),
]


FORBIDDEN: list[Transition] = [
    Transition("draft", "message.info", "executor", None, 409, notes="discussion in draft"),
    Transition("draft", "message.submission", "executor", None, 409, notes="submission in draft"),
    Transition("draft", "action.accept", "customer", None, 409, notes="accept in draft"),
    Transition("active", "action.start", "customer", None, 409, notes="start repeat"),
    Transition("active", "action.accept", "customer", None, 409, notes="accept without review"),
    Transition("active", "action.approve-scope-change", "customer", None, 409,
               notes="approve without pending"),
    Transition("active", "message.defect", "customer", None, 409, notes="defect in active"),
    Transition("negotiation", "message.submission", "executor", None, 409,
               notes="submission while pending scope"),
    Transition("negotiation", "message.scope_change", "executor", None, 409,
               notes="another scope while one pending",
               extra_payload={"proposed_tz_text": "TZ v99"}),
    Transition("review", "message.submission", "executor", None, 409,
               notes="double submission"),
    Transition("review", "action.approve-scope-change", "customer", None, 409,
               notes="approve without pending"),
    Transition("rework", "action.accept", "customer", None, 409,
               notes="accept without review"),
    Transition("done", "message.info", "customer", None, 409, notes="terminal"),
    Transition("done", "action.cancel", "customer", None, 409, notes="cancel after done"),
    Transition("cancelled", "message.info", "customer", None, 409, notes="terminal"),
]


ALL_TRANSITIONS = ALLOWED + FORBIDDEN

_MATRIX_RESULTS: list[dict] = []


def _token(actor: str, customer_token: str, executor_token: str) -> str:
    return customer_token if actor == "customer" else executor_token


def _kind_of(event: str) -> str:
    return "action" if event.startswith("action.") else "message"


def _seeded_requirement_id(session: dict) -> int | None:
    spec = session.get("current_spec_version") or {}
    requirements = spec.get("requirements") or []
    if requirements:
        return requirements[-1]["id"]
    return None


async def _fire_transition(
    session: dict,
    transition: Transition,
    *,
    customer_token: str,
    executor_token: str,
) -> httpx.Response:
    session_id = session["id"]
    token = _token(transition.actor, customer_token, executor_token)

    async with httpx.AsyncClient() as client:
        if _kind_of(transition.event) == "action":
            action = transition.event.split(".", 1)[1]
            return await client.post(
                f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/{action}",
                json={"command_id": _cid("t")},
                headers=_auth(token),
            )

        message_type = transition.event.split(".", 1)[1]
        payload = {
            "command_id": _cid("t"),
            "message_type": message_type,
            "content": f"FSM coverage ({transition.source}->{transition.expected_target or 'FORBIDDEN'})",
        }
        if (
            transition.expected_target is not None
            and message_type in {"clarification", "defect"}
        ):
            requirement_id = _seeded_requirement_id(session)
            if requirement_id is not None:
                payload["requirement_id"] = requirement_id
        payload.update(transition.extra_payload)
        return await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json=payload,
            headers=_auth(token),
        )


async def _events_for(session_id: int, token: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{AUDIT_URL}/audit/events",
            params={"session_id": session_id},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        return r.json()


@pytest.mark.parametrize(
    "transition",
    ALL_TRANSITIONS,
    ids=lambda t: f"{t.source}->{t.expected_target or 'X'}::{t.event}",
)
@pytest.mark.asyncio
async def test_fsm_transition(
    transition,
    contest,
    customer_token,
    executor_token,
):
    session = await _bring_to_state(
        transition.source,
        contest_id=contest["id"],
        customer_token=customer_token,
        executor_token=executor_token,
    )
    events_before = await _events_for(session["id"], customer_token)

    response = await _fire_transition(
        session,
        transition,
        customer_token=customer_token,
        executor_token=executor_token,
    )

    events_after = await _events_for(session["id"], customer_token)

    result = {
        "source": transition.source,
        "event": transition.event,
        "actor": transition.actor,
        "expected_target": transition.expected_target,
        "expected_http": transition.expected_http,
        "notes": transition.notes,
        "actual_http": response.status_code,
        "audit_before": len(events_before),
        "audit_after": len(events_after),
        "passed": False,
    }

    try:
        if transition.expected_target is None:
            assert response.status_code == transition.expected_http, (
                f"Expected {transition.expected_http} for "
                f"{transition.source} X {transition.event}, "
                f"got {response.status_code}: {response.text}"
            )
            assert len(events_after) == len(events_before), (
                "Forbidden transition must not write to audit"
            )
        else:
            assert response.status_code == transition.expected_http, (
                f"Expected {transition.expected_http} for "
                f"{transition.source}->{transition.expected_target}::"
                f"{transition.event}, got {response.status_code}: {response.text}"
            )
            body = response.json()
            if _kind_of(transition.event) == "action":
                actual_target = body["current_state"]
            else:
                async with httpx.AsyncClient() as client:
                    r = await client.get(
                        f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
                        headers=_auth(customer_token),
                    )
                    assert r.status_code == 200, r.text
                    actual_target = r.json()["current_state"]
            assert actual_target == transition.expected_target, (
                f"Expected {transition.expected_target}, got {actual_target}"
            )
            assert len(events_after) == len(events_before) + 1, (
                "Allowed transition must emit exactly one audit event"
            )
        result["passed"] = True
    finally:
        _MATRIX_RESULTS.append(result)


def _persist_matrix() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    total = len(_MATRIX_RESULTS)
    passed = sum(1 for row in _MATRIX_RESULTS if row["passed"])
    payload = {
        "total": total,
        "passed": passed,
        "coverage": round(passed / total, 4) if total else 0.0,
        "transitions": _MATRIX_RESULTS,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


@pytest.fixture(scope="module", autouse=True)
def _finalize_matrix():
    yield
    if _MATRIX_RESULTS:
        _persist_matrix()
