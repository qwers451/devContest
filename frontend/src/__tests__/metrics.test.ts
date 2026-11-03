import { describe, it, expect } from "vitest";
import { computeMetrics, fmtDays, fmtInt, fmtMoney, fmtNumber1, fmtPercent, type MetricsInput } from "../utils/metrics";
import type { Contest } from "../types";

const DAY = 86400000;
const NOW = new Date("2026-06-30T12:00:00Z").getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

let seq = 0;
const contest = (over: Partial<Contest> = {}): Contest => ({
  id: ++seq,
  number: seq,
  title: "c",
  prizepool: 1000,
  ends_at: iso(-10),
  status: "active",
  customer_id: 1,
  stages: [],
  created_at: iso(20),
  updated_at: iso(20),
  ...over,
});
const finished = (createdAgo: number, selectedAgo: number, over: Partial<Contest> = {}) =>
  contest({
    status: "finished",
    created_at: iso(createdAgo),
    ends_at: iso(selectedAgo),
    winner: { submission_id: 1, executor_id: 2, selected_at: iso(selectedAgo) },
    ...over,
  });
const sub = (contestId: number, status = 1) => ({ id: ++seq, contest_id: contestId, status });
const run = (over: Partial<MetricsInput>) =>
  computeMetrics({ users: [], contests: [], submissions: [], period: "all", now: NOW, ...over });

describe("среднее время до завершения", () => {
  it("считается только по завершённым с победителем, в днях с одним знаком", () => {
    const a = finished(30, 20); // 10 дней
    const b = finished(25, 20); // 5 дней
    const m = run({ contests: [a, b] });
    expect(m.avgCompletionDays).toBe(7.5);
  });

  it("игнорирует активные, отменённые, просроченные и завершённые без победителя", () => {
    const ok = finished(10, 4); // 6 дней
    const active = contest({ created_at: iso(50) });
    const cancelled = contest({ status: "cancelled", created_at: iso(50), updated_at: iso(1) });
    const expired = contest({ created_at: iso(50), ends_at: iso(5) });
    const finishedNoWinner = contest({ status: "finished", created_at: iso(50), ends_at: iso(1), updated_at: iso(1) });
    const m = run({ contests: [ok, active, cancelled, expired, finishedNoWinner] });
    expect(m.avgCompletionDays).toBe(6);
  });

  it("старый конкурс без winner и наград: победитель по решению со статусом 3, время по updated_at решения", () => {
    const c = contest({ status: "finished", created_at: iso(20), ends_at: iso(2) });
    const m = run({ contests: [c], submissions: [{ id: 99, contest_id: c.id, status: 3, updated_at: iso(15) } as never] });
    expect(m.avgCompletionDays).toBe(5);
  });

  it("берёт время награды 1 места, если нет winner", () => {
    const c = contest({
      status: "finished",
      created_at: iso(20),
      ends_at: iso(1),
      awards: [{ place: 1, submission_id: 1, executor_id: 2, amount: 1000, created_at: iso(12) }],
    });
    expect(run({ contests: [c] }).avgCompletionDays).toBe(8);
  });

  it("без завершённых конкурсов — null и «—»", () => {
    const m = run({ contests: [contest()] });
    expect(m.avgCompletionDays).toBeNull();
    expect(fmtDays(m.avgCompletionDays)).toBe("—");
  });
});

describe("доля успешно завершённых", () => {
  it("просроченный без победителя считается неудачей, идущие активные не учитываются", () => {
    const ok1 = finished(30, 10);
    const ok2 = finished(30, 11);
    const cancelled = contest({ status: "cancelled", updated_at: iso(5) });
    const expired = contest({ ends_at: iso(3) });
    const running = contest({ ends_at: iso(-5) });
    const m = run({ contests: [ok1, ok2, cancelled, expired, running] });
    expect(m.successCount).toBe(2);
    expect(m.failedCount).toBe(2);
    expect(m.successRate).toBe(50);
  });

  it("завершённый без победителя — неудача, черновик не учитывается", () => {
    const ok = finished(30, 10);
    const noWinner = contest({ status: "finished", ends_at: iso(4), updated_at: iso(4) });
    const draft = contest({ status: "draft", ends_at: iso(4) });
    const m = run({ contests: [ok, noWinner, draft] });
    expect(m.successRate).toBe(50);
  });

  it("если закрытых конкурсов нет — null, не NaN", () => {
    const m = run({ contests: [contest()] });
    expect(m.successRate).toBeNull();
    expect(fmtPercent(m.successRate)).toBe("—");
  });
});

