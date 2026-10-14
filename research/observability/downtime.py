from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from uuid import uuid4

import httpx

from research.config import (
    DEFAULT_PASSWORD,
    INTERNAL_SECRET,
    MONITORING_URL,
    OBSERVABILITY_REPORT_FILE,
    USER_URL,
)


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def _compose_cmd() -> list[str]:
    raw = os.getenv("DOCKER_COMPOSE", "docker compose")
    return raw.split()


def _admin_token(client: httpx.Client) -> str:
    r = client.post(
        f"{USER_URL}/auth/login",
        json={"login": "admin", "password": "admin123"},
    )
    if r.status_code == 200:
        return r.json()["access_token"]
    r = client.post(
        f"{USER_URL}/auth/register",
        json={
            "login": "admin",
            "email": "admin@example.com",
            "password": "admin123",
            "role": "admin",
        },
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _customer_token(client: httpx.Client) -> str:
    login = f"observability_{int(time.time())}_{uuid4().hex[:6]}"
    r = client.post(
        f"{USER_URL}/auth/register",
        json={
            "login": login,
            "email": f"{login}@test.com",
            "password": DEFAULT_PASSWORD,
            "role": "customer",
        },
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _trigger_check_run(client: httpx.Client, admin_token: str) -> dict:
    r = client.post(
        f"{MONITORING_URL}/monitoring/check-runs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r.raise_for_status()
    return r.json()


def _service_status(run: dict, name: str) -> str | None:
    for service in run.get("services", []):
        if service["service_name"] == name:
            return service["status"]
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--service", default="protocol-service")
    parser.add_argument("--max-wait-sec", type=float, default=120.0)
    parser.add_argument(
        "--skip-restart",
        action="store_true",
        help="Skip docker compose stop/start (useful for local testing).",
    )
    args = parser.parse_args()

    compose = _compose_cmd()
    report: dict = {
        "service": args.service,
        "t_detected_sec": None,
        "anon_admin_logs_status": None,
        "user_admin_logs_status": None,
        "passed": False,
        "notes": [],
    }

    with httpx.Client(timeout=20.0) as client:
        admin_token = _admin_token(client)
        anon = client.get(f"{MONITORING_URL}/monitoring/check-runs/latest")
        report["anon_admin_logs_status"] = anon.status_code

        user_token = _customer_token(client)
        user_resp = client.get(
            f"{MONITORING_URL}/monitoring/check-runs/latest",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        report["user_admin_logs_status"] = user_resp.status_code

        if not args.skip_restart:
            try:
                _run([*compose, "stop", args.service])
            except (FileNotFoundError, subprocess.CalledProcessError) as exc:
                report["notes"].append(f"docker compose stop failed: {exc}")
                _emit(report)
                return

            t_stopped = time.monotonic()
            t_detected: float | None = None
            deadline = t_stopped + args.max_wait_sec
            while time.monotonic() < deadline:
                try:
                    run = _trigger_check_run(client, admin_token)
                except httpx.HTTPError as exc:
                    report["notes"].append(f"check-run failed: {exc}")
                    time.sleep(1.0)
                    continue
                status = _service_status(run, args.service)
                if status == "unhealthy":
                    t_detected = time.monotonic() - t_stopped
                    break
                time.sleep(1.0)

            try:
                _run([*compose, "start", args.service])
            except (FileNotFoundError, subprocess.CalledProcessError) as exc:
                report["notes"].append(f"docker compose start failed: {exc}")

            report["t_detected_sec"] = (
                round(t_detected, 3) if t_detected is not None else None
            )
        else:
            report["notes"].append("skip-restart: t_detected_sec not measured")

    report["passed"] = (
        report["anon_admin_logs_status"] == 401
        and report["user_admin_logs_status"] == 403
        and (args.skip_restart or report["t_detected_sec"] is not None)
    )

    _emit(report)


def _emit(report: dict) -> None:
    OBSERVABILITY_REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OBSERVABILITY_REPORT_FILE.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {OBSERVABILITY_REPORT_FILE}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


_ = INTERNAL_SECRET


if __name__ == "__main__":
    main()
