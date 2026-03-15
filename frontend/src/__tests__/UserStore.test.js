/**
 * Vitest unit tests for UserStore
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "../services/apiService";
import UserStore from "../store/UserStore";

let store;

beforeEach(() => {
  localStorage.clear();
  store = new UserStore();
  vi.clearAllMocks();
});

// ── Конструктор ───────────────────────────────────────────────────────────────

describe("Конструктор UserStore", () => {
  it("по умолчанию isAuth=false, user={}", () => {
    expect(store.isAuth).toBe(false);
    expect(store.user).toEqual({});
  });

  it("загружает isAuth из localStorage", () => {
    localStorage.setItem("isAuth", "true");
    const s = new UserStore();
    expect(s.isAuth).toBe(true);
  });

  it("загружает user из localStorage", () => {
    const saved = { id: 1, login: "testuser", role: "customer" };
    localStorage.setItem("user", JSON.stringify(saved));
    const s = new UserStore();
    expect(s.user).toEqual(saved);
  });
});

// ── setIsAuth ─────────────────────────────────────────────────────────────────

describe("setIsAuth", () => {
  it("устанавливает true и сохраняет в localStorage", () => {
    store.setIsAuth(true);
    expect(store.isAuth).toBe(true);
    expect(JSON.parse(localStorage.getItem("isAuth"))).toBe(true);
  });

  it("устанавливает false и сохраняет в localStorage", () => {
    store.setIsAuth(true);
    store.setIsAuth(false);
    expect(store.isAuth).toBe(false);
    expect(JSON.parse(localStorage.getItem("isAuth"))).toBe(false);
  });
});

// ── setUser ───────────────────────────────────────────────────────────────────

describe("setUser", () => {
  it("обновляет _user и localStorage", () => {
    const u = { id: 5, login: "alice", role: "executor" };
    store.setUser(u);
    expect(store.user).toEqual(u);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(u);
  });
});

// ── setUsers / setUserById ─────────────────────────────────────────────────────

describe("setUsers и setUserById", () => {
  it("setUsers сохраняет карту пользователей", () => {
    store.setUsers({ 1: { id: 1, login: "a" }, 2: { id: 2, login: "b" } });
    expect(store.users[1].login).toBe("a");
  });

  it("setUserById добавляет пользователя в карту по id", () => {
    store.setUserById({ id: 7, login: "bob" });
    expect(store.users[7].login).toBe("bob");
  });

  it("setUserById с объектом без id — не добавляет запись", () => {
    store.setUserById({ login: "noid" });
    expect(Object.keys(store.users)).toHaveLength(0);
  });

  it("setUserById с null — не падает", () => {
    expect(() => store.setUserById(null)).not.toThrow();
  });
});

// ── getById / getCurrentUserId ────────────────────────────────────────────────

describe("getById и getCurrentUserId", () => {
  it("getById возвращает пользователя по id", () => {
    store.setUserById({ id: 3, login: "carol" });
    expect(store.getById(3).login).toBe("carol");
  });

  it("getById возвращает null если нет пользователя", () => {
    expect(store.getById(999)).toBeNull();
  });

  it("getCurrentUserId возвращает id текущего пользователя", () => {
    store.setUser({ id: 42, login: "me" });
    expect(store.getCurrentUserId()).toBe(42);
  });

  it("getCurrentUserId возвращает null если user пустой", () => {
    expect(store.getCurrentUserId()).toBeNull();
  });
});

// ── fetchUserById ─────────────────────────────────────────────────────────────

describe("fetchUserById", () => {
  it("загружает пользователя и сохраняет в кеш", async () => {
    const u = { id: 10, login: "dave", role: "executor" };
    api.fetchData.mockResolvedValue(u);
    const result = await store.fetchUserById(10);
    expect(api.fetchData).toHaveBeenCalledWith("/users/10");
    expect(result).toEqual(u);
    expect(store.getById(10)).toEqual(u);
  });

  it("при ошибке возвращает null и не падает", async () => {
    api.fetchData.mockRejectedValue(new Error("Not found"));
    const result = await store.fetchUserById(999);
    expect(result).toBeNull();
  });
});

// ── fetchUsers ────────────────────────────────────────────────────────────────

describe("fetchUsers", () => {
  it("загружает список и строит карту по id", async () => {
    const list = [
      { id: 1, login: "a" },
      { id: 2, login: "b" },
    ];
    api.fetchData.mockResolvedValue(list);
    await store.fetchUsers();
    expect(api.fetchData).toHaveBeenCalledWith("/users");
    expect(store.users[1].login).toBe("a");
    expect(store.users[2].login).toBe("b");
  });

  it("при ошибке не падает", async () => {
    api.fetchData.mockRejectedValue(new Error("Forbidden"));
    await expect(store.fetchUsers()).resolves.toBeUndefined();
  });
});