describe("заявки и призовой фонд", () => {
  it("черновики исключены из среднего числа заявок и среднего фонда", () => {
    const a = contest({ prizepool: 1000 });
    const b = contest({ prizepool: 3000 });
    const draft = contest({ status: "draft", prizepool: 100000 });
    const subs = [sub(a.id), sub(a.id), sub(a.id), sub(b.id), sub(draft.id), sub(draft.id), sub(draft.id)];
    const m = run({ contests: [a, b, draft], submissions: subs });
    expect(m.avgSubmissionsPerContest).toBe(2); // (3 + 1) / 2
    expect(m.avgPrizePool).toBe(2000);
    expect(m.distribution.find((d) => d.label === "1")!.count).toBe(1);
    expect(m.distribution.find((d) => d.label === "3–4")!.count).toBe(1);
    expect(m.distribution.reduce((s, d) => s + d.count, 0)).toBe(2);
  });

  it("конкурс без заявок попадает в корзину «0» и снижает среднее", () => {
    const a = contest();
    const b = contest();
    const m = run({ contests: [a, b], submissions: [sub(a.id), sub(a.id)] });
    expect(m.avgSubmissionsPerContest).toBe(1);
    expect(m.distribution.find((d) => d.label === "0")!.count).toBe(1);
  });
});

describe("деньги", () => {
  it("выплачено = сумма призов завершённых; комиссия берётся из платёжного сервиса, иначе из наград", () => {
    const c = finished(30, 10, {
      awards: [
        { place: 1, submission_id: 1, executor_id: 2, amount: 1000, net_amount: 900 },
        { place: 2, submission_id: 2, executor_id: 3, amount: 500, net_amount: 450 },
      ],
    });
    const active = contest({ prizepool: 7777 });
    const fromAwards = run({ contests: [c, active] });
    expect(fromAwards.prizePaidOut).toBe(1500);
    expect(fromAwards.commissionTotal).toBe(150);
    expect(run({ contests: [c], commissionTotal: 321 }).commissionTotal).toBe(321);
  });

  it("конкурс без строк наград, но с победителем, считается по призовому фонду", () => {
    expect(run({ contests: [finished(30, 10, { prizepool: 4000 })] }).prizePaidOut).toBe(4000);
  });

  it("нет завершённых — null", () => {
    const m = run({ contests: [contest()] });
    expect(m.prizePaidOut).toBeNull();
    expect(m.commissionTotal).toBeNull();
    expect(fmtMoney(m.prizePaidOut)).toBe("—");
  });
});

describe("пользователи и активные конкурсы", () => {
  const users = [
    { id: 1, role: "customer" as const, created_at: iso(100) },
    { id: 2, role: "executor" as const, created_at: iso(40) },
    { id: 3, role: "executor" as const, created_at: iso(10) },
    { id: 4, role: "admin" as const, created_at: iso(200) },
  ];

  it("разбивка по ролям и новые за 30 дней", () => {
    const m = run({ users });
    expect(m.usersTotal).toBe(4);
    expect(m.customers).toBe(1);
    expect(m.executors).toBe(2);
    expect(m.newUsers30d).toBe(1);
  });

  it("активные: идущие считаются, просроченные и черновики нет", () => {
    const m = run({
      contests: [contest(), contest(), contest({ ends_at: iso(1) }), contest({ status: "draft" })],
    });
    expect(m.activeContests).toBe(2);
  });
});

