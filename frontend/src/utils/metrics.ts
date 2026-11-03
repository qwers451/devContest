/**
 * Ключевые метрики платформы для админ-панели — чистые функции без обращений к сети.
 *
 * Определения:
 *  - «Завершён с победителем» = у конкурса есть winner, либо награда 1 места, либо решение
 *    со статусом 3 «Победитель» (старые данные без winner/awards).
 *  - «Просрочен без победителя» = конкурс активен, но срок (ends_at) уже прошёл.
 *  - Время завершения конкурса: winner.selected_at → created_at награды 1 места →
 *    updated_at решения-победителя → ends_at (но не из будущего). Берётся первое доступное.
 *  - Периоды (30 / 90 дней / всё время) применяются к «потоковым» метрикам:
 *    пользователи (новые), конкурсы по дате создания, завершения по дате завершения,
 *    доля успеха по дате закрытия конкурса. «Активные конкурсы» и итоги по пользователям
 *    (всего / заказчики / исполнители) — срез на текущий момент, период на них не влияет.
 *  - Если данных для метрики нет, значение равно null (в интерфейсе показывается «—»).
 */
import type { Contest, Submission, User } from "../types";

export type MetricsPeriod = "30d" | "90d" | "all";

export const METRICS_PERIODS: { key: MetricsPeriod; label: string }[] = [
  { key: "30d", label: "30 дней" },
  { key: "90d", label: "90 дней" },
  { key: "all", label: "Всё время" },
];

const DAY = 86400000;
const WINNER_STATUS = 3;
const MAX_MONTHS = 12;
const MIN_MONTHS = 3;

export const periodStart = (period: MetricsPeriod, now: number): number | null =>
  period === "30d" ? now - 30 * DAY : period === "90d" ? now - 90 * DAY : null;

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

const inPeriod = (t: number | null, start: number | null, now: number): boolean =>
  t !== null && t <= now && (start === null || t >= start);

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

type SubLite = Pick<Submission, "id" | "contest_id" | "status"> & Partial<Pick<Submission, "updated_at">>;

export interface MetricsInput {
  users: Pick<User, "id" | "role" | "created_at">[];
  contests: Contest[];
  submissions: SubLite[];
  /** Сумма комиссии платформы из платёжного сервиса; если null — считается по наградам. */
  commissionTotal?: number | null;
  period: MetricsPeriod;
  now?: number;
}

