# devContest

Платформа конкурсного фриланса - заказчик создаёт конкурс, исполнители подают решения, сервис оценки проверяет соответствие ТЗ, платежный сервис ведёт кошелёк и эскроу.

## Сервисы

| Сервис | Порт | Что делает |
|---|---:|---|
| `frontend` | 3000 / 5173 | React SPA |
| `gateway` | 8080 | nginx gateway (резолвер Docker DNS: после пересоздания сервисов перезапуск не нужен) |
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

## Тестовые данные и чистый сброс для демо

```bash
bash scripts/reset-demo.sh        # Git Bash / Linux / macOS
```

```powershell
.\scripts\reset-demo.ps1          # Windows PowerShell
```

Скрипт делает `docker compose down -v` (удаляет тома БД), `docker compose up -d --build gateway mailpit` (бэкенд, шлюз и почта; фронтенд не трогает, его dev-сервер Vite на `:5173` запускается отдельно: `cd frontend && npm run dev`), ждёт готовности сервисов и запускает `seed.py`.

Только наполнение уже поднятого стека (повторный запуск безопасен: пользователи, типы и шаблоны переиспользуются, конкурсы не дублируются):

```bash
PYTHONUTF8=1 python3 seed.py      # в PowerShell:  $env:PYTHONUTF8=1; py -3 seed.py
```

`PYTHONUTF8=1` нужен только консоли Windows (иначе `seed.py` падает на русском тексте); `scripts/reset-demo.*` выставляют его сами.

Что создаёт `seed.py` (всё через API, затем функция `backdate_history()` сдвигает временные метки в БД, чтобы история выглядела настоящей):

- три исполнителя с разным уровнем: `executor1` (лидер, 4 победы), `executor2` (середняк, 2 победы и одно 2 место), `executor3` (новичок, 3 место и один слабый отзыв);
- 6 завершённых конкурсов 1-6 месяцев назад (победитель выбран через 11-27 дней после создания), среди них «Лендинг для онлайн-школы Python» с призами `[60, 30, 10]` и тремя выплаченными призами;
- активные конкурсы с распределениями `[100]`, `[60, 30, 10]`, `[50, 30, 20]`, окончание через 3-27 дней, и «Слоган для фитнес-клуба» с дедлайном менее чем через 24 часа; один отменённый конкурс;
- отзывы с разными оценками (рейтинги исполнителей различаются) и баллы ИИ-оценки;
- две переписки `customer1` с `executor1` и `executor2` (7 и 6 сообщений), у `customer1` есть непрочитанные;
- письма в Mailpit (новые решения, чат).

| Роль | Логин | Пароль |
|---|---|---|
| admin | `admin` | `admin123` |
| customer | `customer1`, `customer2` | `test1234` |
| executor | `executor1`, `executor2`, `executor3` | `test1234` |

## Возможности для демо

### Чат

Заказчик и исполнитель общаются по конкурсу на странице `/messages` (пункт «Сообщения» в шапке, на нём бейдж непрочитанных). Диалог открывается кнопкой «Написать исполнителю» на странице решения (заказчик) или «Задать вопрос заказчику» на странице конкурса (исполнитель). Сообщения доставляются сразу по WebSocket (`/ws/chat`, проксируется шлюзом), статус «прочитано» обновляется на лету. Если получатель не онлайн, ему уходит письмо (не чаще раза в 10 минут на беседу).

### Уведомления

Колокольчик в шапке: новые решения, смена статуса решения, победа и итоги конкурса, новые сообщения, скорый дедлайн (менее суток); всплывающие уведомления (toast) для событий в реальном времени.

### Почта (Mailpit)

Все письма платформы перехватываются Mailpit: http://localhost:8025. Настройка SMTP: раздел [Почта](#почта).

### Рейтинг и профили

Публичный профиль: `/user/:id` (клик по логину пользователя), таблица лидеров: `/top` («Рейтинг» в шапке). Рейтинг исполнителя считается из отзывов, оценки ИИ и призовых мест; формула показана в блоке «Как считается рейтинг» на странице.

