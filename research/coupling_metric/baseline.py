from __future__ import annotations

from typing import Iterable, Mapping

from research.coupling_metric.metric import (
    DEFAULT_WEIGHTS,
    CouplingBreakdown,
)


def chat_payloads(messages: Iterable[dict]) -> list[dict]:
    stripped: list[dict] = []
    for index, message in enumerate(messages):
        stripped.append(
            {
                "id": message.get("id", index),
                "message_type": None,
                "task_state_at_send": None,
                "spec_version_id": None,
                "requirement_id": None,
                "content": message.get("content", ""),
            }
        )
    return stripped


def _weighted_score(
    components: Mapping[str, float],
    weights: Mapping[str, float],
) -> float:
    total_weight = sum(weights.values())
    if not total_weight:
        return 0.0
    return round(
        sum(components[key] * weights[key] for key in weights) / total_weight,
        4,
    )


def baseline_breakdown(
    *,
    session_id: int,
    messages: Iterable[dict],
    weights: Mapping[str, float] = DEFAULT_WEIGHTS,
) -> CouplingBreakdown:
    stripped = chat_payloads(messages)
    total = len(stripped)
    components = {
        "typed": 0.0,
        "state": 0.0,
        "spec": 0.0,
        "requirement": 0.0,
        "audit": 0.0,
    }
    score = _weighted_score(components, weights)
    return CouplingBreakdown(
        session_id=session_id,
        total_messages=total,
        typed_ratio=components["typed"],
        state_ratio=components["state"],
        spec_ratio=components["spec"],
        requirement_ratio=components["requirement"],
        audit_ratio=components["audit"],
        score=score,
    )
