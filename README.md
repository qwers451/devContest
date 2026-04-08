# devContest

Платформа конкурсов для фриланс-заказов и digital-задач. Заказчик публикует конкурс с призовым фондом и ТЗ, исполнители отправляют решения, сервис оценки может автоматически проверить соответствие требованиям, а победитель получает выплату через эскроу и кошелёк.

## Что есть в проекте

- публикация конкурсов с этапами, файлами и шаблонами ТЗ
- подача решений с файлами, отзывами и AI-оценкой
- роли `customer`, `executor`, `admin`
- кошелёк, пополнение, вывод, эскроу и история транзакций
- статистика по конкурсам, оплатам и AI-оценке
- импорт/экспорт снапшота системы
- фронтенд на React + TypeScript
- интеграционные тесты `pytest`, frontend unit-тесты `vitest`, Postman/Newman в CI

## Архитектура

```text
Browser
  -> frontend / nginx
  -> gateway :8080
     -> user-service :8001
     -> contest-service :8002
     -> evaluation-service :8003
     -> payment-service :8004

Каждый backend-сервис использует свой PostgreSQL.
evaluation-service может обращаться к Ollama.
```

### Сервисы

| Сервис | Порт | Назначение |
|---|---:|---|
| `user-service` | 8001 | регистрация, логин, JWT, профили, список пользователей |
| `contest-service` | 8002 | типы и шаблоны конкурсов, конкурсы, этапы, решения, отзывы, import/export |
| `evaluation-service` | 8003 | извлечение требований из ТЗ, AI-оценка, статистика оценки |
| `payment-service` | 8004 | кошелёк, пополнение, вывод, платежи конкурса, эскроу, транзакции |
| `gateway` | 8080 | единая точка входа для API |
| `frontend` | 3000 / 5173 | production-сборка через nginx или dev-server Vite |

### Технологии

| Слой | Стек |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, MobX, Tailwind CSS 4, Chart.js |
| Backend | FastAPI, SQLAlchemy async, asyncpg, Pydantic v2 |
| База данных | PostgreSQL 16 |
| AI | Ollama, `mistral-small:24b`, `pixtral:12b` |
| Платежи | YooKassa API + локальный stub fallback |
| Тесты | Pytest, Vitest, Newman |

## Важные особенности реализации

- JWT проверяется каждым сервисом локально через общий `JWT_SECRET`.
- Межсервисные запросы защищены `X-Internal-Secret`.
- Схема БД поднимается кодом при старте сервисов через `create_tables()`.
  Отдельных Alembic migration-файлов в репозитории сейчас нет.
- Для `contest.number` и `submission.number` используются PostgreSQL sequence.
- При `EVALUATION_STUB=true` AI-оценка работает без внешней LLM.
- Если YooKassa не настроена, кошелёк и часть платежных сценариев работают в stub-режиме.

## Быстрый старт

### 1. Подготовить окружение

```bash
cp .env.example .env
```

Минимально нужно задать:

```env
USER_DB_PASSWORD=...
CONTEST_DB_PASSWORD=...
EVAL_DB_PASSWORD=...
PAYMENT_DB_PASSWORD=...

JWT_SECRET=...
INTERNAL_SECRET=...
```

### 2. Запуск production-like compose

```bash
docker compose -f docker-compose.yml up --build
```

Это режим ближе к CI:

- frontend доступен на `http://localhost:3000`
- gateway доступен на `http://localhost:8080`
- Swagger сервисов:
  - `http://localhost:8001/docs`
  - `http://localhost:8002/docs`
  - `http://localhost:8003/docs`
  - `http://localhost:8004/docs`

### 3. Запуск dev-режима с hot reload

`docker-compose.override.yml` применяется автоматически, если запускать без `-f`.

```bash
docker compose up --build
```

В этом режиме:

- backend-сервисы стартуют с `uvicorn --reload`
- frontend поднимается через Vite dev server
- frontend доступен на `http://localhost:5173`

Если нужен именно чистый базовый compose без override, всегда запускай с `-f docker-compose.yml`.

## Переменные окружения

Актуальный `.env.example`:

```env
USER_DB_PASSWORD=change_me
CONTEST_DB_PASSWORD=change_me
EVAL_DB_PASSWORD=change_me
PAYMENT_DB_PASSWORD=change_me

JWT_SECRET=change_me_to_a_long_random_string
INTERNAL_SECRET=change_me_to_another_long_random_string

YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_PAYOUT_AGENT_ID=
YOOKASSA_PAYOUT_SECRET_KEY=

EVALUATION_STUB=true
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=mistral-small:24b
OLLAMA_VISION_MODEL=pixtral:12b

VITE_USER_API_URL=http://localhost:8001
VITE_CONTEST_API_URL=http://localhost:8002
VITE_EVAL_API_URL=http://localhost:8003
VITE_IMPORT_EXPORT_API_URL=http://localhost:8002

PYTEST_USER_URL=http://localhost:8001
PYTEST_CONTEST_URL=http://localhost:8002
PYTEST_SERVICE_STARTUP_TIMEOUT=45
PYTEST_SERVICE_POLL_INTERVAL=1

SEED_USER_URL=http://localhost:8001
SEED_CONTEST_URL=http://localhost:8002
```

Примечания:

- `EVALUATION_STUB=true` удобно для локальной разработки и CI.
- для полной интеграции с YooKassa нужны обе пары ключей:
  - `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY`
  - `YOOKASSA_PAYOUT_AGENT_ID` + `YOOKASSA_PAYOUT_SECRET_KEY`

## LLM / Ollama

Если нужна настоящая AI-оценка вместо заглушки:

