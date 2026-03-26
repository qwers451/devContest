# Frontend — devContest

React 19 + TypeScript + Vite + MobX.

## Разработка

```bash
npm install
npm run dev      # http://localhost:5173
```

## Сборка

```bash
npm run build
npm run preview  # предпросмотр сборки
```

## Тесты

```bash
npm run test              # Vitest (unit)
npm run cypress:run       # Cypress e2e (headless)
npm run cypress:open      # Cypress e2e (GUI)
```

## Переменные окружения

```env
VITE_GATEWAY_URL=http://localhost:8080
VITE_USER_API_URL=http://localhost:8001
VITE_CONTEST_API_URL=http://localhost:8002
VITE_EVAL_API_URL=http://localhost:8003
VITE_PAYMENT_API_URL=http://localhost:8004
```
