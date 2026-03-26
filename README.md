# devContest

Платформа конкурсов для фриланс-заказов. Заказчик публикует конкурс с ТЗ и призовым фондом, исполнители отправляют решения, победителя выбирает заказчик. Решения автоматически оцениваются локальной LLM.

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + MobX |
| Backend | 4 микросервиса на FastAPI + PostgreSQL |
| LLM | Ollama  |
| Контейнеры | Podman / Docker + Compose |
| Тесты | Vitest (unit), Pytest (интеграция), Cypress (e2e) |

## Сервисы

| Сервис | Порт | Назначение |
|--------|------|-----------|
| `user-service` | 8001 | Аутентификация, пользователи |
| `contest-service` | 8002 | Конкурсы, решения, отзывы |
| `evaluation-service` | 8003 | Автооценка через LLM |
| `payment-service` | 8004 | Эскроу, кошелёк, YooKassa |
| `gateway` (nginx) | 8080 | Проксирует все API |
| `frontend` | 3000 | Веб-приложение |

## Быстрый старт

```bash
cp .env.example .env
# отредактируйте .env — задайте пароли и JWT_SECRET
podman-compose up --build
```

Приложение доступно на `http://localhost:3000`.

Документация API (Swagger):
- `http://localhost:8001/docs` — пользователи
- `http://localhost:8002/docs` — конкурсы
- `http://localhost:8003/docs` — оценка
- `http://localhost:8004/docs` — платежи

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```env
# Пароли БД
USER_DB_PASSWORD=...
CONTEST_DB_PASSWORD=...
EVAL_DB_PASSWORD=...
PAYMENT_DB_PASSWORD=...

# Секреты
JWT_SECRET=...            # длинная случайная строка
INTERNAL_SECRET=...       # для межсервисных запросов

# LLM (если нужна реальная оценка)
EVALUATION_STUB=false     # true = заглушка без LLM
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llava:7b

# YooKassa (опционально)
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
```

## LLM-оценка (Ollama)

```bash
# Установить Ollama
curl -fsSL https://ollama.com/install.sh | sh   # Linux
brew install ollama                              # macOS

# Скачать модель
ollama pull llava:7b        # 4.7 ГБ, для разработки
ollama pull llama3.2-vision # 7 ГБ, точнее

# Запустить
ollama serve
```

Для тестирования без LLM достаточно `EVALUATION_STUB=true` в `.env`.

## Тестовые данные

```bash
# Сервисы должны быть запущены
python3 seed.py
```

Создаёт пользователей, типы конкурсов, конкурсы и решения.

| Роль | Логин | Пароль |
|------|-------|--------|
| admin | `admin` | `admin123` |
| customer | `customer1` | `test1234` |
| executor | `executor1` | `test1234` |
| executor | `executor2` | `test1234` |

## Тесты

**Unit-тесты (Vitest)** — логика store и API-клиентов:
```bash
cd frontend && npm run test
```

**Интеграционные тесты (Pytest)** — все микросервисы вместе:
```bash
# Внутри compose-сети (рекомендуется)
podman-compose --profile tests up --build tests

# С хоста
podman-compose up -d --build
pip install -r tests/pytest/requirements.txt
python3 -m pytest
```

**E2E тесты (Cypress)**:
```bash
cd frontend
npm run cypress:run          # headless
npm run cypress:open         # с GUI
```

## Просмотр БД (Adminer)

```bash
podman-compose up -d adminer
# http://localhost:8080
# Server: user-db / contest-db / payment-db / evaluation-db
# Реквизиты — в .env
```
