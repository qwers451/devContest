from __future__ import annotations

from typing import Any

import httpx

from research.blind_recovery.questions import GroundTruth, collect_ground_truth
from research.blind_recovery.recover import recover



CUSTOMER_ID = 1001
EXECUTOR_ID = 1002
SESSION_ID = 4242

SCOPE_CHANGE_AUTHOR_ID = EXECUTOR_ID
SCOPE_DECIDER_ID = CUSTOMER_ID
FINAL_SPEC_ID = 7


def _record(
    *,
    q1: int | None = FINAL_SPEC_ID,
    q2: int | None = SCOPE_CHANGE_AUTHOR_ID,
    q3: int | None = SCOPE_DECIDER_ID,
) -> dict:
    return {
        "session_id": SESSION_ID,
        "submission_id": 12345,
        "template_code": "S4",
        "final_state": "cancelled",
        "message_count": 50,
        "spec_versions": 2,
        "requirements": [],
        "creep_message_ids": [],
        "is_conflict": True,
        "seed": 1,
        "expected_q1_spec_version_id": q1,
        "expected_q2_scope_initiator_id": q2,
        "expected_q3_scope_decider_id": q3,
    }


def _audit_events() -> list[dict]:
    return [
        {
            "event_type": "session.created",
            "actor_id": CUSTOMER_ID,
            "old_state": None,
            "new_state": "draft",
            "old_spec_version_id": None,
            "new_spec_version_id": 1,
            "created_at": "2026-05-04T10:00:00",
        },
        {
            "event_type": "action.start",
            "actor_id": CUSTOMER_ID,
            "old_state": "draft",
            "new_state": "active",
            "old_spec_version_id": 1,
            "new_spec_version_id": 1,
            "created_at": "2026-05-04T10:01:00",
        },
        {
            "event_type": "message.scope_change",
            "actor_id": SCOPE_CHANGE_AUTHOR_ID,
            "old_state": "active",
            "new_state": "negotiation",
            "old_spec_version_id": 1,
            "new_spec_version_id": 2,
            "created_at": "2026-05-04T10:02:00",
        },
        {
            "event_type": "action.approve_scope_change",
            "actor_id": SCOPE_DECIDER_ID,
            "old_state": "negotiation",
            "new_state": "active",
            "old_spec_version_id": 1,
            "new_spec_version_id": FINAL_SPEC_ID,
            "created_at": "2026-05-04T10:03:00",
        },
        {
            "event_type": "message.submission",
            "actor_id": EXECUTOR_ID,
            "old_state": "active",
            "new_state": "review",
            "old_spec_version_id": FINAL_SPEC_ID,
            "new_spec_version_id": FINAL_SPEC_ID,
            "created_at": "2026-05-04T10:04:00",
        },
        {
            "event_type": "action.cancel",
            "actor_id": CUSTOMER_ID,
            "old_state": "review",
            "new_state": "cancelled",
            "old_spec_version_id": FINAL_SPEC_ID,
            "new_spec_version_id": FINAL_SPEC_ID,
            "created_at": "2026-05-04T10:05:00",
        },
    ]


class _StubResponse:
    def __init__(self, payload: list[dict]) -> None:
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._payload


class _StubClient:
    def __init__(self, payload: list[dict]) -> None:
        self.payload = payload
        self.calls: list[tuple[str, dict | None]] = []

    def get(self, url: str, *, params: dict | None = None, headers: dict | None = None):
        self.calls.append((url, params))
        return _StubResponse(self.payload)


def _stub_client(events: list[dict]) -> httpx.Client:
    return _StubClient(events)




def test_collect_ground_truth_reads_session_record_no_api_call():
    record = _record()
    truth = collect_ground_truth(session_record=record)
    assert isinstance(truth, GroundTruth)
    assert truth.session_id == SESSION_ID
    assert truth.q1_spec_version_id == FINAL_SPEC_ID
    assert truth.q2_scope_initiator_id == SCOPE_CHANGE_AUTHOR_ID
    assert truth.q3_scope_decider_id == SCOPE_DECIDER_ID


def test_blind_recovery_full_match():
    record = _record()
    truth = collect_ground_truth(session_record=record)
    answer = recover(
        client=_stub_client(_audit_events()),
        session_id=SESSION_ID,
        admin_token="anything",
    )
    assert answer.q1_spec_version_id == truth.q1_spec_version_id
    assert answer.q2_scope_initiator_id == truth.q2_scope_initiator_id
    assert answer.q3_scope_decider_id == truth.q3_scope_decider_id


def test_blind_recovery_q2_mismatch_makes_full_recovery_false():
    record = _record(q2=99999)
    truth = collect_ground_truth(session_record=record)
    answer = recover(
        client=_stub_client(_audit_events()),
        session_id=SESSION_ID,
        admin_token="anything",
    )
    q1_match = truth.q1_spec_version_id == answer.q1_spec_version_id
    q2_match = truth.q2_scope_initiator_id == answer.q2_scope_initiator_id
    q3_match = truth.q3_scope_decider_id == answer.q3_scope_decider_id
    assert q1_match is True
    assert q2_match is False
    assert q3_match is True
    assert (q1_match and q2_match and q3_match) is False


def test_blind_recovery_q3_mismatch_makes_full_recovery_false():
    record = _record(q3=88888)
    truth = collect_ground_truth(session_record=record)
    answer = recover(
        client=_stub_client(_audit_events()),
        session_id=SESSION_ID,
        admin_token="anything",
    )
    assert truth.q3_scope_decider_id != answer.q3_scope_decider_id
    fully_recovered = (
        truth.q1_spec_version_id == answer.q1_spec_version_id
        and truth.q2_scope_initiator_id == answer.q2_scope_initiator_id
        and truth.q3_scope_decider_id == answer.q3_scope_decider_id
    )
    assert fully_recovered is False


def test_recover_does_not_import_protocol_modules():
    import research.blind_recovery.recover as r

    src = open(r.__file__, encoding="utf-8").read()
    assert "PROTOCOL_URL" not in src
    assert "fetch_messages" not in src
    assert "ensure_admin" not in src
