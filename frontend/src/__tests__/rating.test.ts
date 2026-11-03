import { describe, it, expect } from "vitest";
import {
  buildLeaderboard,
  computeCustomerStats,
  computeRating,
  filterByPeriod,
  levelFor,
  nextLevel,
  periodCutoff,
  rankEntries,
  type LeaderboardEntry,
  type RatingAward,
  type RatingSubmission,
} from "../utils/rating";

const DAY = 86400000;
const NOW = new Date("2026-06-30T12:00:00Z").getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

let seq = 0;
const sub = (over: Partial<RatingSubmission> = {}): RatingSubmission => ({
  id: ++seq,
  contestId: seq,
  status: 1,
  aiScore: null,
  avgReview: null,
  createdAt: iso(1),
  ...over,
});
const award = (over: Partial<RatingAward> = {}): RatingAward => ({
  place: 1,
  contestId: 1,
  submissionId: 1,
  amount: 1000,
  awardedAt: iso(1),
  ...over,
});

describe("computeRating: пустые и неполные данные", () => {
  it("исполнитель без данных: рейтинг 0, «Новичок», без NaN", () => {
    const r = computeRating({ submissions: [], awards: [] });
    expect(r.score).toBe(0);
    expect(r.level).toBe("Новичок");
    expect(r.badges).toEqual([]);
    expect(r.stats.submissions).toBe(0);
    expect(r.stats.avgReview).toBeNull();
    expect(r.stats.avgAi).toBeNull();
    expect(Object.values(r.stats).every((v) => v === null || Number.isFinite(v))).toBe(true);
  });

  it("решения без оценок и ИИ не дают NaN и не обнуляют рейтинг", () => {
    const r = computeRating({ submissions: [sub(), sub()], awards: [] });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.stats.avgReview).toBeNull();
    expect(r.stats.successRate).toBe(0);
  });

  it("игнорирует NaN/Infinity в оценках", () => {
    const r = computeRating({
      submissions: [sub({ avgReview: NaN, aiScore: Infinity }), sub({ avgReview: 8, aiScore: 80 })],
      awards: [],
    });
    expect(r.stats.reviewsCount).toBe(1);
    expect(r.stats.avgReview).toBe(8);
    expect(r.stats.avgAi).toBe(80);
  });

  it("рейтинг всегда в диапазоне 0..5 с одним знаком после запятой", () => {
    const subs = Array.from({ length: 30 }, () => sub({ avgReview: 10, aiScore: 100, status: 3 }));
    const awards = subs.map((s, i) => award({ contestId: 1000 + i, submissionId: s.id }));
    const r = computeRating({ submissions: subs, awards });
    expect(r.score).toBeLessThanOrEqual(5);
    expect(r.score).toBeGreaterThan(4.5);
    expect(Math.round(r.score * 10) / 10).toBe(r.score);
    const bad = computeRating({ submissions: [sub({ avgReview: 999, aiScore: -50 })], awards: [] });
    expect(bad.score).toBeGreaterThanOrEqual(0);
    expect(bad.score).toBeLessThanOrEqual(5);
  });
});

describe("computeRating: сглаживание отзывов", () => {
  it("один отзыв 10/10 не обгоняет 20 отзывов по 9.6/10", () => {
    const one = computeRating({ submissions: [sub({ avgReview: 10 })], awards: [] });
    const many = computeRating({
      submissions: Array.from({ length: 20 }, () => sub({ avgReview: 9.6 })),
      awards: [],
    });
    expect(many.score).toBeGreaterThan(one.score);
  });

  it("новичок с одной идеальной оценкой ещё не получает высокий уровень", () => {
    const r = computeRating({ submissions: [sub({ avgReview: 10, aiScore: 100 })], awards: [] });
    expect(["Новичок", "Специалист"]).toContain(r.level);
  });

  it("рейтинг растёт с ростом средней оценки при одинаковом числе отзывов", () => {
    const mk = (v: number) =>
      computeRating({ submissions: Array.from({ length: 5 }, () => sub({ avgReview: v })), awards: [] }).score;
    expect(mk(9)).toBeGreaterThan(mk(6));
    expect(mk(6)).toBeGreaterThan(mk(3));
  });

  it("явно переданные reviews приоритетнее avgReview решений", () => {
    const r = computeRating({
      submissions: [sub({ avgReview: 2 })],
      reviews: [10, 10, 10],
      awards: [],
    });
    expect(r.stats.reviewsCount).toBe(3);
    expect(r.stats.avgReview).toBe(10);
  });
});

