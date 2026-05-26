from __future__ import annotations

import json

from research.config import INTEGRITY_REPORT_FILE
from research.integrity.check_audit_coverage import find_audit_coverage_violations
from research.integrity.check_idempotency import find_duplicate_command_ids
from research.integrity.check_state_sync import find_state_sync_violations


def main() -> None:
    idempotency = find_duplicate_command_ids()
    state_sync = find_state_sync_violations()
    audit_coverage = find_audit_coverage_violations()

    report = {
        "idempotency_violations": len(idempotency),
        "state_sync_violations": len(state_sync),
        "audit_coverage_violations": len(audit_coverage),
        "passed": (
            len(idempotency) == 0
            and len(state_sync) == 0
            and len(audit_coverage) == 0
        ),
        "details": {
            "idempotency": idempotency,
            "state_sync": state_sync,
            "audit_coverage": audit_coverage,
        },
    }
    INTEGRITY_REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    INTEGRITY_REPORT_FILE.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {INTEGRITY_REPORT_FILE}")
    print(
        f"idempotency={report['idempotency_violations']}, "
        f"state_sync={report['state_sync_violations']}, "
        f"audit_coverage={report['audit_coverage_violations']}, "
        f"passed={report['passed']}"
    )


if __name__ == "__main__":
    main()
