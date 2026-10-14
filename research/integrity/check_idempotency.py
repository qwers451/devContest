from __future__ import annotations

import argparse
import json
from collections import Counter

import httpx

from research.config import AUDIT_URL, INTERNAL_SECRET


def find_duplicate_command_ids() -> list[dict]:
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{AUDIT_URL}/internal/audit/events",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )
        r.raise_for_status()
        events = r.json()

    counter = Counter(event["command_id"] for event in events)
    duplicates = [
        {"command_id": cid, "count": count}
        for cid, count in counter.items()
        if count > 1
    ]
    return duplicates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Machine-readable output")
    args = parser.parse_args()

    duplicates = find_duplicate_command_ids()
    if args.json:
        print(json.dumps({"duplicates": duplicates}, ensure_ascii=False, indent=2))
    else:
        print(f"Idempotency check: {len(duplicates)} duplicate command_ids")
        for entry in duplicates:
            print(f"  {entry['command_id']}: {entry['count']}")


if __name__ == "__main__":
    main()
