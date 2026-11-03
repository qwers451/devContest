import { describe, it, expect, beforeEach, vi } from "vitest";
import RatingStore, { awardDate, toAwards } from "../store/RatingStore";
import { fetchData } from "../services/apiService";
import type { Contest, Submission, User } from "../types";

const mockFetch = fetchData as unknown as ReturnType<typeof vi.fn>;
const DAY = 86400000;
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString();

const contest = (over: Partial<Contest>): Contest => ({
  id: 1,
  number: 1000,
  title: "Конкурс",
  prizepool: 1000,
  ends_at: iso(-10),
  status: "finished",
  type_id: 1,
  customer_id: 100,
  stages: [],
  created_at: iso(-60),
  updated_at: iso(-10),
  ...over,
});

const submission = (over: Partial<Submission>): Submission => ({
  id: 1,
  number: 1,
  contest_id: 1,
  executor_id: 2,
  title: "Решение",
  status: 1,
  files: [],
  created_at: iso(-20),
  updated_at: iso(-20),
  ...over,
});

const user = (id: number, login: string): User => ({
  id,
  login,
  email: `${login}@x.dev`,
  role: "executor",
  status: 1,
  created_at: iso(-300 + id),
});

describe("toAwards", () => {
  it("берёт награды из конкурса и добавляет победителя старого формата без строк наград", () => {
    const list = toAwards([
      contest({ id: 1, awards: [{ place: 2, submission_id: 5, executor_id: 3, amount: 400 }] }),
      contest({ id: 2, prizepool: 900, winner: { submission_id: 8, executor_id: 4, selected_at: iso(-3) } }),
    ]);
    expect(list.map((a) => [a.contestId, a.executorId, a.place, a.amount])).toEqual([
      [1, 3, 2, 400],
      [2, 4, 1, 900],
    ]);
  });

  it("не дублирует победителя, если первое место уже есть в наградах", () => {
    const list = toAwards([
      contest({
        winner: { submission_id: 5, executor_id: 3, selected_at: iso(-3) },
        awards: [{ place: 1, submission_id: 5, executor_id: 3, amount: 1000 }],
      }),
    ]);
    expect(list).toHaveLength(1);
  });

  it("дата награды не из будущего", () => {
    const future = contest({ ends_at: iso(15) });
    expect(new Date(awardDate(future)).getTime()).toBeLessThanOrEqual(Date.now());
    const past = contest({ ends_at: iso(-40) });
    expect(Math.abs(new Date(awardDate(past)).getTime() - new Date(past.ends_at).getTime())).toBeLessThan(5);
  });
});

describe("legacy winners and commission", () => {
  it("победитель старого формата без наград: призовой фонд брутто и 90% на руки", () => {
    const [a] = toAwards([contest({ id: 3, prizepool: 50000, winner: { submission_id: 9, executor_id: 4, selected_at: iso(-2) } })]);
    expect(a.amount).toBe(50000);
    expect(a.netAmount).toBe(45000);
    expect(a.place).toBe(1);
  });

  it("комиссия берётся из параметра, а не зашита", () => {
    const [a] = toAwards(
      [contest({ prizepool: 1000, winner: { submission_id: 9, executor_id: 4, selected_at: iso(-2) } })],
      Date.now(),
      20,
    );
    expect(a.netAmount).toBe(800);
  });

  it("конкурс с наградами не удваивает победителя; net берётся из награды", () => {
    const list = toAwards([
      contest({
        prizepool: 1000,
        winner: { submission_id: 5, executor_id: 3, selected_at: iso(-3) },
        awards: [
          { place: 1, submission_id: 5, executor_id: 3, amount: 600, net_amount: 540 },
          { place: 2, submission_id: 6, executor_id: 4, amount: 400, net_amount: 360 },
        ],
      }),
    ]);
    expect(list).toHaveLength(2);
    expect(list.reduce((s, a) => s + a.amount, 0)).toBe(1000);
    expect(list.reduce((s, a) => s + (a.netAmount ?? 0), 0)).toBe(900);
  });

  it("решение со статусом «Победитель» без winner и наград даёт победу с призовым фондом", () => {
    const list = toAwards(
      [contest({ id: 7, prizepool: 20000 })],
      Date.now(),
      10,
      [{ id: 11, contest_id: 7, executor_id: 2, status: 3 }, { id: 12, contest_id: 7, executor_id: 5, status: 1 }],
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ executorId: 2, place: 1, amount: 20000, netAmount: 18000 });
  });

  it("статус «Победитель» не дублирует награду, если победитель уже записан", () => {
    const list = toAwards(
      [contest({ id: 7, prizepool: 20000, winner: { submission_id: 11, executor_id: 2, selected_at: iso(-1) } })],
      Date.now(),
      10,
      [{ id: 11, contest_id: 7, executor_id: 2, status: 3 }],
    );
    expect(list).toHaveLength(1);
  });
});

