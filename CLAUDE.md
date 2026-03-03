# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
frontend/   # React 19 + TypeScript + Vite
backend/    # Python microservices (each service in its own subdirectory)
```

## Commands

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
podman-compose up --build    # Dev mode (default) — HMR on http://localhost:5173
podman-compose -f docker-compose.yml up --build   # Production — nginx on http://localhost:3000
```

Dev mode is defined in `docker-compose.override.yml` and picked up automatically.

Inter-container communication uses service names, not localhost:
- Frontend → backend: `http://backend:8000`

## Frontend Architecture

- Entry point: `frontend/src/main.tsx` — mounts `<App>` in StrictMode
- Root component: `frontend/src/App.tsx`
- Styles: component-level CSS files (`App.css`, `index.css`)
- Static assets: `frontend/public/`

## TypeScript

Project uses composite TypeScript config:
- `tsconfig.app.json` — app source
- `tsconfig.node.json` — Vite config

## Backend

Python microservices in `backend/`. Each service is a separate directory with its own Dockerfile.

When adding a new service or changing an API, document the contract (endpoints, request/response shapes) in the service README.

## Team

- **Frontend** (`frontend/`) — Claude Code
- **Backend** (`backend/`) — separate developer

## GitHub Actions

- `.github/workflows/claude.yml` — Claude assistant, responds to `@claude` mentions in issues and PRs
