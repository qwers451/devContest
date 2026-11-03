/**
 * Рейтинг исполнителя — чистые функции без обращений к сети.
 *
 * Формула (показывается пользователям в блоке «Как считается рейтинг»):
 *
 *   рейтинг = 5 × (0.40 · К + 0.20 · И + 0.40 · П)
 *
 *   К — качество отзывов, 0..1. Оценки отзывов (шкала 0–10) переводятся в 0..1 и
 *       сглаживаются по Байесу: (5·0.6 + сумма) / (5 + n). Пять «виртуальных»
 *       отзывов со средним 6/10 не дают одному отзыву 10/10 обогнать
 *       двадцать отзывов по 9.6/10.
 *   И — соответствие ТЗ по оценке ИИ, 0..1, сглаживание по тому же принципу
 *       с весом 3: (3·0.6 + сумма) / (3 + n).
 *   П — достижения, 0..1: очки = 3 за победу + 1 за каждое другое призовое
 *       место, П = очки / (очки + 4). Чем больше побед, тем ближе к 1.
 *
 * Если у исполнителя нет ни одного решения, рейтинг равен 0 и уровень «Новичок».
 * Рейтинг округляется до одного знака. Уровни по округлённому рейтингу:
 *   < 2.0 Новичок, < 2.8 Специалист, < 3.3 Профи, < 4.0 Эксперт, иначе Мастер.
 */
import type { User } from "../types";

export const REVIEW_PRIOR = 0.6;
export const REVIEW_PRIOR_WEIGHT = 5;
export const AI_PRIOR = 0.6;
export const AI_PRIOR_WEIGHT = 3;
export const WIN_POINTS = 3;
export const PLACE_POINTS = 1;
export const ACHIEVEMENT_HALF = 4;
export const WEIGHTS = { reviews: 0.4, ai: 0.2, achievements: 0.4 } as const;

export const DEFAULT_COMMISSION = 10;

/** Сумма на руки после комиссии в процентах (копейки округляются). */
export function netOf(gross: number, commissionPercent: number): number {
  const pct = Number.isFinite(commissionPercent) ? Math.min(100, Math.max(0, commissionPercent)) : DEFAULT_COMMISSION;
  return Math.round(gross * (100 - pct)) / 100;
}

export const MIN_REVIEWS_FOR_BADGE = 3;
export const HIGH_REVIEW_AVG = 4.5; // по шкале 0..5 (то есть 9.0 из 10)
export const ACTIVE_SUBMISSIONS = 10;

export const LEVELS = [
  { label: "Новичок", min: 0 },
  { label: "Специалист", min: 2 },
  { label: "Профи", min: 2.8 },
  { label: "Эксперт", min: 3.3 },
  { label: "Мастер", min: 4 },
] as const;

export type LevelLabel = (typeof LEVELS)[number]["label"];

export interface RatingSubmission {
  id: number;
  contestId: number;
  /** 3 — «Победитель». */
  status: number;
  /** 0..100 */
  aiScore: number | null;
  /** Средняя оценка отзывов по решению, шкала 0–10. */
  avgReview: number | null;
  createdAt: string;
}

export interface RatingAward {
  place: number;
  contestId: number;
  submissionId: number;
  /** Сумма до комиссии платформы. */
  amount: number;
  /** Сумма на руки; если неизвестна, считается по комиссии по умолчанию. */
  netAmount?: number | null;
  awardedAt: string;
}

export interface RatingInput {
  submissions: RatingSubmission[];
  /** Оценки отзывов (0–10). Если не переданы, берутся из avgReview решений. */
  reviews?: number[];
  awards: RatingAward[];
}

export interface RatingStats {
  submissions: number;
  wins: number;
  prizePlaces: number;
  /** Средняя оценка отзывов, шкала 0–10, либо null. */
  avgReview: number | null;
  reviewsCount: number;
  avgAi: number | null;
  /** Доля решений, получивших призовое место, 0..1. */
  successRate: number;
  totalPrize: number;
  /** Сумма призов на руки (после комиссии платформы). */
  totalNet: number;
}

export interface Badge {
  id: string;
  label: string;
  hint: string;
}