### Призовые места и комиссия

При создании конкурса задаётся распределение призов (от 1 до 5 мест, в сумме 100%, например `60/30/10`). Заказчик нажимает «Подвести итоги» на странице конкурса, назначает места решениям, видит выплаты после комиссии платформы (`PLATFORM_COMMISSION_PERCENT`, по умолчанию 10%) и подтверждает. Призы сразу зачисляются на кошельки исполнителей, комиссия остаётся платформе, на странице конкурса появляется пьедестал. Приём решений закрывается по дедлайну: API отвечает 409 для неактивных и просроченных конкурсов. На странице конкурса есть обсуждение (хранится локально в браузере, отдельно для каждого конкурса).

### Метрики платформы

Админ-панель `/admin`: ключевые метрики (активные конкурсы, пользователи, среднее время до завершения, доля успешных конкурсов, комиссия платформы, выплачено призовых) с переключением периода 30 дней / 90 дней / всё время и помесячным графиком.

## Сценарий демо-ролика

Подготовка: `bash scripts/reset-demo.sh` (или `.\scripts\reset-demo.ps1`), затем `cd frontend && npm run dev`. Нужны два окна браузера: обычное и режим инкогнито (разные сессии), а также вкладка с Mailpit http://localhost:8025. Сайт: http://localhost:5173.

| № | Кто / где | Действие | Что видит зритель |
|---:|---|---|---|
| 1 | Обычное окно, `/` | Открыть главную без входа | Лента конкурсов: активные и завершённые, фильтры по типам без тестового мусора |
| 2 | Обычное окно, «Войти» | Войти как `customer1` / `test1234` | В шапке «Сообщения» с бейджем непрочитанных и колокольчик |
| 3 | Колокольчик | Открыть выпадающий список | Уведомления о решениях и сообщениях |
| 4 | «Сообщения» | Открыть диалог с `executor1` | 7 реплик про логотип на тёмном фоне, последнее сообщение исполнителя не прочитано |
| 5 | Инкогнито-окно | Войти как `executor1` / `test1234`, открыть `/messages`, положить окна рядом | Тот же диалог со стороны исполнителя |
| 6 | Инкогнито (`executor1`) | Написать «Исправил, проверьте SVG» и отправить | В первом окне сообщение появляется мгновенно, всплывает toast, растёт бейдж |
| 7 | Первое окно (`customer1`) | Ответить «Спасибо, принимаем!» | В инкогнито ответ приходит сразу, у сообщения появляется отметка «прочитано» |
| 8 | Первое окно, `/` | Открыть конкурс «Иконки для приложения доставки еды» | Призы 50/30/20, таймер до окончания, обсуждение |
| 9 | Страница конкурса | Нажать «Подвести итоги», назначить места трём решениям: 1 место `executor1`, 2 место `executor2`, 3 место `executor3` | Таблица выплат при призе 18 000 ₽: 9 000 / 5 400 / 3 600 ₽, на руки после комиссии 10%: 8 100 / 4 860 / 3 240 ₽ |
| 10 | Окно подтверждения | Подтвердить «Подвести итоги» | Пьедестал призёров, статус «Завершён», toast; в `/wallet` у исполнителей выросли балансы |
| 11 | Главная -> «Лендинг для онлайн-школы Python» | Показать готовую историю | Три призовых места 60/30/10 с суммами и пьедестал |
| 12 | Клик по логину исполнителя, затем «Рейтинг» (`/top`) | Открыть профиль и таблицу лидеров | `executor1` выше `executor2`, `executor3` новичок; бейджи, портфолио |
| 13 | Обычное окно: выйти, войти как `admin` / `admin123`, `/admin` | Показать метрики, переключить период | Среднее время до завершения около 19 дней, комиссия, выплаченные призы, помесячный график за полгода |
| 14 | Mailpit, http://localhost:8025 | Открыть список писем | Письма о решениях, сообщениях и победителях |

