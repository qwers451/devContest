#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_DIR="${RESEARCH_OUTPUT_DIR:-${REPO_ROOT}/research/output}/load"
mkdir -p "${OUTPUT_DIR}"

PROTOCOL_HOST="${RESEARCH_PROTOCOL_HOST:-http://localhost:8005}"
AUDIT_HOST="${RESEARCH_AUDIT_HOST:-http://localhost:8006}"
MONITORING_HOST="${RESEARCH_MONITORING_HOST:-http://localhost:8007}"
DURATION="${LOAD_DURATION:-5m}"
RAMP="${LOAD_RAMP:-10}"

duration_seconds() {
  local s="$1"
  case "$s" in
    *m) echo "$(( ${s%m} * 60 ))" ;;
    *h) echo "$(( ${s%h} * 3600 ))" ;;
    *s) echo "${s%s}" ;;
    *)  echo "$s" ;;
  esac
}

CAPTURE_DURATION="$(duration_seconds "${DURATION}")"

if command -v cygpath >/dev/null 2>&1; then
  REPO_ROOT_PY="$(cygpath -w "${REPO_ROOT}")"
  PYSEP=";"
else
  REPO_ROOT_PY="${REPO_ROOT}"
  PYSEP=":"
fi
export PYTHONPATH="${REPO_ROOT_PY}${PYTHONPATH:+${PYSEP}${PYTHONPATH}}"

run_scenario() {
  local name="$1"
  local file="$2"
  local host="$3"
  local users="$4"
  local stats_name="${name}_${users}u"
  local stats_csv="${OUTPUT_DIR}/docker_stats_${stats_name}.csv"
  local html_report="${OUTPUT_DIR}/${name}_${users}u.html"
  local csv_report="${OUTPUT_DIR}/${name}_${users}u"
  local spawn_rate="${users}"

  echo "==> ${name} @ ${users} VU ($(date -Iseconds))"
  python -m research.load.capture_stats \
      --duration "${CAPTURE_DURATION}" --interval 5 \
      --output "${stats_csv}" \
      --container protocol-service \
      --container audit-service \
      --container monitoring-service &
  local capture_pid=$!

  locust -f "${file}" \
      --host "${host}" \
      --headless \
      -u "${users}" -r "${spawn_rate}" -t "${DURATION}" \
      --csv "${csv_report}" \
      --html "${html_report}" \
      --only-summary \
      --exit-code-on-error 0

  wait "${capture_pid}" || true
}

for users in 25 50 100; do
  run_scenario protocol   "${SCRIPT_DIR}/locustfile_protocol.py"   "${PROTOCOL_HOST}"   "${users}"
  run_scenario audit      "${SCRIPT_DIR}/locustfile_audit.py"      "${AUDIT_HOST}"      "${users}"
  run_scenario monitoring "${SCRIPT_DIR}/locustfile_monitoring.py" "${MONITORING_HOST}" "${users}"
done

echo "Done. Reports in ${OUTPUT_DIR}"
