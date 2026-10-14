from __future__ import annotations

import argparse
import csv
import json
import statistics
from pathlib import Path

import httpx

from research.config import (
    COUPLING_BASELINE_FILE,
    COUPLING_HIST_FILE,
    COUPLING_SUMMARY_FILE,
    COUPLING_TABLE_FILE,
    COUPLING_VALIDATION_OFF_FILE,
    COUPLING_VALIDATION_OFF_HIST_FILE,
    SCOPE_CREEP_FILE,
    SESSIONS_FILE,
)
from research.coupling_metric.baseline import baseline_breakdown
from research.coupling_metric.metric import (
    DEFAULT_WEIGHTS,
    compute_from_payloads,
    dispute_resolvability,
    fetch_audit,
    fetch_messages,
    scope_creep_rate,
)
from research.scenario_generator.bootstrap import ensure_admin


def _ensure_sessions() -> list[dict]:
    if not SESSIONS_FILE.exists():
        raise SystemExit(
            "sessions.json not found — run "
            "python -m research.scenario_generator.run first."
        )
    return json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))


def _group_by_template(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["template_code"], []).append(row)
    return grouped


def _write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _plot_hist(rows: list[dict], path: Path, *, title: str | None = None) -> None:
    import matplotlib.pyplot as plt

    structured = [row["sc_structured"] for row in rows]
    baseline = [row["sc_baseline"] for row in rows]

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.hist(
        [structured, baseline],
        bins=10,
        label=["Structured protocol", "Chat baseline"],
        color=["#1f77b4", "#d62728"],
        edgecolor="white",
    )
    ax.set_xlabel("Структурная связанность SC")
    ax.set_ylabel("Количество сессий")
    ax.set_xlim(0, 1)
    ax.set_title(title or "Распределение метрики SC для корпуса сессий")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _plot_scope_creep(rows: list[dict], path: Path) -> None:
    import matplotlib.pyplot as plt

    grouped = _group_by_template(rows)
    codes = sorted(grouped.keys())
    rates = [
        round(statistics.mean(row["scope_creep_rate"] for row in grouped[code]), 4)
        for code in codes
    ]

    fig, ax = plt.subplots(figsize=(6.5, 4))
    ax.bar(codes, rates, color="#ff7f0e", edgecolor="white")
    ax.set_ylabel("Доля scope-creep сообщений")
    ax.set_xlabel("Сценарий")
    ax.set_ylim(0, 1)
    ax.set_title("Scope creep: доля сообщений без связи со SpecVersion")
    for code, rate in zip(codes, rates):
        ax.text(code, rate + 0.02, f"{rate:.2f}", ha="center", va="bottom")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _aggregate(rows: list[dict]) -> list[dict]:
    grouped = _group_by_template(rows)
    summary: list[dict] = []
    for code in sorted(grouped.keys()):
        subset = grouped[code]
        summary.append(
            {
                "template_code": code,
                "sessions": len(subset),
                "sc_structured_mean": round(
                    statistics.mean(row["sc_structured"] for row in subset), 4
                ),
                "sc_baseline_mean": round(
                    statistics.mean(row["sc_baseline"] for row in subset), 4
                ),
                "typed_mean": round(
                    statistics.mean(row["typed_ratio"] for row in subset), 4
                ),
                "spec_mean": round(
                    statistics.mean(row["spec_ratio"] for row in subset), 4
                ),
                "requirement_mean": round(
                    statistics.mean(row["requirement_ratio"] for row in subset), 4
                ),
                "audit_mean": round(
                    statistics.mean(row["audit_ratio"] for row in subset), 4
                ),
                "scope_creep_mean": round(
                    statistics.mean(row["scope_creep_rate"] for row in subset), 4
                ),
                "dispute_resolvable_rate": round(
                    sum(1 for row in subset if row["dispute_resolvable"]) / len(subset),
                    4,
                ),
            }
        )
    return summary


def _compute_rows(session_rows: list[dict]) -> list[dict]:
    rows: list[dict] = []
    with httpx.Client(timeout=30.0) as client:
        admin = ensure_admin(client)
        token = admin.token

        for record in session_rows:
            messages = fetch_messages(
                client, session_id=record["session_id"], token=token
            )
            events = fetch_audit(
                client, session_id=record["session_id"], token=token
            )
            structured = compute_from_payloads(
                session_id=record["session_id"],
                messages=messages,
                audit_events=events,
                weights=DEFAULT_WEIGHTS,
            )
            baseline = baseline_breakdown(
                session_id=record["session_id"],
                messages=messages,
            )
            creep_rate = scope_creep_rate(record.get("creep_message_ids", []), messages)
            resolvable = dispute_resolvability(events)

            rows.append(
                {
                    "session_id": record["session_id"],
                    "template_code": record["template_code"],
                    "seed": record.get("seed"),
                    "is_conflict": record.get("is_conflict", False),
                    "final_state": record["final_state"],
                    "messages": record["message_count"],
                    "spec_versions": record["spec_versions"],
                    "typed_ratio": structured.typed_ratio,
                    "state_ratio": structured.state_ratio,
                    "spec_ratio": structured.spec_ratio,
                    "requirement_ratio": structured.requirement_ratio,
                    "audit_ratio": structured.audit_ratio,
                    "sc_structured": structured.score,
                    "sc_baseline": baseline.score,
                    "scope_creep_rate": creep_rate,
                    "dispute_resolvable": resolvable,
                }
            )
    return rows


