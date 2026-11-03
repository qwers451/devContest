// Границы содержательных блоков на снятых экранах — по ним камера кадрирует целые блоки.
// Пишет public/shots/blocks.json. Нужен фронтенд в демо-режиме на :5174.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5174";
const USERS = {
  customer: { id: 1, login: "orbit_studio", email: "hi@orbit.studio", role: "customer", status: 1 },
  executor: { id: 2, login: "kate_dev", email: "kate@mail.dev", role: "executor", status: 1 },
  admin: { id: 6, login: "admin", email: "admin@devcontest.app", role: "admin", status: 1 },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

// Для каждого экрана — именованные блоки: CSS-селектор или текст заголовка, чей родитель-карточка нам нужен.
const PAGES = {
  landing: { route: "/", blocks: { hero: ".hm-hero__grid", text: ".hm-hero__text", shot: ".hm-hero .shot" } },
  contests: { route: "/contests", blocks: { page: "main, #root > div > div", list: ".ui-stagger", first: ".ui-stagger > :first-child" } },
  create: { route: "/create-contest", as: "customer", full: true, blocks: { form: "form", title: "@Название", spec: "@Техническое задание", prize: "@Призовые места" } },
  solution: { route: "/solution/318", as: "executor", full: true, blocks: { card: "@Описание", ai: ".ui-bar", criteria: ".ui-stagger" } },
  chat: { route: "/messages/1", as: "customer", blocks: { panel: "@Сообщения" } },
  results: { route: "/contest/1039", full: true, blocks: { podium: "@Итоги конкурса", card: "@Витрина маркетплейса стройматериалов" } },
  profile: { route: "/user/2", full: true, blocks: { head: "@kate_dev", stats: "@Решений", portfolio: "@Портфолио" } },
  top: { route: "/top", blocks: { list: ".ui-stagger" } },
  admin: { route: "/admin", as: "admin", full: true, blocks: { metrics: "@Ключевые метрики" } },
  wallet: { route: "/wallet", as: "customer", blocks: { balance: "@Текущий баланс" } },
};

const out = {};
for (const [name, cfg] of Object.entries(PAGES)) {
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  await p.goto(BASE + "/", { waitUntil: "networkidle0" });
  await p.evaluate((u) => { localStorage.clear(); if (u) { localStorage.setItem("token", "demo"); localStorage.setItem("isAuth", "true"); localStorage.setItem("user", JSON.stringify(u)); } }, cfg.as ? USERS[cfg.as] : null);
  await p.goto(BASE + cfg.route, { waitUntil: "networkidle0" });
  await sleep(1500);
  out[name] = {};
  for (const [k, sel] of Object.entries(cfg.blocks)) {
    out[name][k] = await p.evaluate((sel) => {
      let el;
      if (sel.startsWith("@")) {
        // Элемент с этим текстом → ближайший предок-карточка (с рамкой) или секция.
        const text = sel.slice(1);
        const all = [...document.querySelectorAll("h1,h2,h3,h4,p,span,div,label,button")].filter((e) => e.childElementCount === 0 && e.textContent.trim().startsWith(text));
        el = all[0];
        while (el && el.parentElement) {
          const cs = getComputedStyle(el);
          if (cs.borderTopWidth !== "0px" && el.getBoundingClientRect().width > 300) break;
          el = el.parentElement;
        }
      } else {
        el = document.querySelector(sel);
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }, sel);
  }
  console.log(name, JSON.stringify(out[name]));
  await p.close();
}
fs.writeFileSync("public/shots/blocks.json", JSON.stringify(out, null, 2));
await b.close();
