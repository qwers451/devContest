from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GroundTruth:
    session_id: int
    q1_spec_version_id: int | None
    q2_scope_initiator_id: int | None
    q3_scope_decider_id: int | None


def collect_ground_truth(*, session_record: dict) -> GroundTruth:
    return GroundTruth(
        session_id=int(session_record["session_id"]),
        q1_spec_version_id=session_record.get("expected_q1_spec_version_id"),
        q2_scope_initiator_id=session_record.get("expected_q2_scope_initiator_id"),
        q3_scope_decider_id=session_record.get("expected_q3_scope_decider_id"),
    )
