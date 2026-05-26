from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict

import httpx

from research.config import SESSIONS_FILE, SESSIONS_META_FILE
from research.scenario_generator.agents import DialogueRNG
from research.scenario_generator.bootstrap import (
    bootstrap,
    create_submission,
)
from research.scenario_generator.driver import Driver, SessionRecord, run_template
from research.scenario_generator.templates import TEMPLATES, get_template


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate scenario corpus")
    parser.add_argument("--per-template", type=int, default=15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args()

    started = time.time()

    with httpx.Client(timeout=args.timeout) as client:
        stack = bootstrap(client)
        records: list[SessionRecord] = []
        submission_index = 0
        for template in TEMPLATES:
            for run_index in range(args.per_template):
                seed = args.seed * 1000 + ord(template.code[-1]) * 100 + run_index
                rng = DialogueRNG(seed=seed)
                driver = Driver(
                    client=client,
                    customer_token=stack.customer.token,
                    executor_token=stack.executor.token,
                    rng=rng,
                    customer_id=stack.customer_id,
                    executor_id=stack.executor_id,
                )
                submission = create_submission(
                    client,
                    contest_id=stack.contest_id,
                    executor_token=stack.executor.token,
                    index=submission_index,
                )
                submission_index += 1
                record = run_template(
                    driver,
                    template,
                    submission_id=submission["id"],
                    stage_id=stack.stage_ids[0] if stack.stage_ids else None,
                )
                records.append(record)

    session_dicts: list[dict] = []
    for record in records:
        row = asdict(record)
        try:
            row["is_conflict"] = get_template(record.template_code).is_conflict
        except KeyError:
            row["is_conflict"] = False
        row["seed"] = (
            args.seed * 1000
            + ord(record.template_code[-1]) * 100
        )
        session_dicts.append(row)

    SESSIONS_FILE.write_text(
        json.dumps(session_dicts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    conflict_session_ids = [
        row["session_id"] for row in session_dicts if row["is_conflict"]
    ]
    lengths = [row["message_count"] for row in session_dicts]
    meta = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "duration_seconds": round(time.time() - started, 2),
        "per_template": args.per_template,
        "seed": args.seed,
        "templates": [template.code for template in TEMPLATES],
        "conflict_templates": [t.code for t in TEMPLATES if t.is_conflict],
        "total_sessions": len(records),
        "conflict_session_ids": conflict_session_ids,
        "length_min": min(lengths) if lengths else 0,
        "length_max": max(lengths) if lengths else 0,
        "length_mean": (
            round(sum(lengths) / len(lengths), 2) if lengths else 0.0
        ),
        "contest_id": stack.contest_id,
        "customer_id": stack.customer_id,
        "executor_id": stack.executor_id,
    }
    SESSIONS_META_FILE.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Generated {len(records)} sessions across {len(TEMPLATES)} templates "
        f"in {meta['duration_seconds']}s -> {SESSIONS_FILE} "
        f"(conflicts: {len(conflict_session_ids)}, "
        f"length range: {meta['length_min']}..{meta['length_max']})"
    )


if __name__ == "__main__":
    main()