Шаги 8-10 меняют данные (конкурс завершается), поэтому перед повторной записью выполните сброс `scripts/reset-demo.sh`.

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

`test_protocols.py`, `test_fsm_coverage.py`, `test_blind_recovery.py` и протокольные тесты в `test_rbac.py` требуют работающий protocol-service. Пока его нет в стеке, они падают, поэтому CI запускает только остальные тесты. `test_monitoring.py::test_monitoring_service_snapshot_and_permissions` падает отдельно: он ждёт `GET /monitoring/docs` через шлюз, а monitoring-service отдаёт Swagger по `/docs`.

После прогона тесты удаляют созданные ими конкурсы и типы конкурсов; тестовые пользователи остаются (полная очистка: `bash scripts/reset-demo.sh`). В Git Bash на Windows: `set -a; . ./.env; set +a; py -3.12 -m pytest tests/pytest`.

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


## Для демонстрации: как всё устроено

### Подготовка
- Перед записью сбросить базу и заполнить демо-данными: `bash scripts/reset-demo.sh` (Windows: `scripts/reset-demo.ps1`). Скрипт пересобирает стек и запускает `seed.py`.
- Фронтенд: `cd frontend && npm run dev` → http://localhost:5173 (CORS разрешён только для :5173 и :3000).
- Почта: http://localhost:8025 (Mailpit, все письма платформы приходят сюда).
- Логины: `admin/admin123`, `customer1`, `customer2`, `executor1..3` — пароль `test1234`.
- Чат и уведомления удобно показывать в двух окнах: обычном и инкогнито (разные пользователи).

### Что где работает
| Функция | Где в интерфейсе | Как устроено |
|---|---|---|
| Чат | «Сообщения» в шапке; «Написать» на странице конкурса, решения, профиля | Настоящий: сообщения в БД contest-service, доставка по WebSocket (`/ws/chat`) мгновенно, «печатает…», «прочитано» |
| Уведомления | Колокольчик в шапке, всплывающие подсказки | Фронтенд опрашивает API раз в 30 с (новые заявки, статусы, победы, дедлайны), сообщения чата — мгновенно |
| Почта | Mailpit | Письма о новой заявке, смене статуса, победе, сообщении в чате (если получатель не в сети) |
| Дедлайны | Таймер на странице конкурса | После срока или в неактивном конкурсе подать решение нельзя (бэкенд отвечает 409) |
| Призовые места и комиссия | Создание конкурса → «Призовые места»; «Подвести итоги» на странице конкурса | До 5 мест (60/30/10 и др.), выплата из эскроу по местам автоматически, комиссия платформы 10% удерживается с выплаты |
| Рейтинг и портфолио | «Рейтинг» в шапке, клик по логину → профиль | Считается на фронтенде из побед, призовых мест, оценок и ИИ-оценки; «Как считается рейтинг» — на профиле |
| Метрики | «Админ панель» (admin) | Активные конкурсы, пользователи, среднее время до завершения, заявки на конкурс, средний фонд, доля успешных, комиссия |
| Обсуждение конкурса | Вкладка «Обсуждение» на странице конкурса | Хранится в браузере (видно только в нём) |

### Важно знать
- «О себе», навыки и аватар в профиле, а также обсуждение конкурса хранятся в `localStorage` и видны только в том браузере, где их ввели. Для seed-пользователей заполнены значения по умолчанию.
- Для показа награждения подходит конкурс «Иконки для приложения доставки еды» (`[50,30,20]`, 3 решения): места 1–3 → executor1/2/3, на руки 8 100 / 4 860 / 3 240 ₽.
- Если наградить не все места, доля пропущенных мест уходит последнему награждённому.
- Конкурс «Слоган для фитнес-клуба» заканчивается меньше чем через сутки: на нём видно напоминание о дедлайне.
- Есть демо-режим без бэкенда: `VITE_DEMO=1 npm run dev`. Данные в нём заготовленные, настоящего чата и писем нет.
- После демонстрации, если что-то сломалось или накопились лишние данные, снова запусти `scripts/reset-demo.sh`.
```
