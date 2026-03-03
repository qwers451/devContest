# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Contest-based freelance platform where customers post tasks, executors submit work, and an AI model (LLaMA) automatically evaluates submissions against the technical specification before the customer selects a winner. Payments are handled via YooKassa escrow.

## Project Structure

```
frontend/   # React 19 + TypeScript + Vite
backend/
  user-service/       # Auth, roles, users
  contest-service/    # Core: contest lifecycle, submissions, winners
  evaluation-service/ # LLaMA-based automated work evaluation
  payment-service/    # YooKassa integration, escrow, payouts
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
podman-compose up --build              # Dev mode (default) — HMR on http://localhost:5173
podman-compose -f docker-compose.yml up --build  # Production — nginx on http://localhost:3000
```

Dev mode is defined in `docker-compose.override.yml` and picked up automatically.

Inter-container communication uses service names, not localhost:
- Frontend → backend services: `http://<service-name>:8000`

## Backend Microservices

All services: **Python + FastAPI + PostgreSQL**. Each service has its own database.

### User Service
Roles: `customer`, `executor`, `admin`
- Tables: `users`, `roles`

### Contest Service
Full contest lifecycle: draft → active → finished
- Tables: `contests`, `contest_templates`, `contest_stages`, `submissions`, `winners`
- On contest creation: calls Payment Service to reserve funds in escrow
- On submission: calls Evaluation Service to auto-evaluate
- On winner selection: calls Payment Service to release escrow to winner

### Evaluation Service
LLaMA-based automated pre-evaluation of submissions against the technical specification.
- Tables: `requirements`, `evaluation_results`
- Evaluation flow:
  1. Parse TZ → extract formal requirements as JSON
  2. Compare submission (text/metadata) against requirements
  3. Return compliance report:
```json
{
  "submission_id": 123,
  "compliance_score": 82,
  "passed_requirements": ["..."],
  "failed_requirements": ["..."],
  "critical_issues": false
}
```
- Supported work types: articles, logos, icons, banners (structured digital work)
- Not supported: painting, 3D models, architecture (non-formalizable)
- Does NOT select winners — final decision always belongs to the customer

### Payment Service
YooKassa integration with escrow and milestone payments.
- Tables: `payments`, `escrow_accounts`, `transactions`, `payouts`

## Key Scenarios

1. **Contest creation**: Customer creates contest → Payment Service reserves funds in escrow → status set to `active`
2. **Submission**: Executor uploads work → Contest Service saves submission → Evaluation Service auto-evaluates → report saved for customer
3. **Finalization**: Customer selects winner → Payment Service releases escrow to executor

## Frontend Architecture

- Entry point: `frontend/src/main.tsx` — mounts `<App>` in StrictMode
- Root component: `frontend/src/App.tsx`
- Styles: component-level CSS files (`App.css`, `index.css`)
- Static assets: `frontend/public/`

## TypeScript

Project uses composite TypeScript config:
- `tsconfig.app.json` — app source
- `tsconfig.node.json` — Vite config

## Team

- **Frontend** (`frontend/`) — Claude Code
- **Backend** (`backend/`) — separate developer

## GitHub Actions

- `.github/workflows/claude.yml` — Claude assistant, responds to `@claude` mentions in issues and PRs