describe("RatingStore", () => {
  let store: RatingStore;
  beforeEach(() => {
    mockFetch.mockReset();
    store = new RatingStore();
  });

  const wire = (opts: { subsFail?: boolean } = {}) => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === "/contests") {
        return {
          items: [
            contest({ id: 1, type_id: 1, awards: [{ place: 1, submission_id: 1, executor_id: 2, amount: 5000 }] }),
            contest({ id: 2, type_id: 2, ends_at: iso(-90), awards: [{ place: 1, submission_id: 2, executor_id: 3, amount: 3000 }] }),
          ],
          total: 2,
          page: 1,
          pages: 1,
        };
      }
      if (url === "/submissions") {
        if (opts.subsFail) throw new Error("401");
        return [
          submission({ id: 1, contest_id: 1, executor_id: 2, status: 3, avg_score: 9, ai_score: 90 }),
          submission({ id: 2, contest_id: 2, executor_id: 3, status: 3, avg_score: 8, ai_score: 80, created_at: iso(-100) }),
        ];
      }
      const m = url.match(/^\/users\/(\d+)$/);
      if (m) return user(Number(m[1]), `user${m[1]}`);
      throw new Error(`unexpected ${url}`);
    });
  };

  it("loadLeaderboard собирает рейтинг из конкурсов, решений и профилей", async () => {
    wire();
    await store.loadLeaderboard();
    expect(store.error).toBe("");
    const board = store.leaderboard("all");
    expect(board.map((e) => e.login).sort()).toEqual(["user2", "user3"]);
    expect(board[0].rating.stats.wins).toBe(1);
  });

  it("фильтры типа конкурса и периода работают", async () => {
    wire();
    await store.loadLeaderboard();
    expect(store.leaderboard("all", 2).map((e) => e.login)).toEqual(["user3"]);
    expect(store.leaderboard("30d").map((e) => e.login)).toEqual(["user2"]);
    expect(store.leaderboard("30d", 2)).toEqual([]);
  });

  it("если решения недоступны (гость), рейтинг строится по наградам", async () => {
    wire({ subsFail: true });
    await store.loadLeaderboard();
    expect(store.submissionsUnavailable).toBe(true);
    const board = store.leaderboard("all");
    expect(board).toHaveLength(2);
    expect(board.every((e) => e.rating.stats.wins === 1)).toBe(true);
  });

  it("ошибка загрузки конкурсов отражается в error, а не бросается", async () => {
    mockFetch.mockRejectedValue(new Error("down"));
    await store.loadLeaderboard();
    expect(store.error).toMatch(/Не удалось загрузить/);
    expect(store.loading).toBe(false);
  });

  it("кеширует пользователей и не дублирует одновременные запросы", async () => {
    wire();
    await Promise.all([store.ensureUser(2), store.ensureUser(2)]);
    await store.ensureUser(2);
    const calls = mockFetch.mock.calls.filter((c) => c[0] === "/users/2");
    expect(calls).toHaveLength(1);
  });

  it("заработок исполнителя с победами по старому формату не нулевой и учитывает комиссию из API", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === "/payments/commission") return { percent: 10 };
      if (url === "/contests") {
        return { items: [contest({ id: 1, prizepool: 10000 }), contest({ id: 2, prizepool: 5000 })], total: 2, page: 1, pages: 1 };
      }
      return [
        submission({ id: 1, contest_id: 1, executor_id: 2, status: 3 }),
        submission({ id: 2, contest_id: 2, executor_id: 2, status: 3 }),
      ];
    });
    await store.ensureContests();
    await store.ensureExecutorSubmissions(2);
    const mine = store.awards.filter((a) => a.executorId === 2);
    expect(mine.reduce((s, a) => s + a.amount, 0)).toBe(15000);
    expect(mine.reduce((s, a) => s + (a.netAmount ?? 0), 0)).toBe(13500);
  });

  it("несуществующий пользователь даёт null", async () => {
    mockFetch.mockRejectedValue(new Error("404"));
    expect(await store.ensureUser(999)).toBeNull();
  });

  it("решения одного исполнителя запрашиваются с executor_id и кешируются", async () => {
    mockFetch.mockResolvedValue([submission({ executor_id: 7 })]);
    await store.ensureExecutorSubmissions(7);
    await store.ensureExecutorSubmissions(7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ executor_id: 7 });
  });
});
