from __future__ import annotations

from dataclasses import dataclass

import httpx

from research.coupling_metric.metric import fetch_audit


@dataclass(frozen=True)
class RecoveredAnswers:
    session_id: int
    q1_spec_version_id: int | None
    q2_scope_initiator_id: int | None
    q3_scope_decider_id: int | None


def recover(
    *,
    client: httpx.Client,
    session_id: int,
    admin_token: str,
) -> RecoveredAnswers:
    events = fetch_audit(client, session_id=session_id, token=admin_token)

    q1_spec: int | None = None
    last_event_with_spec_at_finish: dict | None = None
    for ev in events:
        if ev["event_type"] in {
            "action.cancel",
            "action.accept",
            "message.submission",
        }:
            last_event_with_spec_at_finish = ev
    if last_event_with_spec_at_finish is not None:
        q1_spec = (
            last_event_with_spec_at_finish.get("new_spec_version_id")
            or last_event_with_spec_at_finish.get("old_spec_version_id")
        )

    first_submission_at: str | None = None
    for ev in events:
        if ev["event_type"] == "message.submission":
            first_submission_at = ev["created_at"]
            break

    q2_initiator: int | None = None
    last_scope_change_event: dict | None = None
    for ev in events:
        if ev["event_type"] == "message.scope_change":
            last_scope_change_event = ev
    if last_scope_change_event is not None:
        q2_initiator = last_scope_change_event["actor_id"]
    elif first_submission_at is not None:
        for ev in events:
            if (
                ev["event_type"] == "spec.requirement_added"
                and ev["created_at"] >= first_submission_at
            ):
                q2_initiator = ev["actor_id"]

    q3_decider: int | None = None
    for ev in events:
        if ev["event_type"] in {
            "action.approve_scope_change",
            "action.reject_scope_change",
        }:
            q3_decider = ev["actor_id"]

    return RecoveredAnswers(
        session_id=session_id,
        q1_spec_version_id=q1_spec,
        q2_scope_initiator_id=q2_initiator,
        q3_scope_decider_id=q3_decider,
    )