describe("computeRating: победы, места, деньги", () => {
  it("победа повышает рейтинг, призовое место ниже победы, но выше нуля", () => {
    const base = { submissions: [sub({ avgReview: 8, aiScore: 80 })] };
    const none = computeRating({ ...base, awards: [] }).score;
    const second = computeRating({ ...base, awards: [award({ place: 2 })] }).score;
    const first = computeRating({ ...base, awards: [award({ place: 1 })] }).score;
    expect(second).toBeGreaterThan(none);
    expect(first).toBeGreaterThan(second);
  });

  it("считает победы по первым местам, призовые места по всем наградам и сумму до комиссии", () => {
    const r = computeRating({
      submissions: [sub(), sub(), sub(), sub()],
      awards: [
        award({ place: 1, contestId: 1, amount: 100000 }),
        award({ place: 2, contestId: 2, amount: 40000 }),
        award({ place: 1, contestId: 3, amount: 60000 }),
      ],
    });
    expect(r.stats.wins).toBe(2);
    expect(r.stats.prizePlaces).toBe(3);
    expect(r.stats.totalPrize).toBe(200000);
    expect(r.stats.successRate).toBeCloseTo(0.75);
  });

  it("решение со статусом «Победитель» без строки награды тоже считается победой, но не дважды", () => {
    const winner = sub({ contestId: 7, status: 3 });
    const legacy = computeRating({ submissions: [winner], awards: [] });
    expect(legacy.stats.wins).toBe(1);
    const both = computeRating({ submissions: [winner], awards: [award({ contestId: 7, place: 1 })] });
    expect(both.stats.wins).toBe(1);
  });

  it("доля успеха не превышает 100%", () => {
    const r = computeRating({
      submissions: [sub()],
      awards: [award({ contestId: 1 }), award({ contestId: 2, place: 2 })],
    });
    expect(r.stats.successRate).toBe(1);
  });

  it("средние оценка и ИИ считаются только по решениям, где они есть", () => {
    const r = computeRating({
      submissions: [
        sub({ avgReview: 8, aiScore: 90 }),
        sub({ avgReview: 6, aiScore: null }),
        sub({ avgReview: null, aiScore: 70 }),
      ],
      awards: [],
    });
    expect(r.stats.avgReview).toBe(7);
    expect(r.stats.avgAi).toBe(80);
  });
});

describe("уровни", () => {
  it("границы уровней", () => {
    expect(levelFor(0)).toBe("Новичок");
    expect(levelFor(1.9)).toBe("Новичок");
    expect(levelFor(2)).toBe("Специалист");
    expect(levelFor(2.7)).toBe("Специалист");
    expect(levelFor(2.8)).toBe("Профи");
    expect(levelFor(3.2)).toBe("Профи");
    expect(levelFor(3.3)).toBe("Эксперт");
    expect(levelFor(3.9)).toBe("Эксперт");
    expect(levelFor(4)).toBe("Мастер");
    expect(levelFor(5)).toBe("Мастер");
  });

  it("NaN и отрицательные значения дают «Новичок»", () => {
    expect(levelFor(NaN)).toBe("Новичок");
    expect(levelFor(-3)).toBe("Новичок");
  });

  it("nextLevel подсказывает следующий порог и пуст для максимума", () => {
    expect(nextLevel(2.4)).toEqual({ label: "Профи", min: 2.8 });
    expect(nextLevel(0)).toEqual({ label: "Специалист", min: 2 });
    expect(nextLevel(4.8)).toBeNull();
  });

  it("уровень в результате соответствует округлённому рейтингу", () => {
    const r = computeRating({
      submissions: Array.from({ length: 12 }, (_, i) => sub({ avgReview: 9.8, aiScore: 97, contestId: 500 + i, status: 3 })),
      awards: Array.from({ length: 12 }, (_, i) => award({ contestId: 500 + i })),
    });
    expect(r.level).toBe(levelFor(r.score));
    expect(r.level).toBe("Мастер");
  });
});

