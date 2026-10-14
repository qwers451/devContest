from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

import httpx

from research.config import AUDIT_URL, PROTOCOL_URL

DEFAULT_WEIGHTS = {
    "typed": 0.2,
    "state": 0.2,
    "spec": 0.2,
    "requirement": 0.2,
    "audit": 0.2,
}


@dataclass(frozen=True)
class CouplingBreakdown:
    session_id: int
    total_messages: int
    typed_ratio: float
    state_ratio: float
    spec_ratio: float
    requirement_ratio: float
    audit_ratio: float
    score: float

    def as_row(self, *, extra: Mapping[str, object] | None = None) -> dict:
        row = {
            "session_id": self.session_id,
            "total_messages": self.total_messages,
            "typed_ratio": self.typed_ratio,
            "state_ratio": self.state_ratio,
            "spec_ratio": self.spec_ratio,
            "requirement_ratio": self.requirement_ratio,
            "audit_ratio": self.audit_ratio,
            "score": self.score,
        }
        if extra:
            row.update(dict(extra))
        return row


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _safe_ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 1.0
    return numerator / denominator


def _weighted_score(
    components: Mapping[str, float],
    weights: Mapping[str, float],
) -> float:
    total_weight = sum(weights.values())
    weighted = sum(components[key] * weights[key] for key in weights)
    return round(weighted / total_weight if total_weight else 0.0, 4)


def fetch_messages(
    client: httpx.Client,
    *,
    session_id: int,
    token: str,
) -> list[dict]:
    r = client.get(
        f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
        headers=_auth(token),
    )
    r.raise_for_status()
    return r.json()


def fetch_structure_report(
    client: httpx.Client,
    *,
    session_id: int,
    token: str,
) -> dict:
    r = client.get(
        f"{PROTOCOL_URL}/protocols/sessions/{session_id}/structure-report",
        headers=_auth(token),
    )
    r.raise_for_status()
    return r.json()


def fetch_audit(
    client: httpx.Client,
    *,
    session_id: int,
    token: str,
) -> list[dict]:
    r = client.get(
        f"{AUDIT_URL}/audit/events",
        params={"session_id": session_id},
        headers=_auth(token),
    )
    r.raise_for_status()
    return r.json()


def compute_from_payloads(
    *,
    session_id: int,
    messages: Iterable[dict],
    audit_events: Iterable[dict],
    weights: Mapping[str, float] = DEFAULT_WEIGHTS,
) -> CouplingBreakdown:
    messages = list(messages)
    audit_events = list(audit_events)
    total = len(messages)

    typed = sum(1 for m in messages if m.get("message_type") is not None)
    state = sum(1 for m in messages if m.get("task_state_at_send") is not None)
    spec = sum(1 for m in messages if m.get("spec_version_id") is not None)
    applicable_req_kinds = {"clarification", "defect"}
    applicable_req = sum(1 for m in messages if m.get("message_type") in applicable_req_kinds)
    req = sum(
        1
        for m in messages
        if m.get("message_type") in applicable_req_kinds
        and m.get("requirement_id") is not None
    )

    expected_audit_events = total
    audit_ratio = _safe_ratio(min(len(audit_events), expected_audit_events), expected_audit_events)

    components = {
        "typed": _safe_ratio(typed, total),
        "state": _safe_ratio(state, total),
        "spec": _safe_ratio(spec, total),
        "requirement": _safe_ratio(req, applicable_req),
        "audit": audit_ratio,
    }
    score = _weighted_score(components, weights)
    return CouplingBreakdown(
        session_id=session_id,
        total_messages=total,
        typed_ratio=round(components["typed"], 4),
        state_ratio=round(components["state"], 4),
        spec_ratio=round(components["spec"], 4),
        requirement_ratio=round(components["requirement"], 4),
        audit_ratio=round(components["audit"], 4),
        score=score,
    )


def coupling_score(
    client: httpx.Client,
    *,
    session_id: int,
    token: str,
    weights: Mapping[str, float] = DEFAULT_WEIGHTS,
) -> CouplingBreakdown:
    messages = fetch_messages(client, session_id=session_id, token=token)
    events = fetch_audit(client, session_id=session_id, token=token)
    return compute_from_payloads(
        session_id=session_id,
        messages=messages,
        audit_events=events,
        weights=weights,
    )


def scope_creep_rate(
    creep_message_ids: Iterable[int],
    messages: Iterable[dict],
) -> float:
    creep_ids = set(creep_message_ids)
    if not creep_ids:
        return 0.0
    messages = list(messages)
    unlinked = sum(
        1
        for message in messages
        if message["id"] in creep_ids and message.get("spec_version_id") is None
    )
    return round(unlinked / len(creep_ids), 4)


def dispute_resolvability(audit_events: Iterable[dict]) -> bool:
    events = [event for event in audit_events]
    if not events:
        return False
    last_state: str | None = None
    for event in events:
        if not event.get("command_id"):
            return False
        new_state = event.get("new_state")
        old_state = event.get("old_state")
        if last_state is not None and old_state is not None and old_state != last_state:
            return False
        if new_state is not None:
            last_state = new_state
    return True