```bash
ollama pull mistral-small:24b
ollama pull pixtral:12b
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

И в `.env`:

```env
EVALUATION_STUB=false
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=mistral-small:24b
OLLAMA_VISION_MODEL=pixtral:12b
```

`evaluation-service` кеширует извлечённые требования по хэшу `tz_text`.

## Тестовые данные

После старта сервисов можно наполнить систему демонстрационными данными:

```bash
python3 seed.py
```

`seed.py` создаёт:

- пользователей
- пополнения кошельков
- шаблоны конкурсов
- типы конкурсов
- несколько конкурсов
- решения, PNG-файлы, DOCX/PDF-файлы

Учётные записи после сидинга:

| Роль | Логин | Пароль |
|---|---|---|
| admin | `admin` | `admin123` |
| customer | `customer1` | `test1234` |
| executor | `executor1` | `test1234` |
| executor | `executor2` | `test1234` |
| executor | `executor3` | `test1234` |

## API-возможности

### user-service

- `POST /auth/register`
- `POST /auth/login`
- `GET /users`
- `GET /users/profile`
- `PUT /users/profile`
- `GET /users/{id}`
- `GET /internal/admin/export`
- `POST /internal/admin/import`

### contest-service

- типы конкурсов: `GET/POST/DELETE /contest-types`
- шаблоны конкурсов: `GET/POST/PUT/DELETE /contest-templates`
- конкурсы:
  - `GET/POST /contests`
  - `GET /contests/number/{number}`
  - `GET /contests/{id}`
  - `PUT /contests/{id}`
  - `DELETE /contests/{id}`
  - `PATCH /contests/{id}/activate`
  - `PATCH /contests/{id}/activate-internal`
  - `PATCH /contests/{id}/cancel-internal`
  - `POST /contests/{id}/winner`
  - `PUT /contests/{id}/stages`
  - `PATCH /contests/{id}/current-stage`
- файлы конкурса:
  - `POST /contests/{id}/tz-file`
  - `GET /contests/{id}/tz-file`
  - `POST /contests/{id}/files`
  - `GET /contests/{id}/files/{filename}`
  - `DELETE /contests/{id}/files/{filename}`
- решения:
  - `GET/POST /submissions`
  - `GET /submissions/number/{number}`
  - `GET /submissions/{id}`
  - `PUT /submissions/{id}`
  - `PATCH /submissions/{id}/status`
  - `POST /submissions/{id}/evaluate`
  - `DELETE /submissions/{id}`
  - `POST /submissions/{id}/files`
  - `GET /submissions/{id}/files/{filename}`
  - `DELETE /submissions/{id}/files/{filename}`
- отзывы и статус-лог:
  - `POST /submissions/{id}/reviews`
  - `GET /submissions/{id}/reviews`
  - `PUT /submissions/{id}/reviews/{number}`
  - `DELETE /submissions/{id}/reviews/{number}`
  - `POST /submissions/{id}/reviews/{number}/files`
  - `GET /submissions/{id}/reviews/{number}/files/{filename}`
  - `DELETE /submissions/{id}/reviews/{number}/files/{filename}`
  - `GET /submissions/{id}/status-log`
- статистика:
  - `GET /statistics`
  - `GET /statistics/contests`
- backup:
  - `GET /import-export/export`
  - `POST /import-export/import`

### evaluation-service

- `POST /evaluation/evaluate` для внутреннего вызова
- `POST /evaluation/requirements/{contest_id}`
- `GET /evaluation/requirements/{contest_id}`
- `GET /evaluation/contest/{contest_id}/stats`
- `GET /evaluation/{submission_id}`
- `GET /statistics`
- `GET /internal/admin/export`
- `POST /internal/admin/import`

### payment-service

- кошелёк:
  - `GET /wallet/balance`
  - `POST /wallet/topup`
  - `POST /wallet/topup/{payment_id}/refund`
  - `POST /wallet/internal/credit`
  - `GET /wallet/transactions`
  - `POST /wallet/withdraw`
  - `GET /wallet/payment/{payment_id}`
- платежи конкурса:
  - `POST /payments/topup`
  - `GET /payments/history`
  - `GET /payments/{contest_id}`
  - `POST /payments/withdraw`
  - `GET /payments/withdrawals/my`
  - `POST /payments/{contest_id}/refund`
  - `POST /payments/webhook`
- эскроу:
  - `POST /escrow/reserve`
  - `POST /escrow/release`
  - `POST /escrow/release-stage`
  - `GET /escrow/{contest_id}/milestones`
  - `GET /escrow/status/{contest_id}`
- транзакции и отчёты:
  - `GET /transactions/transactions`
  - `GET /transactions/payouts/{executor_id}`
  - `GET /transactions/escrow/{contest_id}`
  - `GET /transactions/escrow/{contest_id}/milestones`
  - `GET /statistics`
- backup:
  - `GET /internal/admin/export`
  - `POST /internal/admin/import`

## Тесты

### Pytest

Интеграционные тесты находятся в `tests/pytest`.

Запуск внутри compose-профиля:

```bash
docker compose --profile tests up --build tests
```

Важно:

- `tests`-сервис зависит от всех четырёх backend-сервисов
- внутри профиля используются внутренние URL контейнеров
- для хоста можно запускать тесты отдельно, если стек уже поднят

Запуск с хоста:

```bash
pip install -r tests/pytest/requirements.txt
python3 -m pytest tests/pytest -v
```

Полезные переменные:

```env
PYTEST_USER_URL=http://localhost:8001
PYTEST_CONTEST_URL=http://localhost:8002
PYTEST_EVAL_URL=http://localhost:8003
PYTEST_PAYMENT_URL=http://localhost:8004
INTERNAL_SECRET=<значение из .env>
EVALUATION_STUB=true
```

### Frontend unit-тесты

```bash
cd frontend
npm install
npm run test
```

### Postman / Newman

Коллекция: `tests/postman/devContest_collection.json`

Логика CI:

1. поднять backend-сервисы
2. дождаться `/docs` на 8001/8002/8003/8004
3. прогнать `pytest`
4. прогнать `seed.py`
5. прогнать Newman

Коллекция больше не зависит от фиксированного номера конкурса `1`: номер берётся из актуального списка конкурсов.

## CI

GitHub Actions лежит в [.github/workflows/tests.yml](/home/mikhail/Документы/devContest/.github/workflows/tests.yml).

Что делает backend-job:

- создаёт `.env` из `.env.example`
- поднимает только базовый `docker-compose.yml`
- не использует `docker-compose.override.yml`
- ждёт готовности сервисов через `curl /docs`
- запускает `pytest`
- запускает `seed.py`
- запускает Newman
- при падении печатает логи backend-сервисов

## Структура проекта

```text
devContest/
├── backend/
│   ├── user-service/
│   ├── contest-service/
│   ├── evaluation-service/
│   └── payment-service/
├── frontend/
├── gateway/
├── tests/
│   ├── postman/
│   └── pytest/
├── docker-compose.yml
├── docker-compose.override.yml
├── seed.py
├── .env.example
└── .github/workflows/tests.yml
```

## Практические заметки

- Для локальной разработки проще держать `EVALUATION_STUB=true`.
- Если нужен стабильный запуск как в CI, используй:
  `docker compose -f docker-compose.yml up --build`
- Если нужен hot reload, используй обычный:
  `docker compose up --build`
- Если после изменения API падает Newman, сначала проверь коллекцию и сиды, а не только backend-логи.