describe("период", () => {
  it("30 дней оставляет только недавно завершённые и созданные", () => {
    const recent = finished(12, 5); // 7 дней, завершён 5 дней назад
    const old = finished(100, 60); // 40 дней, завершён 60 дней назад
    expect(run({ contests: [recent, old], period: "30d" }).avgCompletionDays).toBe(7);
    expect(run({ contests: [recent, old], period: "90d" }).avgCompletionDays).toBe(23.5);
    expect(run({ contests: [recent, old], period: "all" }).avgCompletionDays).toBe(23.5);
  });

  it("период влияет на долю успеха, число заявок, фонд, выплаты и новых пользователей", () => {
    const recent = finished(12, 5, { prizepool: 1000 });
    const old = contest({ status: "cancelled", created_at: iso(200), updated_at: iso(150), prizepool: 5000 });
    const users = [
      { id: 1, role: "executor" as const, created_at: iso(3) },
      { id: 2, role: "executor" as const, created_at: iso(80) },
    ];
    const month = run({ contests: [recent, old], users, period: "30d" });
    expect(month.successRate).toBe(100);
    expect(month.avgPrizePool).toBe(1000);
    expect(month.newUsersPeriod).toBe(1);
    const all = run({ contests: [recent, old], users, period: "all" });
    expect(all.successRate).toBe(50);
    expect(all.avgPrizePool).toBe(3000);
    expect(all.newUsersPeriod).toBe(2);
  });

  it("срез «активные» и итоги по пользователям не зависят от периода", () => {
    const users = [{ id: 1, role: "customer" as const, created_at: iso(300) }];
    const c = contest({ created_at: iso(300) });
    const m = run({ contests: [c], users, period: "30d" });
    expect(m.activeContests).toBe(1);
    expect(m.usersTotal).toBe(1);
  });
});

describe("график по месяцам", () => {
  it("раскладывает созданные и завершённые по месяцам, число столбцов зависит от периода", () => {
    const c = finished(45, 10); // создан в мае, завершён в июне
    const m = run({ contests: [c], period: "all" });
    expect(m.months).toHaveLength(12);
    expect(m.months[m.months.length - 1].key).toBe("2026-06");
    const may = m.months.find((x) => x.key === "2026-05")!;
    const june = m.months.find((x) => x.key === "2026-06")!;
    expect(may.created).toBe(1);
    expect(june.finished).toBe(1);
    expect(run({ contests: [c], period: "30d" }).months).toHaveLength(3);
  });

  it("черновики в график не попадают", () => {
    const m = run({ contests: [contest({ status: "draft" })] });
    expect(m.months.every((x) => x.created === 0)).toBe(true);
  });
});

describe("пустые данные", () => {
  it("все значения null (кроме счётчиков), форматтеры дают «—», NaN нигде нет", () => {
    const m = run({});
    expect(m.usersTotal).toBeNull();
    expect(m.customers).toBeNull();
    expect(m.newUsers30d).toBeNull();
    expect(m.activeContests).toBeNull();
    expect(m.avgCompletionDays).toBeNull();
    expect(m.avgSubmissionsPerContest).toBeNull();
    expect(m.avgPrizePool).toBeNull();
    expect(m.successRate).toBeNull();
    expect(m.commissionTotal).toBeNull();
    expect(m.prizePaidOut).toBeNull();
    expect(m.distribution.every((d) => d.count === 0)).toBe(true);
    const rendered = [
      fmtInt(m.usersTotal),
      fmtDays(m.avgCompletionDays),
      fmtNumber1(m.avgSubmissionsPerContest),
      fmtMoney(m.avgPrizePool),
      fmtPercent(m.successRate),
    ];
    expect(rendered).toEqual(["—", "—", "—", "—", "—"]);
    expect(JSON.stringify(m)).not.toContain("NaN");
  });

  it("битые даты и суммы не ломают расчёт", () => {
    const bad = contest({ status: "finished", created_at: "oops", ends_at: "oops", prizepool: NaN as never });
    const m = run({ contests: [bad, finished(10, 4)] });
    expect(m.avgCompletionDays).toBe(6);
    expect(Number.isNaN(m.avgPrizePool as number)).toBe(false);
  });
});

describe("форматирование", () => {
  it("значения с единицами", () => {
    expect(fmtDays(7.5)).toMatch(/^7[.,]5 дн\.$/);
    expect(fmtPercent(66.7)).toMatch(/^66[.,]7%$/);
    expect(fmtMoney(1234567)).toContain("₽");
  });
});
