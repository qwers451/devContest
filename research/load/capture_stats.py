from __future__ import annotations

import argparse
import csv
import subprocess
import time
from pathlib import Path


COLUMNS = ["timestamp", "container", "cpu_perc", "mem_perc", "mem_usage", "net_io", "block_io"]


def _snapshot(container_filters: list[str] | None) -> list[dict]:
    try:
        result = subprocess.run(
            [
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.Name}}|{{.CPUPerc}}|{{.MemPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return []

    snapshot: list[dict] = []
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    for line in result.stdout.strip().splitlines():
        parts = line.split("|")
        if len(parts) < 6:
            continue
        name = parts[0]
        if container_filters:
            if not any(needle in name for needle in container_filters):
                continue
        snapshot.append(
            {
                "timestamp": now,
                "container": name,
                "cpu_perc": parts[1],
                "mem_perc": parts[2],
                "mem_usage": parts[3],
                "net_io": parts[4],
                "block_io": parts[5],
            }
        )
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=180.0)
    parser.add_argument("--interval", type=float, default=5.0)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--container",
        action="append",
        dest="containers",
        default=None,
        help=(
            "Restrict capture to containers whose ``docker stats`` Name "
            "contains the given substring. May be passed multiple times."
        ),
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    deadline = time.time() + args.duration
    while time.time() < deadline:
        rows.extend(_snapshot(args.containers))
        time.sleep(args.interval)

    with args.output.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Wrote {len(rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
