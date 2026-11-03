# devContest

Платформа конкурсного фриланса - заказчик создаёт конкурс, исполнители подают решения, сервис оценки проверяет соответствие ТЗ, платежный сервис ведёт кошелёк и эскроу.

## Сервисы

| Сервис | Порт | Что делает |
|---|---:|---|
| `frontend` | 3000 / 5173 | React SPA |
| `gateway` | 8080 | nginx gateway |
| `user-service` | 8001 | auth, JWT, профили, список пользователей |
| `contest-service` | 8002 | конкурсы, этапы, решения, отзывы, шаблоны, import/export |
| `evaluation-service` | 8003 | AI-оценка, требования, статистика |
| `payment-service` | 8004 | кошелёк, платежи, эскроу, транзакции |
| `protocol-service` | 8005 | протокольные сессии по решению (пока не в стеке, см. [ВКР](#вкр-audit--monitoring--protocol--research)) |
| `audit-service` | 8006 | audit-журнал событий backend-сервисов |
| `monitoring-service` | 8007 | проверки доступности backend-сервисов и их история |

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, MobX, Tailwind CSS 4 |
| Backend | FastAPI, SQLAlchemy async, asyncpg, Pydantic v2 |
| DB | PostgreSQL 16 |
| AI | Ollama |
| Тесты | Pytest, Vitest, Newman |

## Быстрый старт

### 1. Подготовка

```bash
cp .env.example .env
```

Минимум в `.env`:

```env
USER_DB_PASSWORD=...
CONTEST_DB_PASSWORD=...
EVAL_DB_PASSWORD=...
PAYMENT_DB_PASSWORD=...
AUDIT_DB_PASSWORD=...
MONITORING_DB_PASSWORD=...
JWT_SECRET=...
INTERNAL_SECRET=...
```

### 2. Запуск

| Режим | Команда | Что получится |
|---|---|---|
| Обычный запуск | `docker compose -f docker-compose.yml up --build` | запуск без `docker-compose.override.yml` |
| Режим разработки | `docker compose up --build` | запуск с `docker-compose.override.yml`, hot reload, Vite |

### 3. Адреса

| Что | URL |
|---|---|
| Frontend, обычный запуск | `http://localhost:3000` |
| Frontend, режим разработки | `http://localhost:5173` |
| Gateway | `http://localhost:8080` |
| Swagger user-service | `http://localhost:8001/docs` |
| Swagger contest-service | `http://localhost:8002/docs` |
| Swagger evaluation-service | `http://localhost:8003/docs` |
| Swagger payment-service | `http://localhost:8004/docs` |
| Swagger audit-service | `http://localhost:8006/docs` |
| Swagger monitoring-service | `http://localhost:8007/docs` |

## Разница между режимами

| Режим | Frontend | Backend | Когда использовать |
|---|---|---|---|
| Обычный запуск | nginx + production build | обычный `uvicorn` | проверка готового приложения |
| Режим разработки | Vite dev server | `uvicorn --reload` | локальная разработка |

Если нужен запуск без `docker-compose.override.yml`, всегда используй `-f docker-compose.yml`.

## Переменные окружения

Основные:

| Переменная | Назначение |
|---|---|
| `USER_DB_PASSWORD` | пароль БД user-service |
| `CONTEST_DB_PASSWORD` | пароль БД contest-service |
| `EVAL_DB_PASSWORD` | пароль БД evaluation-service |
| `PAYMENT_DB_PASSWORD` | пароль БД payment-service |
| `AUDIT_DB_PASSWORD` | пароль БД audit-service |
| `MONITORING_DB_PASSWORD` | пароль БД monitoring-service |
| `JWT_SECRET` | общий JWT secret |
| `INTERNAL_SECRET` | секрет для внутренних запросов |
| `EVALUATION_STUB` | `true` = без реальной LLM |
| `OLLAMA_URL` | URL Ollama |
| `OLLAMA_MODEL` | текстовая модель |
| `OLLAMA_VISION_MODEL` | vision-модель |
| `YOOKASSA_SHOP_ID` | платежи YooKassa |
| `YOOKASSA_SECRET_KEY` | платежи YooKassa |
| `YOOKASSA_PAYOUT_AGENT_ID` | выплаты YooKassa |
| `YOOKASSA_PAYOUT_SECRET_KEY` | выплаты YooKassa |

Фронтенд и тесты уже есть в [.env.example](/home/mikhail/Документы/devContest/.env.example).

## Почта

Контест-сервис отправляет email-уведомления (новая заявка, победа/завершение конкурса, смена статуса решения, новое сообщение в чате, если получатель не онлайн; не чаще раза в 10 минут на беседу). По умолчанию письма перехватывает [Mailpit](http://localhost:8025) (SMTP `mailpit:1025`, веб-интерфейс http://localhost:8025) — настоящая почта не нужна.

| Переменная | Назначение |
|---|---|
| `SMTP_HOST` | SMTP-сервер (`mailpit` по умолчанию; пусто — рассылка отключена) |
| `SMTP_PORT` | порт (`1025`; для Gmail `587`) |
| `SMTP_FROM` | адрес отправителя |
| `SMTP_USER`, `SMTP_PASSWORD` | логин/пароль SMTP (необязательно) |
| `SMTP_TLS` | `true` — STARTTLS (нужно для Gmail) |
| `FRONTEND_URL` | база для ссылок в письмах (`http://localhost:3000`) |

Ошибки отправки только логируются и не влияют на ответ API.

## Ollama

Если нужна реальная AI-оценка:

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

## Тестовые данные

```bash
python3 seed.py
```

После `seed.py` создаются пользователи, типы конкурсов, шаблоны, конкурсы, решения, файлы и платежные данные.

| Роль | Логин | Пароль |
|---|---|---|
| admin | `admin` | `admin123` |
| customer | `customer1` | `test1234` |
| executor | `executor1` | `test1234` |
| executor | `executor2` | `test1234` |
| executor | `executor3` | `test1234` |

## Тесты

### Pytest

| Сценарий | Команда |
|---|---|
| Внутри compose | `docker compose --profile tests up --build tests` |
| С хоста | `pip install -r tests/pytest/requirements.txt && python3 -m pytest tests/pytest -v` |

Полезные переменные:

```env
PYTEST_USER_URL=http://localhost:8001
PYTEST_CONTEST_URL=http://localhost:8002
PYTEST_EVAL_URL=http://localhost:8003
PYTEST_PAYMENT_URL=http://localhost:8004
PYTEST_PROTOCOL_URL=http://localhost:8005
PYTEST_AUDIT_URL=http://localhost:8006
PYTEST_MONITORING_URL=http://localhost:8007
PYTEST_GATEWAY_URL=http://localhost:8080
INTERNAL_SECRET=<значение из .env>
```

`test_protocols.py`, `test_fsm_coverage.py`, `test_rbac.py`, `test_monitoring.py` и `test_blind_recovery.py` требуют работающий protocol-service. Пока его нет в стеке, они падают, поэтому CI запускает только остальные тесты.

### Frontend

```bash
cd frontend
npm install
npm run test
```

### Newman

Коллекция: `tests/postman/devContest_collection.json`

## CI

Файл: [.github/workflows/tests.yml](/home/mikhail/Документы/devContest/.github/workflows/tests.yml)

Порядок backend job:

1. создать `.env`
2. поднять backend через базовый `docker-compose.yml`
3. дождаться `8001/8002/8003/8004 /docs`
4. запустить `pytest` (без тестов protocol-service)
5. запустить `seed.py`
6. запустить Newman

При падении workflow печатает логи backend-сервисов.

## Основные API

### contest-service

| Группа | Основные пути |
|---|---|
| Типы | `/contest-types` |
| Шаблоны | `/contest-templates` |
| Конкурсы | `/contests`, `/contests/{id}`, `/contests/number/{number}` |
| Этапы | `/contests/{id}/stages`, `/contests/{id}/current-stage` |
| Победитель | `/contests/{id}/winner` |
| Файлы конкурса | `/contests/{id}/tz-file`, `/contests/{id}/files` |
| Решения | `/submissions`, `/submissions/{id}`, `/submissions/number/{number}` |
| Файлы решения | `/submissions/{id}/files` |
| Отзывы | `/submissions/{id}/reviews` |
| Статистика | `/statistics`, `/statistics/contests` |
| Backup | `/import-export/export`, `/import-export/import` |

### evaluation-service

| Метод | Путь |
|---|---|
| `POST` | `/evaluation/evaluate` |
| `POST` | `/evaluation/requirements/{contest_id}` |
| `GET` | `/evaluation/requirements/{contest_id}` |
| `GET` | `/evaluation/contest/{contest_id}/stats` |
| `GET` | `/evaluation/{submission_id}` |
| `GET` | `/statistics` |

### payment-service

| Группа | Основные пути |
|---|---|
| Кошелёк | `/wallet/balance`, `/wallet/topup`, `/wallet/transactions`, `/wallet/withdraw` |
| Платежи конкурса | `/payments/topup`, `/payments/{contest_id}`, `/payments/history` |
| Эскроу | `/escrow/reserve`, `/escrow/release`, `/escrow/release-stage` |
| Транзакции | `/transactions/transactions`, `/transactions/payouts/{executor_id}` |
| Статистика | `/statistics` |

### audit-service

| Метод | Путь |
|---|---|
| `POST` | `/internal/audit/events` (internal) |
| `GET` | `/internal/audit/events` (internal) |
| `GET` | `/audit/events` |

### monitoring-service

| Метод | Путь |
|---|---|
| `GET` | `/monitoring/health` |
| `POST` | `/monitoring/check-runs` |
| `GET` | `/monitoring/check-runs/latest`, `/monitoring/check-runs/{run_id}` |
| `GET` | `/monitoring/services/latest`, `/monitoring/services/{service_name}/history` |

Всё, кроме `/monitoring/health`, требует роль admin или `X-Internal-Secret`.

## ВКР: audit / monitoring / protocol / research

Код для выпускной квалификационной работы, перенесён из [mrekk-hub/DContest](https://github.com/mrekk-hub/DContest).

| Часть | Что внутри |
|---|---|
| `backend/audit-service/` | принимает события от backend-сервисов, хранит audit-журнал, отдаёт события по сессиям и проверяет полноту записей |
| `backend/monitoring-service/` | проверяет доступность backend-сервисов, хранит результаты и историю проверок |
| `backend/protocol-service/` | жизненный цикл протокольных сессий, сообщения и состояния разбирательства, строгая структурная привязка сообщений к требованиям и версиям ТЗ |
| `research/` | генерация сессий, метрика структурной связанности, восстановление арбитражных ответов по audit-журналу, проверки целостности, нагрузка, наблюдаемость |
| `tests/pytest/` | FSM-переходы, RBAC, monitoring, blind recovery, расширенные проверки protocol-service |

Ограничения текущего состояния:

- В `protocol-service` есть только изменённые файлы: `app/config.py`, `app/main.py`, `app/routes/sessions.py`. Нет `models.py`, `database.py`, `clients.py`, `dependencies.py`, `Dockerfile` и `requirements.txt`, поэтому сервис не запускается и не подключён в `docker-compose.yml`.
- В contest-service нет эндпоинта `/internal/submissions/{id}/protocol-context`. Без него `GET /audit/events` для не-админа отвечает 502.
- monitoring-service показывает `protocol-service` как `unhealthy`, общий статус `degraded`.

Зависимости для `research/`: `pip install -r research/requirements.txt`. Результаты пишутся в `research/output/` (в `.gitignore`).

## Важно

| Что | Комментарий |
|---|---|
| JWT | все сервисы валидируют токен локально через общий `JWT_SECRET` |
| Internal API | используется `X-Internal-Secret` |
| Схема БД | создаётся кодом на старте сервисов |
| Alembic | migration-файлов в репозитории сейчас нет |
| AI | при `EVALUATION_STUB=true` внешняя LLM не нужна |

## Структура проекта

```text
devContest/
├── backend/
│   ├── user-service/
│   ├── contest-service/
│   ├── evaluation-service/
│   ├── payment-service/
│   ├── protocol-service/
│   ├── audit-service/
│   └── monitoring-service/
├── frontend/
├── gateway/
├── research/
├── tests/
│   ├── postman/
│   └── pytest/
├── docker-compose.yml
├── docker-compose.override.yml
├── seed.py
├── .env.example
└── .github/workflows/tests.yml
```
