from __future__ import annotations

import os
from pathlib import Path

USER_URL = os.getenv("RESEARCH_USER_URL", os.getenv("PYTEST_USER_URL", "http://localhost:8001"))
CONTEST_URL = os.getenv("RESEARCH_CONTEST_URL", os.getenv("PYTEST_CONTEST_URL", "http://localhost:8002"))
PROTOCOL_URL = os.getenv("RESEARCH_PROTOCOL_URL", os.getenv("PYTEST_PROTOCOL_URL", "http://localhost:8005"))
AUDIT_URL = os.getenv("RESEARCH_AUDIT_URL", os.getenv("PYTEST_AUDIT_URL", "http://localhost:8006"))
MONITORING_URL = os.getenv("RESEARCH_MONITORING_URL", os.getenv("PYTEST_MONITORING_URL", "http://localhost:8007"))
PAYMENT_URL = os.getenv("RESEARCH_PAYMENT_URL", os.getenv("PYTEST_PAYMENT_URL", "http://localhost:8004"))
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")

DEFAULT_PASSWORD = os.getenv("RESEARCH_PASSWORD", "Test1234!")

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("RESEARCH_OUTPUT_DIR", str(ROOT / "output")))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SESSIONS_FILE = OUTPUT_DIR / "sessions.json"
SESSIONS_META_FILE = OUTPUT_DIR / "sessions_meta.json"
COUPLING_TABLE_FILE = OUTPUT_DIR / "coupling_table.csv"
COUPLING_HIST_FILE = OUTPUT_DIR / "coupling_hist.png"
COUPLING_VALIDATION_OFF_FILE = OUTPUT_DIR / "coupling_validation_off.csv"
COUPLING_VALIDATION_OFF_HIST_FILE = OUTPUT_DIR / "coupling_validation_off_hist.png"
COUPLING_BASELINE_FILE = OUTPUT_DIR / "coupling_baseline.csv"
COUPLING_SUMMARY_FILE = OUTPUT_DIR / "coupling_summary.csv"
SCOPE_CREEP_FILE = OUTPUT_DIR / "scope_creep_bar.png"
FSM_COVERAGE_FILE = OUTPUT_DIR / "fsm_coverage.json"
BLIND_RECOVERY_FILE = OUTPUT_DIR / "blind_recovery.csv"
BLIND_RECOVERY_SUMMARY_FILE = OUTPUT_DIR / "blind_recovery_summary.json"
INTEGRITY_REPORT_FILE = OUTPUT_DIR / "integrity_report.json"
OBSERVABILITY_REPORT_FILE = OUTPUT_DIR / "observability_report.json"
LOAD_DIR = OUTPUT_DIR / "load"
LOAD_DIR.mkdir(parents=True, exist_ok=True)
