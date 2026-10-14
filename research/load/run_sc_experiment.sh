#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if command -v cygpath >/dev/null 2>&1; then
  REPO_ROOT_PY="$(cygpath -w "${REPO_ROOT}")"
  PYSEP=";"
else
  REPO_ROOT_PY="${REPO_ROOT}"
  PYSEP=":"
fi
export PYTHONPATH="${REPO_ROOT_PY}${PYTHONPATH:+${PYSEP}${PYTHONPATH}}"

PER_TEMPLATE="${RESEARCH_PER_TEMPLATE:-15}"
SEED="${RESEARCH_SEED:-42}"
PYTHON_BIN="${PYTHON_BIN:-python}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

restart_protocol_with() {
  local mode="$1"
  echo "==> restarting protocol-service with STRICT_VALIDATION=${mode}"
  STRICT_VALIDATION="${mode}" ${COMPOSE_CMD} up -d --force-recreate protocol-service
  for _ in $(seq 1 20); do
    if curl -fsS "http://localhost:8005/docs" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "protocol-service did not become ready" >&2
  exit 1
}

echo "=== STRICT pass ==="
restart_protocol_with "true"
RESEARCH_RELAXED_CLIENTS=false \
  "${PYTHON_BIN}" -m research.scenario_generator.run --per-template "${PER_TEMPLATE}" --seed "${SEED}"
"${PYTHON_BIN}" -m research.coupling_metric.report --mode strict

echo "=== RELAXED pass ==="
restart_protocol_with "false"
RESEARCH_RELAXED_CLIENTS=true \
  "${PYTHON_BIN}" -m research.scenario_generator.run --per-template "${PER_TEMPLATE}" --seed "${SEED}"
"${PYTHON_BIN}" -m research.coupling_metric.report --mode relaxed

echo "=== Restoring strict mode ==="
restart_protocol_with "true"

echo "=== BASELINE + SUMMARY ==="
"${PYTHON_BIN}" -m research.coupling_metric.report --mode baseline
"${PYTHON_BIN}" -m research.coupling_metric.report --mode summary

echo "Done. See research/output/coupling_summary.csv"
