#!/usr/bin/env bash
# Сброс демо-стенда к исходным данным: тома БД удаляются, стек поднимается заново,
# затем seed.py (базовые сценарии) и seed_bulk.py (массовые данные).
# Используется вручную и по cron каждую ночь (deploy/deploy.sh ставит задание).
#   bash deploy/reset-demo.sh [--build]
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a   # COMPOSE_FILE в .env подключает deploy/docker-compose.prod.yml

export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
BUILD=()
[ "${1:-}" = "--build" ] && BUILD=(--build)

echo "==> $(date '+%F %T') сброс стека"
docker compose down -v --remove-orphans
docker compose up -d "${BUILD[@]}"

wait_for() {
  local name="$1" url="$2" i
  for i in $(seq 1 120); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then echo "    $name: готов"; return 0; fi
    sleep 3
  done
  echo "    $name: не поднялся ($url)" >&2
  return 1
}

echo "==> Ожидание сервисов"
wait_for user-service    http://127.0.0.1:8001/docs
wait_for contest-service http://127.0.0.1:8002/docs
wait_for payment-service http://127.0.0.1:8004/docs
wait_for gateway         http://127.0.0.1:8080/contest-types
wait_for frontend        http://127.0.0.1:3000/

echo "==> seed.py"
python3 seed.py > /var/log/devcontest-seed.log 2>&1 || { tail -30 /var/log/devcontest-seed.log; exit 1; }
echo "==> seed_bulk.py"
python3 deploy/seed_bulk.py

echo "==> $(date '+%F %T') готово"
