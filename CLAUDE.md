# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Contest-based freelance platform where customers post tasks, executors submit work, and an AI model (LLaMA) automatically evaluates submissions against the technical specification before the customer selects a winner. Payments are handled via YooKassa escrow.

## Project Structure

```
frontend/   # React 19 + TypeScript + Vite (MobX state management)
backend/
  user-service/       # Auth, roles, users          → port 8001
  contest-service/    # Core: contests, submissions  → port 8002
  evaluation-service/ # LLaMA-based evaluation       → port 8003
  payment-service/    # YooKassa escrow              → port 8004
seed.py               # Test data seeder (run once against running stack)
```

## Frontend Commands

All commands run from `frontend/`:

```bash
npm run dev        # Start dev server with HMR
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build
npm test           # Run Vitest tests (single pass)
npm run test:watch # Run Vitest in watch mode
```

## Docker (Podman)

Run from repo root. Uses `podman-compose`.

```bash
podman-compose up --build              # Dev mode — HMR on http://localhost:5173
podman-compose -f docker-compose.yml up --build  # Production — nginx on http://localhost:3000

# Rebuild single service (e.g. after changing requirements.txt):
podman-compose build --no-cache user-service && podman-compose up user-service
```

Dev mode uses `docker-compose.override.yml` (picked up automatically):
- Volume mounts source code into containers for hot-reload (`--reload` uvicorn flag)
- Frontend runs Vite dev server on port 5173

Inter-container communication uses service names: `http://<service-name>:8000`

## Backend API Conventions

- **Roles**: string enums — `customer`, `executor`, `admin` (never integers)
- **Contest status**: string enum — `draft`, `active`, `finished`, `cancelled`
- **Field names**: snake_case — `customer_id`, `executor_id`, `ends_at`, `type_id`, `created_at`, `updated_at`
- **Auth**: JWT Bearer token in `Authorization` header; issued by user-service, validated locally in each service via shared `JWT_SECRET`
- **Internal calls**: protected by `X-Internal-Secret` header

### User Service (port 8001)

```
POST /auth/register   body: {email, login, password, role}  → {access_token, user}
POST /auth/login      body: {login, password}               → {access_token, user}
GET  /users/profile   (auth required)                       → UserResponse
PUT  /users/profile   body: {email?, login?, password?}     → UserResponse
GET  /users           (admin only)                          → list[UserResponse]
GET  /users/{id}                                            → UserResponse
```

### Contest Service (port 8002)

```
GET  /contests                         → {items, total, page, pages}
POST /contests  (customer/admin)       body: {title, annotation?, description?, tz_text?,
                                             prizepool, ends_at, type_id?, template_id?,
                                             stages: [{name, description?, deadline?, order}]}
GET  /contests/{id}                    → ContestOut
GET  /contests/number/{number}         → ContestOut
DELETE /contests/{id}  (admin)
POST /contests/{id}/winner?submission_id=&executor_id=  (customer/admin)
PUT  /contests/{id}/stages  (customer/admin)  body: list[StageIn]  → ContestOut  (replaces all stages, resets current_stage_id)
PATCH /contests/{id}/current-stage?stage_id=  (customer/admin)    → ContestOut  (stage_id=null clears override → auto-detect)

GET  /statistics?x=&y=  (admin)        → {x_labels, datasets}
                                         x: type|status|createdAt|endBy|prizepool
                                         y: count|prizepool

GET  /submissions                      → list[SubmissionOut]  (includes executor_login, contest_title)
POST /submissions  (executor)          body: {contest_id, title, annotation?, description?}
GET  /submissions/{id}                 → SubmissionOut
GET  /submissions/number/{number}      → SubmissionOut
PATCH /submissions/{id}/status?status=  (customer/admin)
DELETE /submissions/{id}

POST /submissions/{id}/files  (executor)  multipart: files[]  → SubmissionOut
GET  /submissions/{id}/files/{filename}                       → FileResponse

POST /submissions/{id}/reviews         body: {score, commentary?}
GET  /submissions/{id}/reviews         → list[ReviewOut]
PUT  /submissions/{id}/reviews/{num}   body: {score, commentary?}
DELETE /submissions/{id}/reviews/{num}

GET  /contest-types                    → list[{id, name}]
POST /contest-types  (admin)           body: {name}
DELETE /contest-types/{id}  (admin)
```

**SubmissionOut** fields: `id, number, contest_id, executor_id, title, annotation, description, status, files, created_at, updated_at, executor_login, contest_title`

