import os
from uuid import uuid4

import httpx
import pytest

PROTOCOL_URL = os.getenv("PYTEST_PROTOCOL_URL", "http://localhost:8005")
AUDIT_URL = os.getenv("PYTEST_AUDIT_URL", "http://localhost:8006")
CONTEST_URL = os.getenv("PYTEST_CONTEST_URL", "http://localhost:8002")
GATEWAY_URL = os.getenv("PYTEST_GATEWAY_URL", "http://localhost:8080")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def create_submission(contest_id: int, executor_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest_id,
                "title": f"Protocol Submission {uuid4().hex[:8]}",
                "annotation": "protocol-flow",
                "description": "Protocol integration test submission",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text
        return response.json()


async def create_protocol_session(
    submission_id: int,
    token: str,
    *,
    expected_status: int = 201,
) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions",
            json={"submission_id": submission_id},
            headers=auth_headers(token),
        )
        assert response.status_code == expected_status, response.text
        return response.json()


@pytest.mark.asyncio
async def test_protocol_context_internal_contract(contest, executor_token):
    submission = await create_submission(contest["id"], executor_token)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{CONTEST_URL}/internal/submissions/{submission['id']}/protocol-context"
        )
        assert response.status_code == 403, response.text

        response = await client.get(
            f"{CONTEST_URL}/internal/submissions/{submission['id']}/protocol-context",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["submission_id"] == submission["id"]
        assert payload["contest_id"] == contest["id"]
        assert payload["customer_id"] == contest["customer_id"]
        assert payload["executor_id"] == submission["executor_id"]
        assert payload["tz_text"] == contest["tz_text"]

        contest_response = await client.get(
            f"{CONTEST_URL}/contests/{contest['id']}",
        )
        assert contest_response.status_code == 200, contest_response.text
        current_contest = contest_response.json()
        assert len(payload["stages"]) == len(current_contest["stages"])

        response = await client.get(
            f"{CONTEST_URL}/internal/submissions/999999999/protocol-context",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )
        assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_protocol_session_creation_and_gateway_proxy(
    contest,
    customer_token,
    executor_token,
    admin_token,
    outsider_token,
):
    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)

    assert session["submission_id"] == submission["id"]
    assert session["current_state"] == "draft"
    assert session["current_spec_version"]["version_number"] == 1
    assert session["spec_version_count"] == 1

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{GATEWAY_URL}/protocols/sessions/by-submission/{submission['id']}",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        gateway_session = response.json()
        assert gateway_session["id"] == session["id"]

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 200, response.text

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, response.text

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session['id']}",
            headers=auth_headers(outsider_token),
        )
        assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_protocol_state_guards_and_role_restrictions(
    contest,
    customer_token,
    executor_token,
    outsider_token,
):
    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)
    session_id = session["id"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"draft-info-{uuid4().hex}",
                "message_type": "info",
                "content": "Draft state should not accept discussion messages",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 409, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"start-forbidden-{uuid4().hex}"},
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 403, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"start-ok-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        assert response.json()["current_state"] == "active"

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"submit-customer-{uuid4().hex}",
                "message_type": "submission",
                "content": "Customer must not submit a result",
            },
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 403, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"defect-active-{uuid4().hex}",
                "message_type": "defect",
                "content": "Defect is only valid during review",
            },
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 409, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/cancel",
            json={"command_id": f"cancel-forbidden-{uuid4().hex}"},
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 403, response.text

        response = await client.get(
            f"{AUDIT_URL}/audit/events",
            params={"session_id": session_id},
            headers=auth_headers(outsider_token),
        )
        assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_scope_change_reject_and_submission_block(contest, customer_token, executor_token):
    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)
    session_id = session["id"]
    original_spec_version_id = session["current_spec_version"]["id"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"start-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"scope-{uuid4().hex}",
                "message_type": "scope_change",
                "content": "Need an additional export flow",
                "proposed_tz_text": "TZ v2 with export flow",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"submit-blocked-{uuid4().hex}",
                "message_type": "submission",
                "content": "Submission must be blocked while scope change is pending",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 409, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/reject-scope-change",
            json={"command_id": f"reject-own-{uuid4().hex}"},
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 403, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/reject-scope-change",
            json={"command_id": f"reject-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        rejected_session = response.json()
        assert rejected_session["current_state"] == "active"
        assert rejected_session["pending_spec_version_id"] is None
        assert rejected_session["current_spec_version_id"] == original_spec_version_id

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/spec-versions",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        spec_versions = response.json()
        assert len(spec_versions) == 2
        assert {version["status"] for version in spec_versions} == {"active", "rejected"}


@pytest.mark.asyncio
async def test_protocol_lifecycle_and_structure_report(
    contest,
    customer_token,
    executor_token,
):
    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)
    session_id = session["id"]
    spec_version_id = session["current_spec_version"]["id"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"start-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        assert response.json()["current_state"] == "active"

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/spec-versions/{spec_version_id}/requirements",
            json={
                "command_id": f"req-{uuid4().hex}",
                "title": "Need final screenshot",
                "description": "A final screenshot must be attached",
                "is_critical": True,
            },
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 201, response.text
        requirement = response.json()

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"clarify-{uuid4().hex}",
                "message_type": "clarification",
                "content": "Please clarify the expected screenshot format",
                "requirement_id": requirement["id"],
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"scope-{uuid4().hex}",
                "message_type": "scope_change",
                "content": "Need to add one extra admin export screen",
                "proposed_tz_text": "Updated TZ with one extra export screen",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/approve-scope-change",
            json={"command_id": f"approve-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        approved_session = response.json()
        assert approved_session["current_state"] == "active"
        assert approved_session["pending_spec_version_id"] is None

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"submit-1-{uuid4().hex}",
                "message_type": "submission",
                "content": "First version is ready for review",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"defect-{uuid4().hex}",
                "message_type": "defect",
                "content": "The screenshot does not include the export modal",
                "requirement_id": requirement["id"],
            },
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"submit-2-{uuid4().hex}",
                "message_type": "submission",
                "content": "Updated result with the export modal",
            },
            headers=auth_headers(executor_token),
        )
        assert response.status_code == 201, response.text

        response = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/accept",
            json={"command_id": f"accept-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        final_session = response.json()
        assert final_session["current_state"] == "done"

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/timeline",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        timeline = response.json()
        event_types = [event["event_type"] for event in timeline]
        assert event_types == [
            "session.created",
            "action.start",
            "spec.requirement_added",
            "message.clarification",
            "message.scope_change",
            "action.approve_scope_change",
            "message.submission",
            "message.defect",
            "message.submission",
            "action.accept",
        ]

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/structure-report",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        report = response.json()
        assert report["current_state"] == "done"
        assert report["total_messages"] == 5
        assert report["messages_with_requirement_link"] == 2
        assert report["requirement_link_ratio"] == 1.0
        assert report["audit_coverage_ratio"] == 1.0
        assert report["structural_connectedness_score"] >= 0.9

        response = await client.get(
            f"{AUDIT_URL}/audit/events",
            params={"session_id": session_id},
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        assert len(response.json()) == len(timeline)


@pytest.mark.asyncio
async def test_strict_validation_toggle(contest, customer_token, executor_token):
    strict = os.getenv("STRICT_VALIDATION", "true").strip().lower() != "false"

    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)
    session_id = session["id"]

    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": f"strict-start-{uuid4().hex}"},
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 200, r.text

        r = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": f"strict-clar-{uuid4().hex}",
                "message_type": "clarification",
                "content": "Lazy clarification without requirement_id",
            },
            headers=auth_headers(executor_token),
        )

        if strict:
            assert r.status_code in (409, 422), (
                f"strict_validation=true must reject clarifications "
                f"without requirement_id, got {r.status_code}: {r.text}"
            )
        else:
            assert r.status_code == 201, (
                f"strict_validation=false must accept clarifications "
                f"without requirement_id, got {r.status_code}: {r.text}"
            )


