from __future__ import annotations

import argparse
import csv
import json
import random

import httpx

from research.blind_recovery.questions import collect_ground_truth
from research.blind_recovery.recover import recover
from research.config import (
    BLIND_RECOVERY_FILE,
    BLIND_RECOVERY_SUMMARY_FILE,
    SESSIONS_FILE,
    SESSIONS_META_FILE,
)
from research.scenario_generator.bootstrap import ensure_admin


def _load_conflict_sessions(*, sample_size: int, seed: int) -> list[dict]:
    if not SESSIONS_FILE.exists():
        raise SystemExit(
            "sessions.json not found — run "
            "python -m research.scenario_generator.run first."
        )
    sessions = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    conflict = [s for s in sessions if s.get("is_conflict")]

    missing_truth = [
        s["session_id"]
        for s in conflict
        if "expected_q1_spec_version_id" not in s
        or "expected_q2_scope_initiator_id" not in s
        or "expected_q3_scope_decider_id" not in s
    ]
    if missing_truth:
        raise SystemExit(
            "Ground-truth fields missing on these sessions "
            f"(n={len(missing_truth)}, first 5: {missing_truth[:5]}). "
            "Regenerate the corpus with the current driver: "
            "python -m research.scenario_generator.run"
        )

    if SESSIONS_META_FILE.exists():
        meta = json.loads(SESSIONS_META_FILE.read_text(encoding="utf-8"))
        meta_ids = set(meta.get("conflict_session_ids") or [])
        if meta_ids and meta_ids != {s["session_id"] for s in conflict}:
            print(
                "[warn] sessions.json and sessions_meta.json disagree on "
                "the conflict pool; using sessions.json"
            )

    if len(conflict) <= sample_size:
        return conflict
    rng = random.Random(seed)
    return sorted(rng.sample(conflict, sample_size), key=lambda s: s["session_id"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Blind recovery experiment")
    parser.add_argument("--sample-size", type=int, default=15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    conflict_sessions = _load_conflict_sessions(
        sample_size=args.sample_size, seed=args.seed
    )
    if not conflict_sessions:
        raise SystemExit(
            "No conflict sessions found. Generate a corpus that "
            "includes S4/S6 templates first."
        )

    rows: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        admin = ensure_admin(client)
        for record in conflict_sessions:
            session_id = int(record["session_id"])
            truth = collect_ground_truth(session_record=record)
            answer = recover(
                client=client,
                session_id=session_id,
                admin_token=admin.token,
            )

            q1_match = truth.q1_spec_version_id == answer.q1_spec_version_id
            q2_match = truth.q2_scope_initiator_id == answer.q2_scope_initiator_id
            q3_match = truth.q3_scope_decider_id == answer.q3_scope_decider_id
            rows.append(
                {
                    "session_id": session_id,
                    "template_code": record.get("template_code"),
                    "truth_q1_spec_version_id": truth.q1_spec_version_id,
                    "answer_q1_spec_version_id": answer.q1_spec_version_id,
                    "q1_match": q1_match,
                    "truth_q2_scope_initiator_id": truth.q2_scope_initiator_id,
                    "answer_q2_scope_initiator_id": answer.q2_scope_initiator_id,
                    "q2_match": q2_match,
                    "truth_q3_scope_decider_id": truth.q3_scope_decider_id,
                    "answer_q3_scope_decider_id": answer.q3_scope_decider_id,
                    "q3_match": q3_match,
                    "fully_recovered": q1_match and q2_match and q3_match,
                }
            )

    BLIND_RECOVERY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with BLIND_RECOVERY_FILE.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    recovered = sum(1 for row in rows if row["fully_recovered"])
    summary = {
        "sample_size": len(rows),
        "fully_recovered": recovered,
        "ratio": round(recovered / len(rows), 4) if rows else 0.0,
        "q1_match_rate": round(
            sum(1 for r in rows if r["q1_match"]) / len(rows), 4
        )
        if rows
        else 0.0,
        "q2_match_rate": round(
            sum(1 for r in rows if r["q2_match"]) / len(rows), 4
        )
        if rows
        else 0.0,
        "q3_match_rate": round(
            sum(1 for r in rows if r["q3_match"]) / len(rows), 4
        )
        if rows
        else 0.0,
        "mismatched_sessions": [
            {
                "session_id": r["session_id"],
                "template_code": r["template_code"],
                "q1": r["q1_match"],
                "q2": r["q2_match"],
                "q3": r["q3_match"],
            }
            for r in rows
            if not r["fully_recovered"]
        ],
    }
    BLIND_RECOVERY_SUMMARY_FILE.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {BLIND_RECOVERY_FILE}")
    print(f"Wrote {BLIND_RECOVERY_SUMMARY_FILE}")
    print(f"Recovered: {recovered}/{len(rows)} ({summary['ratio']:.0%})")
    if summary["mismatched_sessions"]:
        print("Mismatches:")
        for m in summary["mismatched_sessions"]:
            print(
                f"  session {m['session_id']} ({m['template_code']}): "
                f"q1={m['q1']} q2={m['q2']} q3={m['q3']}"
            )


if __name__ == "__main__":
    main()