### Payment Service (port 8004)

```
# Wallet (user-facing, JWT auth)
GET  /wallet/balance                          → {balance, currency}
POST /wallet/topup        body: {amount}      → {payment_id, redirect_url, status, amount}
GET  /wallet/transactions                     → list[WalletTransactionOut]
POST /wallet/withdraw     body: {amount, card_number?}  → PayoutOut
GET  /wallet/payment/{payment_id}             → {payment_id, status, amount}  (poll after YooKassa redirect)

# Payments (user-facing, JWT auth)
POST /payments/topup      body: {contest_id, amount, use_balance?}  → PaymentOut
GET  /payments/{contest_id}                   → PaymentOut
POST /payments/webhook                        → YooKassa webhook handler

# Escrow & transactions (internal, X-Internal-Secret)
POST /escrow/reserve      body: {contest_id, customer_id, amount}
POST /escrow/release      body: {contest_id, executor_id}
GET  /transactions
```

### Evaluation Service (port 8003) — internal only

```
POST /evaluation/evaluate  (internal)
GET  /evaluation/{submission_id}
```

## Known Issues & Fixes Applied

- **passlib + bcrypt incompatibility**: `passlib 1.7.4` doesn't support `bcrypt >= 4.1`.
  Fix: pin `bcrypt==4.0.1` in requirements.txt alongside `passlib[bcrypt]==1.7.4`.
- **pydantic EmailStr**: requires `pydantic[email]` extra (not plain `pydantic`).
- **CORS**: `allow_origins=["*"]` + `allow_credentials=True` is invalid per CORS spec — use one or the other. All services use `allow_origins=["*"]` without credentials.
- **Image rebuild**: Python packages are baked into the image. After changing `requirements.txt`, must rebuild with `--no-cache` to re-run `pip install`.
- **Admin user role**: The seed creates admin via login-first strategy. If the admin user exists in the DB with role `executor`, fix manually:
  ```sql
  UPDATE users SET role='admin' WHERE login='admin';
  ```
  Run inside: `podman exec -it devcontest_user-db_1 psql -U user_svc -d user_db`
- **New DB columns**: `create_all` only creates missing tables, not missing columns. payment-service `database.py` runs idempotent ALTER TABLE migrations on startup automatically. For other services, add columns manually via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`.

## Backend Microservices

All services: **Python + FastAPI + PostgreSQL**. Each service has its own database.

### User Service
- Tables: `users` — id, email, login, password_hash, role, status, created_at
- Passwords: bcrypt via passlib
- JWT payload: `{sub: user_id, role, login, exp}`

### Contest Service
- Tables: `contest_types`, `contest_templates`, `contests`, `contest_stages`, `submissions`, `reviews`, `winners`
- `type_id` is a real FK to `contest_types` in the same DB — must exist before creating contests
- `contests.current_stage_id` — plain Integer (no FK), nullable. Manually set by owner via `PATCH /current-stage`. If null, frontend auto-detects active stage by nearest future deadline.
- On contest creation: calls Payment Service `/escrow/reserve` → sets status `active`
- On submission: calls Evaluation Service (non-blocking, failure doesn't block submission)
- On winner selection: calls Payment Service `/escrow/release`
- File uploads stored at `/app/uploads/{submission_id}/{filename}` inside the contest-service container
- `submissions.files` — JSON array of filenames (not full paths)
- `SubmissionOut` is enriched server-side: `executor_login` via parallel calls to user-service (`asyncio.gather`), `contest_title` via local DB JOIN

### Evaluation Service
- LLaMA-based automated pre-evaluation of submissions against TZ
- Tables: `requirements`, `evaluation_results`
- Runs via Ollama container at `http://ollama:11434`, model: `llama3.1`
- Evaluation flow: parse TZ → extract requirements → compare submission → return compliance report
- Does NOT select winners — final decision always belongs to the customer