describe("бейджи", () => {
  const ids = (r: ReturnType<typeof computeRating>) => r.badges.map((b) => b.id);

  it("«Первая победа» при одной победе, «3+ победы» только с трёх", () => {
    const one = computeRating({ submissions: [sub()], awards: [award({ contestId: 1 })] });
    expect(ids(one)).toContain("first-win");
    expect(ids(one)).not.toContain("wins-3");
    const three = computeRating({
      submissions: [sub(), sub(), sub()],
      awards: [1, 2, 3].map((c) => award({ contestId: c })),
    });
    expect(ids(three)).toEqual(expect.arrayContaining(["first-win", "wins-3"]));
  });

  it("второе место не даёт бейдж победы", () => {
    const r = computeRating({ submissions: [sub()], awards: [award({ place: 2 })] });
    expect(ids(r)).not.toContain("first-win");
  });

  it("«Высокие оценки»: средняя не ниже 4.5 из 5 (9 из 10) и минимум 3 отзыва", () => {
    const mk = (n: number, v: number) =>
      computeRating({ submissions: Array.from({ length: n }, () => sub({ avgReview: v })), awards: [] });
    expect(ids(mk(3, 9))).toContain("high-scores");
    expect(ids(mk(3, 8.9))).not.toContain("high-scores");
    expect(ids(mk(2, 10))).not.toContain("high-scores");
  });

  it("«Активный участник» с 10 решений, с 9 нет", () => {
    expect(ids(computeRating({ submissions: Array.from({ length: 10 }, () => sub()), awards: [] }))).toContain("active");
    expect(ids(computeRating({ submissions: Array.from({ length: 9 }, () => sub()), awards: [] }))).not.toContain("active");
  });
});

describe("заказчик", () => {
  it("считает конкурсы, фонд и долю завершённых с победителем; черновики не учитываются", () => {
    const s = computeCustomerStats([
      { status: "active", prizepool: 100000, hasWinner: false },
      { status: "finished", prizepool: 50000, hasWinner: true },
      { status: "finished", prizepool: 30000, hasWinner: true },
      { status: "finished", prizepool: 20000, hasWinner: false },
      { status: "cancelled", prizepool: 999999, hasWinner: false },
      { status: "draft", prizepool: 777777, hasWinner: false },
    ]);
    expect(s.total).toBe(5);
    expect(s.active).toBe(1);
    expect(s.finished).toBe(3);
    expect(s.totalPrizeFund).toBe(200000);
    expect(s.winnerShare).toBeCloseTo(2 / 3);
    expect(s.reliable).toBe(false);
  });

  it("«Надёжный заказчик» от 80% завершённых с победителем; без завершённых — нет", () => {
    const done = (win: boolean) => ({ status: "finished", prizepool: 1, hasWinner: win });
    expect(computeCustomerStats([done(true), done(true), done(true), done(true), done(false)]).reliable).toBe(true);
    expect(computeCustomerStats([done(true), done(false)]).reliable).toBe(false);
    const none = computeCustomerStats([{ status: "active", prizepool: 5, hasWinner: false }]);
    expect(none.winnerShare).toBeNull();
    expect(none.reliable).toBe(false);
    expect(computeCustomerStats([]).total).toBe(0);
  });
});

describe("период", () => {
  it("«всё время» не имеет границы, 30 дней отсекает старше 30 суток", () => {
    expect(periodCutoff("all", NOW)).toBeNull();
    expect(periodCutoff("30d", NOW)).toBe(NOW - 30 * DAY);
  });

  it("filterByPeriod исключает старые элементы и элементы с битой датой", () => {
    const items = [{ d: iso(5) }, { d: iso(31) }, { d: "not-a-date" }];
    expect(filterByPeriod(items, (i) => i.d, periodCutoff("30d", NOW))).toEqual([items[0]]);
    expect(filterByPeriod(items, (i) => i.d, null)).toHaveLength(3);
  });
});

const user = (id: number, login: string, createdDaysAgo = 100) => ({ id, login, created_at: iso(createdDaysAgo) });