export interface MonthBucket {
  /** YYYY-MM */
  key: string;
  label: string;
  created: number;
  finished: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface PlatformMetrics {
  activeContests: number | null;
  usersTotal: number | null;
  customers: number | null;
  executors: number | null;
  /** Зарегистрировались за выбранный период. */
  newUsersPeriod: number | null;
  /** Зарегистрировались за последние 30 дней (не зависит от периода). */
  newUsers30d: number | null;
  /** Среднее время от публикации до завершения, дни, один знак. */
  avgCompletionDays: number | null;
  avgSubmissionsPerContest: number | null;
  avgPrizePool: number | null;
  /** Доля успешно завершённых конкурсов, 0..100 (один знак). */
  successRate: number | null;
  successCount: number;
  failedCount: number;
  commissionTotal: number | null;
  prizePaidOut: number | null;
  months: MonthBucket[];
  distribution: DistributionBucket[];
}

const MONTH_NAMES = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const monthKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

interface ContestFacts {
  contest: Contest;
  hasWinner: boolean;
  /** Время завершения с победителем либо null. */
  completedAt: number | null;
  expired: boolean;
  /** Когда конкурс «закрылся» (для отнесения к периоду). */
  closedAt: number | null;
}

function factsFor(contest: Contest, subs: SubLite[], now: number): ContestFacts {
  const awards = contest.awards ?? [];
  const firstAward = awards.find((a) => a.place === 1);
  const winnerSub = subs.find((s) => s.status === WINNER_STATUS);
  const hasWinner = Boolean(contest.winner) || Boolean(firstAward) || Boolean(winnerSub);
  const ends = time(contest.ends_at);
  const created = time(contest.created_at);
  const expired = contest.status === "active" && ends !== null && ends < now;

  let completedAt: number | null = null;
  if (contest.status === "finished" && hasWinner) {
    completedAt =
      time(contest.winner?.selected_at) ??
      time((firstAward as { created_at?: string } | undefined)?.created_at) ??
      time(winnerSub?.updated_at) ??
      (ends !== null ? Math.min(ends, now) : null);
  }
  // Время не может быть раньше публикации: такие записи (битые даты) в среднее не попадают.
  if (completedAt !== null && created !== null && completedAt < created) completedAt = null;

  let closedAt: number | null = null;
  if (completedAt !== null) closedAt = completedAt;
  else if (contest.status === "finished" || contest.status === "cancelled")
    closedAt = time(contest.updated_at) ?? (ends !== null ? Math.min(ends, now) : null);
  else if (expired) closedAt = ends;

  return { contest, hasWinner, completedAt, expired, closedAt };
}

/** Размер диапазона столбцов помесячного графика. */
export function monthsFor(period: MetricsPeriod): number {
  return period === "30d" ? MIN_MONTHS : period === "90d" ? 4 : MAX_MONTHS;
}

export function emptyMetrics(): PlatformMetrics {
  return computeMetrics({ users: [], contests: [], submissions: [], period: "all" });
}

export function computeMetrics(input: MetricsInput): PlatformMetrics {
  const now = input.now ?? Date.now();
  const start = periodStart(input.period, now);
  const subsByContest = new Map<number, SubLite[]>();
  (input.submissions ?? []).forEach((s) => {
    const list = subsByContest.get(s.contest_id) ?? [];
    list.push(s);
    subsByContest.set(s.contest_id, list);
  });

  // Черновики не публикуются и в метрики не входят.
  const contests = (input.contests ?? []).filter((c) => c.status !== "draft");
  const facts = contests.map((c) => factsFor(c, subsByContest.get(c.id) ?? [], now));

  const users = input.users ?? [];
  const hasUsers = users.length > 0;
  const customers = users.filter((u) => u.role === "customer").length;
  const executors = users.filter((u) => u.role === "executor").length;

  const activeContests = contests.filter((c) => {
    const ends = time(c.ends_at);
    return c.status === "active" && (ends === null || ends >= now);
  }).length;

  // Среднее время до завершения: только завершённые с победителем, завершённые в периоде.
  const completionDays = facts
    .filter((f) => f.completedAt !== null && inPeriod(f.completedAt, start, now))
    .map((f) => (f.completedAt! - time(f.contest.created_at)!) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);

  // Конкурсы, созданные в периоде (черновики исключены).
  const created = facts.filter((f) => inPeriod(time(f.contest.created_at), start, now));
  const subsCounts = created.map((f) => (subsByContest.get(f.contest.id) ?? []).length);
  const prizePools = created.map((f) => finite(f.contest.prizepool)).filter((v): v is number => v !== null);

  // Доля успеха: успех / (завершён + отменён + просрочен), активные идущие не считаются.
  const closed = facts.filter((f) => f.closedAt !== null && inPeriod(f.closedAt, start, now));
  const success = closed.filter((f) => f.contest.status === "finished" && f.hasWinner);
  const failed = closed.length - success.length;
  const successRate = closed.length > 0 ? round1((success.length / closed.length) * 100) : null;

  // Деньги по победителям, завершённым в периоде.
  const paidFacts = facts.filter((f) => f.completedAt !== null && inPeriod(f.completedAt, start, now));
  let paid = 0;
  let commissionFromAwards = 0;
  paidFacts.forEach((f) => {
    const awards = f.contest.awards ?? [];
    if (awards.length > 0) {
      awards.forEach((a) => {
        const amount = finite(a.amount) ?? 0;
        paid += amount;
        const net = finite(a.net_amount);
        if (net !== null) commissionFromAwards += amount - net;
      });
    } else {
      paid += finite(f.contest.prizepool) ?? 0;
    }
  });
  const commission =
    finite(input.commissionTotal) !== null
      ? finite(input.commissionTotal)
      : paidFacts.length > 0
        ? Math.round(commissionFromAwards * 100) / 100
        : null;

  // График по месяцам.
  const nMonths = monthsFor(input.period);
  const nowDate = new Date(now);
  const months: MonthBucket[] = [];
  for (let i = nMonths - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    months.push({
      key: monthKey(d.getTime()),
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      created: 0,
      finished: 0,
    });
  }
  const bucket = new Map(months.map((m) => [m.key, m]));
  facts.forEach((f) => {
    const c = time(f.contest.created_at);
    if (c !== null) {
      const b = bucket.get(monthKey(c));
      if (b) b.created += 1;
    }
    if (f.completedAt !== null) {
      const b = bucket.get(monthKey(f.completedAt));
      if (b) b.finished += 1;
    }
  });

  // Распределение решений по конкурсам (созданным в периоде).
  const ranges: { label: string; test: (n: number) => boolean }[] = [
    { label: "0", test: (n) => n === 0 },
    { label: "1", test: (n) => n === 1 },
    { label: "2", test: (n) => n === 2 },
    { label: "3–4", test: (n) => n >= 3 && n <= 4 },
    { label: "5–9", test: (n) => n >= 5 && n <= 9 },
    { label: "10+", test: (n) => n >= 10 },
  ];
  const distribution = ranges.map((r) => ({ label: r.label, count: subsCounts.filter(r.test).length }));

  const newIn = (from: number | null) =>
    users.filter((u) => inPeriod(time(u.created_at), from, now)).length;

  return {
    activeContests: contests.length > 0 || hasUsers ? activeContests : null,
    usersTotal: hasUsers ? users.length : null,
    customers: hasUsers ? customers : null,
    executors: hasUsers ? executors : null,
    newUsersPeriod: hasUsers ? newIn(start) : null,
    newUsers30d: hasUsers ? newIn(now - 30 * DAY) : null,
    avgCompletionDays: round1(mean(completionDays)),
    avgSubmissionsPerContest: round1(mean(subsCounts)),
    avgPrizePool: (() => {
      const m = mean(prizePools);
      return m === null ? null : Math.round(m);
    })(),
    successRate,
    successCount: success.length,
    failedCount: failed,
    commissionTotal: commission,
    prizePaidOut: paidFacts.length > 0 ? Math.round(paid * 100) / 100 : null,
    months,
    distribution,
  };
}

// ── Форматирование: null всегда превращается в «—» ───────────────────────────

export const DASH = "—";

export const fmtInt = (v: number | null): string => (v === null ? DASH : Math.round(v).toLocaleString("ru-RU"));
export const fmtMoney = (v: number | null): string =>
  v === null ? DASH : `${Math.round(v).toLocaleString("ru-RU")} ₽`;
export const fmtDays = (v: number | null): string =>
  v === null ? DASH : `${v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} дн.`;
export const fmtPercent = (v: number | null): string =>
  v === null ? DASH : `${v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const fmtNumber1 = (v: number | null): string =>
  v === null ? DASH : v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
