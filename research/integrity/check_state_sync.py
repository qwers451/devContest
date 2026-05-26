from __future__ import annotations

import argparse
import json

import httpx

from research.config import (
    AUDIT_URL,
    INTERNAL_SECRET,
    PROTOCOL_URL,
    SESSIONS_FILE,
)
from research.scenario_generator.bootstrap import ensure_admin


def _last_state_event(events: list[dict]) -> dict | None:
    for event in reversed(events):
        if event.get("new_state"):
            return event
    return None


def find_state_sync_violations() -> list[dict]:
    if not SESSIONS_FILE.exists():
        raise SystemExit(
            "sessions.json not found — run the scenario generator first."
        )
    sessions = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))

    violations: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        admin = ensure_admin(client)
        for record in sessions:
            session_id = record["session_id"]
            r = client.get(
                f"{PROTOCOL_URL}/protocols/sessions/{session_id}",
                headers={"Authorization": f"Bearer {admin.token}"},
            )
            r.raise_for_status()
            session = r.json()

            r = client.get(
                f"{AUDIT_URL}/internal/audit/events",
                params={"session_id": session_id},
                headers={"x-internal-secret": INTERNAL_SECRET},
            )
            r.raise_for_status()
            events = r.json()

            last = _last_state_event(events)
            audit_state = last["new_state"] if last else None
            protocol_state = session["current_state"]

            if audit_state != protocol_state:
                violations.append(
                    {
                        "session_id": session_id,
                        "protocol_state": protocol_state,
                        "audit_last_state": audit_state,
                    }
                )

    return violations


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    violations = find_state_sync_violations()
    if args.json:
        print(json.dumps({"violations": violations}, ensure_ascii=False, indent=2))
    else:
        print(f"State-sync check: {len(violations)} violations")
        for entry in violations:
            print(f"  session {entry['session_id']}: "
                  f"protocol={entry['protocol_state']} vs audit={entry['audit_last_state']}")


if __name__ == "__main__":
    main()
