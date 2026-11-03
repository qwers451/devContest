// Съёмка экранов продукта для демо-ролика.
// Запуск: фронтенд в демо-режиме (VITE_DEMO=1 npx vite --port 5174), затем
//   node scripts/capture.mjs
// Пишет 2x-скриншоты в public/shots/ и координаты ключевых блоков в public/shots/layout.json.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5174";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.resolve("public/shots");
fs.mkdirSync(OUT, { recursive: true });

const USERS = {
  customer: { id: 1, login: "orbit_studio", email: "hi@orbit.studio", role: "customer", status: 1 },
  executor: { id: 2, login: "kate_dev", email: "kate@mail.dev", role: "executor", status: 1 },
  admin: { id: 6, login: "admin", email: "admin@devcontest.app", role: "admin", status: 1 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const layout = {};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function shot(name, { route, as, size = [1920, 1080], scale = 2, full = false, wait = 1500, act, boxes = {} }) {
  const page = await browser.newPage();
  await page.setViewport({ width: size[0], height: size[1], deviceScaleFactor: scale });
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await page.evaluate((u) => {
    localStorage.clear();
    if (u) {
      localStorage.setItem("token", "demo");
      localStorage.setItem("isAuth", "true");
      localStorage.setItem("user", JSON.stringify(u));
    }
  }, as ? USERS[as] : null);
  await page.goto(BASE + route, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(wait);
  if (act) await act(page);
  const pageH = full ? await page.evaluate(() => document.documentElement.scrollHeight) : size[1];
  const rects = {};
  for (const [key, sel] of Object.entries(boxes)) {
    rects[key] = await page.evaluate((s) => {
      const el = typeof s === "string" ? document.querySelector(s) : null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }, sel);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  layout[name] = { w: size[0], h: pageH, scale, rects };
  console.log("shot", name, pageH, JSON.stringify(rects));
  await page.close();
}

const clickText = async (page, text, sel = "button") => {
  const handles = await page.$$(sel);
  for (const h of handles) {
    if ((await h.evaluate((e) => e.textContent.trim())) === text) {
      await h.click();
      return;
    }
  }
  throw new Error(`no ${sel} with text ${text}`);
};

await shot("landing", { route: "/", wait: 2500 });
await shot("contests", { route: "/contests", wait: 1800, boxes: { list: ".ui-stagger" } });
await shot("contest-ai", {
  route: "/contest/1042",
  act: async (p) => {
    await clickText(p, "Анализ ИИ");
    await sleep(1200);
  },
});
await shot("create", {
  route: "/create-contest",
  as: "customer",
  full: true,
  act: async (p) => {
    await p.type('input[placeholder="Название конкурса"]', "Личный кабинет для страхового брокера");
    await p.type('input[placeholder="Краткое описание"]', "Кабинет с полисами, выплатами и уведомлениями");
    await p.type(
      'textarea[placeholder^="Опишите требования"]',
      "1. Авторизация по номеру телефона\n2. Список полисов с фильтрами\n3. История выплат\n4. Адаптив от 360px",
    );
    await p.type('input[placeholder="Например: 5000"]', "180000");
    await clickText(p, "60 / 30 / 10");
    await sleep(600);
  },
  boxes: { prize: 'input[placeholder="Например: 5000"]' },
});
await shot("solution", { route: "/solution/318", as: "executor", full: true, wait: 2500, boxes: { bar: ".ui-bar" } });
await shot("chat", { route: "/messages/1", as: "customer", wait: 1800 });
await shot("bell", {
  route: "/contests",
  as: "customer",
  act: async (p) => {
    await p.click('button[aria-label^="Уведомления"]');
    await sleep(800);
  },
});
await shot("results", { route: "/contest/1039", full: true, wait: 2000 });
await shot("profile", { route: "/user/2", full: true, wait: 2000 });
await shot("top", { route: "/top", wait: 1800 });
await shot("admin", { route: "/admin", as: "admin", full: true, wait: 3500 });
await shot("wallet", { route: "/wallet", as: "customer", wait: 1500 });
await shot("m-landing", { route: "/", size: [390, 844], scale: 3, wait: 2500 });
await shot("m-contests", { route: "/contests", size: [390, 844], scale: 3, wait: 1800 });
await shot("m-solution", { route: "/solution/318", as: "executor", size: [390, 844], scale: 3, wait: 2500 });

fs.writeFileSync(path.join(OUT, "layout.json"), JSON.stringify(layout, null, 2));
await browser.close();
