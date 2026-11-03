import { describe, it, expect, beforeEach, vi } from "vitest";
import { findChatTarget } from "../utils/chatTarget";
import { loadExtras, parseSkills, safeLink, saveExtras } from "../utils/profileExtras";
import type { Contest } from "../types";

const contest = (over: Partial<Contest>): Contest => ({
  id: 1,
  number: 1000,
  title: "c",
  prizepool: 1,
  ends_at: "2030-01-01T00:00:00Z",
  status: "active",
  customer_id: 10,
  stages: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const customer = { id: 10, role: "customer" as const };
const executor = { id: 20, role: "executor" as const };

describe("findChatTarget", () => {
  it("заказчик пишет исполнителю, у которого есть решение в его конкурсе (самый свежий конкурс)", () => {
    const contests = [
      contest({ id: 1, customer_id: 10, created_at: "2026-01-01T00:00:00Z" }),
      contest({ id: 2, customer_id: 10, created_at: "2026-03-01T00:00:00Z" }),
      contest({ id: 3, customer_id: 99, created_at: "2026-05-01T00:00:00Z" }),
    ];
    const subs = [
      { contest_id: 1, executor_id: 20 },
      { contest_id: 2, executor_id: 20 },
      { contest_id: 3, executor_id: 20 },
    ];
    expect(findChatTarget(customer, executor, contests, subs)).toEqual({ contestId: 2, executorId: 20 });
  });

  it("заказчик не может написать исполнителю без решений в своих конкурсах", () => {
    const contests = [contest({ id: 3, customer_id: 99 })];
    expect(findChatTarget(customer, executor, contests, [{ contest_id: 3, executor_id: 20 }])).toBeNull();
    expect(findChatTarget(customer, executor, [contest({ customer_id: 10 })], [])).toBeNull();
  });

  it("исполнитель пишет заказчику активного конкурса, даже без своих решений", () => {
    const contests = [contest({ id: 5, customer_id: 10, status: "active" })];
    expect(findChatTarget(executor, customer, contests, [])).toEqual({ contestId: 5 });
  });

  it("исполнитель пишет заказчику завершённого конкурса только если участвовал", () => {
    const contests = [contest({ id: 6, customer_id: 10, status: "finished" })];
    expect(findChatTarget(executor, customer, contests, [])).toBeNull();
    expect(findChatTarget(executor, customer, contests, [{ contest_id: 6, executor_id: 20 }])).toEqual({ contestId: 6 });
  });

  it("чужие решения не дают исполнителю права писать по завершённому конкурсу", () => {
    const contests = [contest({ id: 6, customer_id: 10, status: "finished" })];
    expect(findChatTarget(executor, customer, contests, [{ contest_id: 6, executor_id: 77 }])).toBeNull();
  });

  it("черновик заказчика не открывает чат", () => {
    expect(findChatTarget(executor, customer, [contest({ customer_id: 10, status: "draft" })], [])).toBeNull();
  });

  it("нельзя писать самому себе, гостю, администратору и пользователю той же роли", () => {
    const contests = [contest({ customer_id: 10 })];
    const subs = [{ contest_id: 1, executor_id: 20 }];
    expect(findChatTarget(customer, customer, contests, subs)).toBeNull();
    expect(findChatTarget(null, executor, contests, subs)).toBeNull();
    expect(findChatTarget({ id: 1, role: "admin" }, executor, contests, subs)).toBeNull();
    expect(findChatTarget(executor, { id: 21, role: "executor" }, contests, subs)).toBeNull();
    expect(findChatTarget(customer, { id: 11, role: "customer" }, contests, subs)).toBeNull();
  });
});

describe("profileExtras", () => {
  beforeEach(() => localStorage.clear());

  it("сохраняет и читает поля по id пользователя", () => {
    const extras = { about: "Привет", skills: ["React"], link: "github.com/x", avatarColor: "#123456", avatarImage: "" };
    expect(saveExtras(5, extras)).toBe(true);
    expect(loadExtras(5)).toEqual(extras);
    expect(loadExtras(6).about).toBe("");
  });

  it("для seed-логина при пустом хранилище возвращаются профиль по умолчанию, правки пользователя приоритетнее", () => {
    for (const login of ["customer1", "executor1", "executor2", "executor3"]) {
      const e = loadExtras(900, login);
      expect(e.about.length).toBeGreaterThan(30);
      expect(e.skills.length).toBeGreaterThanOrEqual(3);
      expect(e.skills.length).toBeLessThanOrEqual(6);
      expect(e.link).toMatch(/^https?:\/\//);
    }
    expect(loadExtras(900, "someone_else").about).toBe("");
    saveExtras(900, { about: "Мой текст", skills: [], link: "", avatarColor: "#111111", avatarImage: "" });
    const mine = loadExtras(900, "executor1");
    expect(mine.about).toBe("Мой текст");
    expect(mine.skills).toEqual([]);
  });

  it("битый JSON в хранилище не ломает чтение", () => {
    localStorage.setItem("devcontest:profile:7", "{oops");
    expect(loadExtras(7).skills).toEqual([]);
  });

  it("если хранилище недоступно, чтение возвращает пустой профиль, а запись сообщает об ошибке", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadExtras(1).about).toBe("");
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveExtras(1, loadExtras(1))).toBe(false);
    set.mockRestore();
  });

  it("parseSkills: убирает пустые и повторы, ограничивает число и длину", () => {
    expect(parseSkills("React, react ,, TypeScript;Node.js\nGo")).toEqual(["React", "TypeScript", "Node.js", "Go"]);
    expect(parseSkills(Array.from({ length: 20 }, (_, i) => `s${i}`).join(",")).length).toBe(12);
    expect(parseSkills("x".repeat(60))[0].length).toBe(24);
    expect(parseSkills("   ")).toEqual([]);
  });

  it("safeLink: добавляет https, отвергает опасные схемы", () => {
    expect(safeLink("github.com/me")).toBe("https://github.com/me");
    expect(safeLink("http://site.dev/a")).toBe("http://site.dev/a");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("")).toBeNull();
  });
});