@pytest.mark.asyncio
async def test_protocol_commands_are_idempotent(
    contest,
    customer_token,
    executor_token,
):
    submission = await create_submission(contest["id"], executor_token)
    session = await create_protocol_session(submission["id"], customer_token)
    session_id = session["id"]

    action_command_id = f"start-fixed-{uuid4().hex}"
    message_command_id = f"info-fixed-{uuid4().hex}"

    async with httpx.AsyncClient() as client:
        first_start = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": action_command_id},
            headers=auth_headers(customer_token),
        )
        second_start = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/start",
            json={"command_id": action_command_id},
            headers=auth_headers(customer_token),
        )
        assert first_start.status_code == 200, first_start.text
        assert second_start.status_code == 200, second_start.text
        assert first_start.json() == second_start.json()

        first_message = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": message_command_id,
                "message_type": "info",
                "content": "Same informational message should only be created once",
            },
            headers=auth_headers(executor_token),
        )
        second_message = await client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json={
                "command_id": message_command_id,
                "message_type": "info",
                "content": "Same informational message should only be created once",
            },
            headers=auth_headers(executor_token),
        )
        assert first_message.status_code == 201, first_message.text
        assert second_message.status_code == 201, second_message.text
        assert first_message.json() == second_message.json()

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        messages = response.json()
        assert len(messages) == 1

        response = await client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/timeline",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 200, response.text
        timeline = response.json()
        assert [event["event_type"] for event in timeline] == [
            "session.created",
            "action.start",
            "message.info",
        ]
