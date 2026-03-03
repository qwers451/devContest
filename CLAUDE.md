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
npm run dev      # Start dev server with HMR
npm run build    # Type-check + production build (tsc -b && vite build)
npm run lint     # ESLint
npm run preview  # Preview production build
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

GET  /submissions                      → list[SubmissionOut]
POST /submissions  (executor)          body: {contest_id, title, annotation?, description?}
GET  /submissions/{id}
GET  /submissions/number/{number}
PATCH /submissions/{id}/status?status=  (customer/admin)
DELETE /submissions/{id}

POST /submissions/{id}/reviews         body: {score, commentary?}
GET  /submissions/{id}/reviews         → list[ReviewOut]
PUT  /submissions/{id}/reviews/{num}   body: {score, commentary?}
DELETE /submissions/{id}/reviews/{num}

GET  /contest-types                    → list[{id, name}]
POST /contest-types  (admin)           body: {name}
DELETE /contest-types/{id}  (admin)
```

### Payment Service (port 8004) — internal only

```
POST /escrow/reserve   (internal)  body: {contest_id, customer_id, amount}
POST /escrow/release   (internal)  body: {contest_id, executor_id}
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

## Backend Microservices

All services: **Python + FastAPI + PostgreSQL**. Each service has its own database.

### User Service
- Tables: `users` — id, email, login, password_hash, role, status, created_at
- Passwords: bcrypt via passlib
- JWT payload: `{sub: user_id, role, login, exp}`

### Contest Service
- Tables: `contest_types`, `contest_templates`, `contests`, `contest_stages`, `submissions`, `reviews`, `winners`
- `type_id` is a real FK to `contest_types` in the same DB — must exist before creating contests
- On contest creation: calls Payment Service `/escrow/reserve` → sets status `active`
- On submission: calls Evaluation Service (non-blocking, failure doesn't block submission)
- On winner selection: calls Payment Service `/escrow/release`

### Evaluation Service
- LLaMA-based automated pre-evaluation of submissions against TZ
- Tables: `requirements`, `evaluation_results`
- Runs via Ollama container at `http://ollama:11434`, model: `llama3.1`
- Evaluation flow: parse TZ → extract requirements → compare submission → return compliance report
- Does NOT select winners — final decision always belongs to the customer

### Payment Service
- YooKassa stub (real integration pending)
- Tables: `payments`, `escrow_accounts`, `transactions`, `payouts`
- Escrow: reserved on contest creation, released to winner on finalization

## Key Scenarios

1. **Contest creation**: Customer creates contest → Payment Service reserves escrow → status `active`
2. **Submission**: Executor submits → Contest Service saves → Evaluation Service auto-evaluates (async)
3. **Finalization**: Customer selects winner → Payment Service releases escrow to executor

## Frontend Architecture

- Entry point: `frontend/src/main.tsx`
- Root: `frontend/src/App.tsx`
- State: MobX stores in `frontend/src/store/` (ContestStore, SolutionStore, UserStore)
- API: `frontend/src/services/apiService.js` — per-service base URLs, JWT Bearer interceptor
- Service base URLs: USER_API=8001, CONTEST_API=8002 (set in apiService.js)

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

## GitHub Actions

- `.github/workflows/claude.yml` — Claude assistant, responds to `@claude` mentions in issues and PRs