describe("таблица лидеров", () => {
  it("сортирует по рейтингу по убыванию", () => {
    const users = { 1: user(1, "a"), 2: user(2, "b"), 3: user(3, "c") };
    const board = buildLeaderboard({
      users,
      cutoff: null,
      submissions: [
        ...[1, 2, 3].map((n) => ({ ...sub({ avgReview: 3 }), executorId: 1 })),
        ...[1, 2, 3].map(() => ({ ...sub({ avgReview: 9 }), executorId: 2 })),
        ...[1, 2, 3].map(() => ({ ...sub({ avgReview: 6 }), executorId: 3 })),
      ],
      awards: [],
    });
    expect(board.map((e) => e.login)).toEqual(["b", "c", "a"]);
  });

  it("при равном рейтинге выше тот, у кого больше побед", () => {
    const mk = (id: number, wins: number, registeredDaysAgo: number): LeaderboardEntry => ({
      userId: id,
      login: `u${id}`,
      registeredAt: iso(registeredDaysAgo),
      rating: {
        score: 3.5,
        level: "Профи",
        badges: [],
        stats: { submissions: 5, wins, prizePlaces: wins, avgReview: null, reviewsCount: 0, avgAi: null, successRate: 0, totalPrize: 0 },
      },
    });
    const ranked = rankEntries([mk(1, 1, 500), mk(2, 4, 10), mk(3, 2, 300)]);
    expect(ranked.map((e) => e.userId)).toEqual([2, 3, 1]);
  });

  it("при равных рейтинге и победах выше тот, кто зарегистрировался раньше", () => {
    const mk = (id: number, registeredDaysAgo: number): LeaderboardEntry => ({
      userId: id,
      login: `u${id}`,
      registeredAt: iso(registeredDaysAgo),
      rating: {
        score: 3.5,
        level: "Профи",
        badges: [],
        stats: { submissions: 5, wins: 2, prizePlaces: 2, avgReview: null, reviewsCount: 0, avgAi: null, successRate: 0, totalPrize: 0 },
      },
    });
    expect(rankEntries([mk(1, 10), mk(2, 400), mk(3, 90)]).map((e) => e.userId)).toEqual([2, 3, 1]);
  });

  it("период 30 дней исключает старые награды и решения; всё время их учитывает", () => {
    const users = { 1: user(1, "old_champ"), 2: user(2, "fresh") };
    const input = {
      users,
      submissions: [
        { ...sub({ createdAt: iso(90), avgReview: 9 }), executorId: 1 },
        { ...sub({ createdAt: iso(3), avgReview: 7 }), executorId: 2 },
      ],
      awards: [{ ...award({ contestId: 90, awardedAt: iso(80), amount: 50000 }), executorId: 1 }],
    };
    const all = buildLeaderboard({ ...input, cutoff: periodCutoff("all", NOW) });
    expect(all.map((e) => e.login)).toEqual(["old_champ", "fresh"]);
    expect(all[0].rating.stats.wins).toBe(1);

    const recent = buildLeaderboard({ ...input, cutoff: periodCutoff("30d", NOW) });
    expect(recent.map((e) => e.login)).toEqual(["fresh"]);
  });

  it("награда из периода учитывается, даже если решение было отправлено раньше", () => {
    const board = buildLeaderboard({
      users: { 1: user(1, "late_win") },
      cutoff: periodCutoff("30d", NOW),
      submissions: [{ ...sub({ createdAt: iso(60) }), executorId: 1 }],
      awards: [{ ...award({ awardedAt: iso(5), amount: 777 }), executorId: 1 }],
    });
    expect(board).toHaveLength(1);
    expect(board[0].rating.stats.wins).toBe(1);
    expect(board[0].rating.stats.totalPrize).toBe(777);
  });

  it("пропускает исполнителей, чьи профили не удалось загрузить, и не падает на пустых данных", () => {
    expect(
      buildLeaderboard({
        users: {},
        cutoff: null,
        submissions: [{ ...sub(), executorId: 42 }],
        awards: [],
      }),
    ).toEqual([]);
    expect(buildLeaderboard({ users: {}, cutoff: null, submissions: [], awards: [] })).toEqual([]);
  });
});
