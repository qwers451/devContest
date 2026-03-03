# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

The app lives in `frontend/` — a React 19 + TypeScript + Vite project. All development work happens inside that directory.

## Commands

All commands run from `frontend/`:

```bash
npm run dev      # Start dev server with HMR
npm run build    # Type-check + production build (tsc -b && vite build)
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Architecture

- Entry point: `frontend/src/main.tsx` — mounts `<App>` in StrictMode
- Root component: `frontend/src/App.tsx`
- Styles: component-level CSS files (`App.css`, `index.css`)
- Static assets: `frontend/public/`

## TypeScript

Project uses composite TypeScript config:
- `tsconfig.app.json` — app source
- `tsconfig.node.json` — Vite config

## GitHub Actions

- `.github/workflows/claude.yml` — Claude assistant, responds to `@claude` mentions in issues and PRs
