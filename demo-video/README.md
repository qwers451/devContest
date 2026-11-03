# Демо-ролик devContest

Ролик ~63 с, 1920×1080, 60 fps, до 50 МБ (видео 5 Мбит/с + звук 192 кбит/с, см. `remotion.config.ts`), собран на [Remotion](https://www.remotion.dev/) из настоящих экранов продукта.

## Как пересобрать

1. Запустить фронтенд в демо-режиме (данные без бэкенда):

   ```bash
   cd ../frontend && VITE_DEMO=1 npx vite --port 5174
   ```

2. Снять экраны продукта заново (2x-скриншоты в `public/shots/`):

   ```bash
   node scripts/capture.mjs
   ```

3. Посмотреть и править в Studio:

   ```bash
   npm run dev
   ```

4. Отрендерить (с музыкой и без):

   ```bash
   npx remotion render src/index.ts DevContestDemo out/devcontest-demo.mp4 --crf=18
   npx remotion render src/index.ts DevContestDemo out/devcontest-demo-nobgm.mp4 --crf=18 --props=props-nobgm.json
   ```

Контрольные кадры по всем сценам: `node scripts/qa.mjs out/qa` (или только нужные: `node scripts/qa.mjs out/qa ai,score`).

## Устройство

- `src/DemoVideo.tsx` — таблица сцен `SHOTS` (порядок, длительности, переходы) и звуковые акценты; всё остальное считается от неё.
- `src/time.ts` — тайминги в сценах записаны в кадрах 30 fps, рендер идёт в 60 fps; `useT()` и `f30()` переводят одно в другое.
- Камера (`src/components/Shot.tsx`) кадрирует целые блоки интерфейса по границам из `public/shots/blocks.json` (`node scripts/measure.mjs`).
- `src/scenes/` — сцены: вступление, функции продукта, итоги и финал.
- `src/components/` — кинетический текст, окно-«камера» над скриншотом, поле символов как на лендинге, счётчик.
- `public/audio/ATTRIBUTION.md` — источники музыки и звуков (Mixkit, бесплатная лицензия).