def _baseline_rows(session_rows: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for record in session_rows:
        baseline = baseline_breakdown(
            session_id=record["session_id"],
            messages=[{"id": idx, "content": ""} for idx in range(record["message_count"])],
        )
        rows.append(
            {
                "session_id": record["session_id"],
                "template_code": record["template_code"],
                "seed": record.get("seed"),
                "is_conflict": record.get("is_conflict", False),
                "messages": record["message_count"],
                "sc_structured": baseline.score,
                "sc_baseline": baseline.score,
                "typed_ratio": 0.0,
                "state_ratio": 0.0,
                "spec_ratio": 0.0,
                "requirement_ratio": 0.0,
                "audit_ratio": 0.0,
                "scope_creep_rate": 0.0,
                "dispute_resolvable": False,
            }
        )
    return rows


def _summary_for_mode(label: str, rows: list[dict]) -> dict | None:
    if not rows:
        return None

    def _f(row: dict, key: str) -> float:
        return float(row[key])

    sc_values = [_f(row, "sc_structured") for row in rows]
    creep_values = [_f(row, "scope_creep_rate") for row in rows]
    return {
        "mode": label,
        "n_sessions": len(rows),
        "sc_mean": round(statistics.mean(sc_values), 4),
        "sc_median": round(statistics.median(sc_values), 4),
        "sc_min": round(min(sc_values), 4),
        "sc_max": round(max(sc_values), 4),
        "scope_creep_rate": round(statistics.mean(creep_values), 4),
    }


def run_strict() -> list[dict]:
    session_rows = _ensure_sessions()
    rows = _compute_rows(session_rows)
    _write_csv(rows, COUPLING_TABLE_FILE)
    summary = _aggregate(rows)
    summary_path = COUPLING_TABLE_FILE.with_name("coupling_per_template.csv")
    _write_csv(summary, summary_path)
    _plot_hist(rows, COUPLING_HIST_FILE, title="SC, strict mode")
    _plot_scope_creep(rows, SCOPE_CREEP_FILE)
    print(f"[strict] wrote {COUPLING_TABLE_FILE}")
    print(f"[strict] wrote per-template summary {summary_path}")
    print(f"[strict] wrote {COUPLING_HIST_FILE}")
    print(f"[strict] wrote {SCOPE_CREEP_FILE}")
    return rows


def run_relaxed() -> list[dict]:
    session_rows = _ensure_sessions()
    rows = _compute_rows(session_rows)
    _write_csv(rows, COUPLING_VALIDATION_OFF_FILE)
    _plot_hist(rows, COUPLING_VALIDATION_OFF_HIST_FILE, title="SC, STRICT_VALIDATION=false")
    print(f"[relaxed] wrote {COUPLING_VALIDATION_OFF_FILE}")
    print(f"[relaxed] wrote {COUPLING_VALIDATION_OFF_HIST_FILE}")
    return rows


def run_baseline() -> list[dict]:
    session_rows = _ensure_sessions()
    rows = _baseline_rows(session_rows)
    _write_csv(rows, COUPLING_BASELINE_FILE)
    print(f"[baseline] wrote {COUPLING_BASELINE_FILE}")
    return rows


def run_summary() -> None:
    summary_rows: list[dict] = []
    for label, path in (
        ("strict", COUPLING_TABLE_FILE),
        ("relaxed", COUPLING_VALIDATION_OFF_FILE),
        ("baseline", COUPLING_BASELINE_FILE),
    ):
        rows = _read_csv(path)
        row = _summary_for_mode(label, rows)
        if row is None:
            print(f"[summary] {label}: {path} not found, skipping")
            continue
        summary_rows.append(row)

    _write_csv(summary_rows, COUPLING_SUMMARY_FILE)
    print(f"[summary] wrote {COUPLING_SUMMARY_FILE}")
    for row in summary_rows:
        print(
            f"  {row['mode']}: n={row['n_sessions']}, "
            f"sc_mean={row['sc_mean']}, scope_creep_rate={row['scope_creep_rate']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="SC report orchestrator")
    parser.add_argument(
        "--mode",
        choices=["strict", "relaxed", "baseline", "summary", "all"],
        default="strict",
    )
    args = parser.parse_args()

    if args.mode == "strict":
        run_strict()
    elif args.mode == "relaxed":
        run_relaxed()
    elif args.mode == "baseline":
        run_baseline()
    elif args.mode == "summary":
        run_summary()
    elif args.mode == "all":
        run_strict()
        run_baseline()
        if COUPLING_VALIDATION_OFF_FILE.exists():
            print(
                "[all] coupling_validation_off.csv already present — "
                "including in summary."
            )
        else:
            print(
                "[all] coupling_validation_off.csv not found. Run "
                "research/load/run_sc_experiment.sh for an end-to-end "
                "strict + relaxed pass; the relaxed run requires a "
                "stack restart with STRICT_VALIDATION=false."
            )
        run_summary()


if __name__ == "__main__":
    main()
