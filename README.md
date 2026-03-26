# devContest

Платформа конкурсов для фриланс-заказов. Заказчик публикует конкурс с призовым фондом и техническим заданием, исполнители отправляют решения, LLM автоматически оценивает соответствие ТЗ, победителя выбирает заказчик — призовой фонд переводится через эскроу.

## Архитектура

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│   Browser   │────▶│  nginx gateway :8080                             │
└─────────────┘     └──────┬──────────┬──────────┬──────────┬──────────┘
                           │          │          │          │
                    ┌──────▼──┐ ┌─────▼───┐ ┌───▼─────┐ ┌──▼──────────┐
                    │  user   │ │ contest │ │  eval   │ │   payment   │
                    │ service │ │ service │ │ service │ │   service   │
                    │  :8001  │ │  :8002  │ │  :8003  │ │    :8004    │
                    └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘
                         │          │            │              │
                    ┌────▼──┐  ┌────▼──┐  ┌─────▼──┐  ┌───────▼──┐
                    │ user  │  │contest│  │ eval   │  │ payment  │
                    │  db   │  │  db   │  │  db    │  │    db    │
                    └───────┘  └───────┘  └─────┬──┘  └──────────┘
                                                │
                                         ┌──────▼──────┐
                                         │   Ollama    │
                                         │ (mistral +  │
                                         │  pixtral)   │
                                         └─────────────┘
```

### Сервисы

| Сервис | Порт | Назначение |
|--------|------|-----------|
| `user-service` | 8001 | Аутентификация, JWT, профили пользователей |
| `contest-service` | 8002 | Конкурсы, решения, файлы, отзывы, этапы |
| `evaluation-service` | 8003 | Автооценка через LLM (Ollama) |
| `payment-service` | 8004 | Кошелёк, эскроу, YooKassa-платежи |
| `gateway` (nginx) | 8080 | Единая точка входа, проксирование API |
| `frontend` | 3000 | SPA на React 19 + TypeScript |

### Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + MobX + Tailwind CSS |
| Backend | FastAPI + SQLAlchemy async + Alembic + PostgreSQL |
| LLM | Ollama: mistral (текст) + pixtral/llava (изображения) |
| Платежи | YooKassa API + эскроу-система |
| Контейнеры | Docker / Podman + Compose |
| Тесты | Pytest (интеграция), Vitest (unit), Cypress (e2e) |

### Аутентификация и роли

JWT-токены выдаются user-service и валидируются **каждым сервисом локально** (общий `JWT_SECRET`). Три роли:

- `customer` — создаёт конкурсы, выбирает победителя, оставляет отзывы
- `executor` — подаёт решения на конкурсы, видит только свои решения
- `admin` — полный доступ ко всем ресурсам

Межсервисные вызовы защищены заголовком `X-Internal-Secret`.

### AI-оценка

Двухшаговый процесс:
1. **Извлечение требований** — LLM (mistral) парсит ТЗ и выделяет список конкретных требований с флагом `is_critical`
2. **Оценка решения** — LLM (pixtral/llava) анализирует текст и изображения решения, выставляет оценку 0/50/100 каждому требованию
3. **Взвешенный итог** — критические требования имеют вес ×2

Требования кэшируются по `sha256(tz_text)` — повторный анализ одного ТЗ не вызывает LLM.

---

## Быстрый старт

```bash
cp .env.example .env
# Отредактируйте .env — задайте пароли и секреты
docker compose up --build        # или podman-compose up --build
```

Приложение: `http://localhost:3000`

Swagger UI:
- `http://localhost:8001/docs` — user-service
- `http://localhost:8002/docs` — contest-service
- `http://localhost:8003/docs` — evaluation-service
- `http://localhost:8004/docs` — payment-service

### Режим разработки (hot-reload)

```bash
docker compose up --build   # docker-compose.override.yml применяется автоматически
```

Override монтирует исходный код в контейнеры и запускает `uvicorn --reload`.

---

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```env
# Пароли БД (обязательно)
USER_DB_PASSWORD=
CONTEST_DB_PASSWORD=
EVAL_DB_PASSWORD=
PAYMENT_DB_PASSWORD=

# Секреты (обязательно)
JWT_SECRET=              # длинная случайная строка
INTERNAL_SECRET=         # для межсервисных запросов

# LLM
EVALUATION_STUB=false              # true = заглушка без LLM
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=mistral               # текстовая модель
OLLAMA_VISION_MODEL=pixtral:12b    # мультимодальная модель

# YooKassa (опционально — без них платежи работают в stub-режиме)
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_RETURN_URL=http://localhost:3000/payment/callback
```

---

## Настройка LLM (Ollama)

```bash
# Установить Ollama
curl -fsSL https://ollama.com/install.sh | sh   # Linux
brew install ollama                              # macOS

# Скачать модели
ollama pull mistral        # ~4 ГБ — извлечение требований и оценка текста
ollama pull pixtral:12b    # ~8 ГБ — оценка решений с изображениями


# Запустить (доступен из контейнера)
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Без LLM: `EVALUATION_STUB=true` в `.env` — возвращает заглушку.

---

## Тестовые данные

```bash
# Сервисы должны быть запущены
python3 seed.py
```

| Роль | Логин | Пароль |
|------|-------|--------|
| admin | `admin` | `admin123` |
| customer | `customer1` | `test1234` |
| executor | `executor1` | `test1234` |
| executor | `executor2` | `test1234` |

---

## Тесты

### Интеграционные тесты (Pytest)

Покрывают ~120 сценариев: аутентификация, конкурсы, решения, оценка, платежи, контроль доступа.

```bash
# Внутри compose-сети (рекомендуется)
docker compose --profile tests up --build tests

# С хоста (сервисы должны быть запущены)
pip install -r tests/pytest/requirements.txt
python3 -m pytest tests/pytest/ -v
```

Переменные окружения для тестов:
```env
PYTEST_USER_URL=http://localhost:8001
PYTEST_CONTEST_URL=http://localhost:8002
PYTEST_EVAL_URL=http://localhost:8003
PYTEST_PAYMENT_URL=http://localhost:8004
INTERNAL_SECRET=<значение из .env>
EVALUATION_STUB=true   # для тестов без LLM
```

### Unit-тесты (Vitest)

```bash
cd frontend && npm run test
```

### E2E тесты (Cypress)

```bash
cd frontend
npm run cypress:run    # headless
npm run cypress:open   # с GUI
```

---

## Структура проекта

```
devContest/
├── backend/
│   ├── user-service/        # JWT, пользователи
│   ├── contest-service/     # конкурсы, решения, файлы
│   ├── evaluation-service/  # LLM-оценка
│   └── payment-service/     # кошелёк, эскроу
├── frontend/                # React SPA
├── gateway/                 # nginx конфиг
├── tests/
│   └── pytest/              # интеграционные тесты
├── docker-compose.yml
├── docker-compose.override.yml   # dev-режим
└── .env.example
```