export interface Rating {
  score: number;
  level: LevelLabel;
  stats: RatingStats;
  badges: Badge[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function levelFor(score: number): LevelLabel {
  const safe = Number.isFinite(score) ? score : 0;
  let result: LevelLabel = LEVELS[0].label;
  for (const lvl of LEVELS) if (safe >= lvl.min) result = lvl.label;
  return result;
}

/** Следующий уровень и сколько не хватает до него; null для максимального. */
export function nextLevel(score: number): { label: LevelLabel; min: number } | null {
  const safe = Number.isFinite(score) ? score : 0;
  const next = LEVELS.find((l) => l.min > safe);
  return next ? { label: next.label, min: next.min } : null;
}

export function bayes(sum: number, count: number, prior: number, weight: number): number {
  return (weight * prior + sum) / (weight + count);
}

const EMPTY_STATS: RatingStats = {
  submissions: 0,
  wins: 0,
  prizePlaces: 0,
  avgReview: null,
  reviewsCount: 0,
  avgAi: null,
  successRate: 0,
  totalPrize: 0,
  totalNet: 0,
};

export function computeRating(input: RatingInput): Rating {
  const subs = input.submissions ?? [];
  const awards = input.awards ?? [];

  const reviewScores = (
    input.reviews ?? subs.map((s) => s.avgReview)
  )
    .map(num)
    .filter((v): v is number => v !== null)
    .map((v) => clamp(v, 0, 10));
  const aiScores = subs
    .map((s) => num(s.aiScore))
    .filter((v): v is number => v !== null)
    .map((v) => clamp(v, 0, 100));

  // Победа = первое место либо решение со статусом «Победитель» (старые данные без наград).
  const winContests = new Set<number>();
  awards.forEach((a) => a.place === 1 && winContests.add(a.contestId));
  subs.forEach((s) => s.status === 3 && winContests.add(s.contestId));
  const wins = winContests.size;
  const otherPlaces = awards.filter((a) => a.place !== 1).length;
  const prizePlaces = Math.max(awards.length, wins);

  if (subs.length === 0 && awards.length === 0) {
    return { score: 0, level: LEVELS[0].label, stats: { ...EMPTY_STATS }, badges: [] };
  }

  const avgReview =
    reviewScores.length > 0
      ? reviewScores.reduce((a, b) => a + b, 0) / reviewScores.length
      : null;
  const avgAi =
    aiScores.length > 0 ? aiScores.reduce((a, b) => a + b, 0) / aiScores.length : null;

  const q = bayes(
    reviewScores.reduce((a, b) => a + b / 10, 0),
    reviewScores.length,
    REVIEW_PRIOR,
    REVIEW_PRIOR_WEIGHT,
  );
  const ai = bayes(
    aiScores.reduce((a, b) => a + b / 100, 0),
    aiScores.length,
    AI_PRIOR,
    AI_PRIOR_WEIGHT,
  );
  const points = wins * WIN_POINTS + otherPlaces * PLACE_POINTS;
  const achievements = points / (points + ACHIEVEMENT_HALF);

  const score = round1(
    clamp(
      5 * (WEIGHTS.reviews * q + WEIGHTS.ai * ai + WEIGHTS.achievements * achievements),
      0,
      5,
    ),
  );

  const stats: RatingStats = {
    submissions: subs.length,
    wins,
    prizePlaces,
    avgReview: avgReview === null ? null : round1(avgReview),
    reviewsCount: reviewScores.length,
    avgAi: avgAi === null ? null : Math.round(avgAi),
    successRate: subs.length > 0 ? clamp(prizePlaces / subs.length, 0, 1) : 0,
    totalPrize: awards.reduce((sum, a) => sum + (num(a.amount) ?? 0), 0),
    totalNet: awards.reduce(
      (sum, a) => sum + (num(a.netAmount) ?? netOf(num(a.amount) ?? 0, DEFAULT_COMMISSION)),
      0,
    ),
  };

  const badges: Badge[] = [];
  if (wins >= 1)
    badges.push({ id: "first-win", label: "Первая победа", hint: "Выиграл хотя бы один конкурс" });
  if (wins >= 3)
    badges.push({ id: "wins-3", label: "3+ победы", hint: "Выиграл три конкурса и больше" });
  if (avgReview !== null && reviewScores.length >= MIN_REVIEWS_FOR_BADGE && avgReview / 2 >= HIGH_REVIEW_AVG)
    badges.push({
      id: "high-scores",
      label: "Высокие оценки",
      hint: `Средняя оценка отзывов не ниже ${HIGH_REVIEW_AVG} из 5 (минимум ${MIN_REVIEWS_FOR_BADGE} отзыва)`,
    });
  if (subs.length >= ACTIVE_SUBMISSIONS)
    badges.push({
      id: "active",
      label: "Активный участник",
      hint: `Отправил ${ACTIVE_SUBMISSIONS} и более решений`,
    });

  return { score, level: levelFor(score), stats, badges };
}

// ── Заказчик ──────────────────────────────────────────────────────────────────

export interface CustomerContest {
  status: string;
  prizepool: number;
  hasWinner: boolean;
}

export interface CustomerStats {
  total: number;
  active: number;
  finished: number;
  totalPrizeFund: number;
  /** Доля завершённых конкурсов, где выбран победитель, 0..1; null, если завершённых нет. */
  winnerShare: number | null;
  reliable: boolean;
}

export const RELIABLE_SHARE = 0.8;

export function computeCustomerStats(contests: CustomerContest[]): CustomerStats {
  // Черновики не показываются публично и в статистику не входят.
  const list = (contests ?? []).filter((c) => c.status !== "draft");
  const finished = list.filter((c) => c.status === "finished");
  const withWinner = finished.filter((c) => c.hasWinner).length;
  const winnerShare = finished.length > 0 ? withWinner / finished.length : null;
  return {
    total: list.length,
    active: list.filter((c) => c.status === "active").length,
    finished: finished.length,
    totalPrizeFund: list
      .filter((c) => c.status !== "cancelled")
      .reduce((sum, c) => sum + (num(c.prizepool) ?? 0), 0),
    winnerShare,
    reliable: winnerShare !== null && winnerShare >= RELIABLE_SHARE,
  };
}

// ── Рейтинг-таблица ──────────────────────────────────────────────────────────

export type Period = "all" | "30d";
export const PERIOD_DAYS = 30;

/** Начало периода в мс либо null для «всё время». */
export function periodCutoff(period: Period, now: number = Date.now()): number | null {
  return period === "30d" ? now - PERIOD_DAYS * 86400000 : null;
}

export function filterByPeriod<T>(items: T[], getDate: (t: T) => string, cutoff: number | null): T[] {
  if (cutoff === null) return items;
  return items.filter((i) => {
    const t = new Date(getDate(i)).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export interface LeaderboardEntry {
  userId: number;
  login: string;
  registeredAt: string;
  rating: Rating;
}

/** Больший рейтинг выше; при равенстве — больше побед; затем раньше зарегистрирован. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.rating.score !== a.rating.score) return b.rating.score - a.rating.score;
  if (b.rating.stats.wins !== a.rating.stats.wins) return b.rating.stats.wins - a.rating.stats.wins;
  const ta = new Date(a.registeredAt).getTime();
  const tb = new Date(b.registeredAt).getTime();
  const sa = Number.isFinite(ta) ? ta : Infinity;
  const sb = Number.isFinite(tb) ? tb : Infinity;
  if (sa !== sb) return sa - sb;
  return a.userId - b.userId;
}

export function rankEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(compareEntries);
}

export interface BuildLeaderboardInput {
  users: Record<number, Pick<User, "id" | "login" | "created_at">>;
  submissions: (RatingSubmission & { executorId: number })[];
  awards: (RatingAward & { executorId: number })[];
  cutoff: number | null;
}

/** Собирает рейтинги всех исполнителей, у которых есть активность за период. */
export function buildLeaderboard(input: BuildLeaderboardInput): LeaderboardEntry[] {
  const subs = filterByPeriod(input.submissions, (s) => s.createdAt, input.cutoff);
  const awards = filterByPeriod(input.awards, (a) => a.awardedAt, input.cutoff);
  const ids = new Set<number>([...subs.map((s) => s.executorId), ...awards.map((a) => a.executorId)]);
  const entries: LeaderboardEntry[] = [];
  ids.forEach((id) => {
    const user = input.users[id];
    if (!user) return;
    entries.push({
      userId: id,
      login: user.login,
      registeredAt: user.created_at,
      rating: computeRating({
        submissions: subs.filter((s) => s.executorId === id),
        awards: awards.filter((a) => a.executorId === id),
      }),
    });
  });
  return rankEntries(entries);
}

export function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString("ru-RU")} ₽`;
}