### Payment Service
- YooKassa integration (test credentials in `.env`; leave `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY` empty for stub mode)
- Tables: `payments`, `escrow_accounts`, `transactions`, `payouts`, `wallets`, `wallet_transactions`
- **Wallet**: per-user balance (`wallets` table); `wallet_transactions` audit log with types `topup | contest_payment | income | withdrawal`
- **Payment types**: `contest` (escrow top-up) vs `wallet_topup` (balance top-up); `payments.contest_id` nullable for wallet topups
- **Escrow release** credits executor wallet via `credit_wallet()` — executor receives funds as wallet balance
- **Stub mode** (no YooKassa creds): wallet topup auto-credits immediately; withdrawal succeeds without real payout
- **YooKassa flow**: `capture=false` (два шага); status polled live via `Payment.find_one` on `GET /wallet/payment/{id}` and `GET /payments/{contest_id}` — webhook not required for local dev
- **Double-credit prevention**: `_confirm_wallet_topup` uses `SELECT FOR UPDATE SKIP LOCKED`
- `database.py` `create_tables()` runs idempotent ALTER TABLE migrations on startup for columns added post-initial-deploy

## Key Scenarios

1. **Contest creation**: Customer creates contest → Payment Service reserves escrow → status `active`
2. **Submission**: Executor submits → Contest Service saves → Evaluation Service auto-evaluates (async)
3. **Finalization**: Customer selects winner → Payment Service releases escrow → credits executor wallet balance
4. **Wallet top-up (card)**: User initiates → YooKassa redirect → returns to `/wallet?wallet_topup=1&payment_id=X` → frontend polls `GET /wallet/payment/{id}` → auto-credits on `waiting_for_capture`
5. **Wallet top-up (stub)**: No YooKassa creds → balance credited immediately on `POST /wallet/topup`
6. **Pay contest from balance**: `POST /payments/topup` with `use_balance: true` → debits wallet → creates held payment → activates contest
7. **Executor withdrawal**: `POST /wallet/withdraw` → debits wallet → YooKassa payout (if configured + card provided) or stub success

## Frontend Architecture

- Entry point: `frontend/src/main.tsx`
- Root: `frontend/src/App.tsx`
- State: MobX stores in `frontend/src/store/` (ContestStore, SolutionStore, UserStore, PaymentStore)
- API: `frontend/src/services/apiService.js` — per-service base URLs, JWT Bearer interceptor
- Service base URLs: USER_API=8001, CONTEST_API=8002 (set in apiService.js)
- Dark mode: GitHub-palette CSS variables, toggled via `data-theme` attribute on `<html>`
- Tests: `frontend/src/__tests__/` — Vitest + jsdom; `setup.js` mocks `apiService` globally

### Active stage logic (frontend)
- `ContestOut.current_stage_id` — manually set by owner; `null` means auto-detect mode
- Auto-detect: first stage (sorted by `order`) whose `deadline >= now`; if none, last stage
- Badge: `Текущий` (manual) or `Текущий (авто)` (auto-detected)
- Owner can assign/clear manual stage via buttons on ContestPage; editing stages resets `current_stage_id` to null

### User caching
- `UserStore._users` is a `{ [id]: user }` map; `getById(id)` reads from cache
- `ContestsList` fetches all missing `customer_id`s after each contest list load
- `ContestPage` fetches `customer_id` on mount to show creator name

## TypeScript

Project uses composite TypeScript config:
- `tsconfig.app.json` — app source
- `tsconfig.node.json` — Vite config

## Seed Data

`seed.py` in repo root creates test data against the running stack:

```bash
python3 seed.py
```

Creates: admin/admin123, customer1/test1234, executor1/test1234, executor2/test1234,
contest types (Статья, Логотип, Баннер, Иконка), 3 contests, 4 submissions.
Safe to re-run: uses login fallback on 409 conflicts.

## Testing

### pytest (integration)
```bash
cd tests/pytest
pip install -r requirements.txt
pytest -v
```
- Requires running stack (`podman-compose up`)
- `conftest.py` — session-scoped fixtures: tokens, shared contest, submission
- `pytest.ini` — `asyncio_mode = auto`
- Files: `test_auth.py` (sc 1–5), `test_contests.py` (sc 6–21), `test_submissions.py` (sc 22–37), `test_admin.py` (sc 38–42)

### Postman
- Collection: `tests/postman/devContest_collection.json` (v2.1)
- Import into Postman; set `base_url` collection variable if needed
- Runs all 42 scenarios with `pm.test()` assertions

### Vitest (frontend unit)
```bash
cd frontend
npm test          # single pass
npm run test:watch
```
- `src/__tests__/ContestStore.test.js` — ContestStore (sc 6–21, 41)
- `src/__tests__/SolutionStore.test.js` — SolutionStore (sc 22–33)

## GitHub Actions

- `.github/workflows/claude.yml` — Claude assistant, responds to `@claude` mentions in issues and PRs
