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


MESSAGE_EVENT_TYPES = {
    "message.info",
    "message.clarification",
    "message.scope_change",
    "message.submission",
    "message.defect",
}


def find_audit_coverage_violations() -> list[dict]:
    if not SESSIONS_FILE.exists():
        raise SystemExit("sessions.json not found — run the scenario generator first.")
    sessions = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))

    violations: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        admin = ensure_admin(client)
        for record in sessions:
            session_id = record["session_id"]
            r = client.get(
                f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
                headers={"Authorization": f"Bearer {admin.token}"},
            )
            r.raise_for_status()
            protocol_messages = r.json()
            protocol_message_count = len(protocol_messages)

            r = client.get(
                f"{AUDIT_URL}/internal/audit/events",
                params={"session_id": session_id},
                headers={"x-internal-secret": INTERNAL_SECRET},
            )
            r.raise_for_status()
            events = r.json()
            audit_message_event_count = sum(
                1 for ev in events if ev["event_type"] in MESSAGE_EVENT_TYPES
            )

            if audit_message_event_count < protocol_message_count:
                violations.append(
                    {
                        "session_id": session_id,
                        "protocol_messages": protocol_message_count,
                        "audit_message_events": audit_message_event_count,
                        "missing": protocol_message_count - audit_message_event_count,
                    }
                )

    return violations


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    violations = find_audit_coverage_violations()
    if args.json:
        print(json.dumps({"violations": violations}, ensure_ascii=False, indent=2))
    else:
        print(f"Audit-coverage check: {len(violations)} violations")
        for entry in violations:
            print(
                f"  session {entry['session_id']}: "
                f"messages={entry['protocol_messages']}, "
                f"audit_events={entry['audit_message_events']} "
                f"(missing {entry['missing']})"
            )


if __name__ == "__main__":
    main()
