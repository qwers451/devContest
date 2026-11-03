#!/usr/bin/env bash
# Полный сброс стека до чистого демо-состояния:
#   docker compose down -v  →  up -d --build  →  ждём готовности  →  python seed.py
#
# Использование:   bash scripts/reset-demo.sh
# Фронтенд (dev-сервер на :5173 или контейнер) не пересоздаётся: запускайте его отдельно.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a; . ./.env; set +a
else
  echo "Нет файла .env — создайте его из .env.example" >&2
  exit 1
fi

# seed.py печатает кириллицу: на Windows-консоли нужен UTF-8
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

if [ -n "${PYTHON:-}" ]; then PY=("$PYTHON")
elif command -v py >/dev/null 2>&1; then PY=(py -3)
elif command -v python3 >/dev/null 2>&1; then PY=(python3)
else PY=(python); fi

echo "==> Остановка стека и удаление томов БД"
docker compose down -v --remove-orphans

echo "==> Сборка и запуск бэкенда, шлюза и Mailpit"
# frontend/tests не трогаем: dev-сервер Vite (:5173) запускается отдельно
docker compose up -d --build gateway mailpit

wait_for() {
  local name="$1" url="$2" i
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then echo "    $name: готов"; return 0; fi
    sleep 2
  done
  echo "    $name: не поднялся за 180 с ($url)" >&2
  return 1
}

echo "==> Ожидание готовности сервисов"
wait_for user-service    http://localhost:8001/docs
wait_for contest-service http://localhost:8002/docs
wait_for payment-service http://localhost:8004/docs
wait_for gateway         http://localhost:8080/contest-types
wait_for mailpit         http://localhost:8025/

echo "==> Наполнение демо-данными (seed.py)"
"${PY[@]}" seed.py

echo
echo "Готово. Сайт: http://localhost:5173 (npm run dev в frontend/), почта: http://localhost:8025"
echo "Логины: admin/admin123, customer1/test1234, customer2/test1234, executor1..3/test1234"
