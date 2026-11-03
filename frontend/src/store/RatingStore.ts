import { makeAutoObservable, runInAction } from "mobx";
import { fetchData } from "../services/apiService";
import type { Contest, ContestAwardRow, ContestListResponse, Submission, User } from "../types";
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type Period,
  type RatingAward,
  type RatingSubmission,
  periodCutoff,
  netOf,
  DEFAULT_COMMISSION,
} from "../utils/rating";

const PAGE = 100;
const MAX_PAGES = 10;
const CACHE_MS = 60_000;

export type AwardWithExecutor = RatingAward & { executorId: number };
export type SubmissionWithExecutor = RatingSubmission & { executorId: number };

export function toRatingSubmission(s: Submission): SubmissionWithExecutor {
  return {
    id: s.id,
    contestId: s.contest_id,
    executorId: s.executor_id,
    status: s.status,
    aiScore: s.ai_score ?? null,
    avgReview: s.avg_score ?? null,
    createdAt: s.created_at,
  };
}

/** Дата награды: срок конкурса, но не из будущего (победителя могли выбрать раньше срока). */
export function awardDate(contest: Contest, now: number = Date.now()): string {
  const end = new Date(contest.ends_at).getTime();
  return new Date(Number.isFinite(end) ? Math.min(end, now) : now).toISOString();
}

/**
 * Награды из конкурсов. Конкурсы, завершённые через старый /winner, не имеют строк наград:
 * для них победа = призовой фонд целиком (место 1), на руки — за вычетом комиссии.
 * Дополнительно победа определяется по решениям со статусом «Победитель» (старые данные без winner).
 */
export function toAwards(
  contests: Contest[],
  now: number = Date.now(),
  commissionPercent: number = DEFAULT_COMMISSION,
  submissions: Pick<Submission, "id" | "contest_id" | "executor_id" | "status">[] = [],
): AwardWithExecutor[] {
  const out: AwardWithExecutor[] = [];
  contests.forEach((c) => {
    (c.awards ?? []).forEach((a) =>
      out.push({
        place: a.place,
        contestId: c.id,
        submissionId: a.submission_id,
        executorId: a.executor_id,
        amount: Number(a.amount) || 0,
        netAmount: a.net_amount ?? netOf(Number(a.amount) || 0, commissionPercent),
        awardedAt: awardDate(c, now),
      }),
    );
    // Старые конкурсы с одним победителем без строк награды.
    if (c.winner && !(c.awards ?? []).some((a) => a.place === 1)) {
      out.push({
        place: 1,
        contestId: c.id,
        submissionId: c.winner.submission_id,
        executorId: c.winner.executor_id,
        amount: Number(c.prizepool) || 0,
        netAmount: netOf(Number(c.prizepool) || 0, commissionPercent),
        awardedAt: awardDate(c, now),
      });
    }
    // Победитель только по статусу решения: если у конкурса нет ни одной награды 1 места.
    if (!c.winner && !(c.awards ?? []).some((a) => a.place === 1)) {
      submissions
        .filter((s) => s.contest_id === c.id && s.status === 3)
        .slice(0, 1)
        .forEach((s) =>
          out.push({
            place: 1,
            contestId: c.id,
            submissionId: s.id,
            executorId: s.executor_id,
            amount: Number(c.prizepool) || 0,
            netAmount: netOf(Number(c.prizepool) || 0, commissionPercent),
            awardedAt: awardDate(c, now),
          }),
        );
    }
  });
  return out;
}

/** Кеш данных для рейтинга и профилей. Всё считается на клиенте. */
export default class RatingStore {
  contests: Contest[] = [];
  /** Решения, сгруппированные по исполнителю. */
  submissionsByExecutor: Record<number, Submission[]> = {};
  /** Все решения загружены (а не только одного исполнителя). */
  allSubmissionsLoaded = false;
  /** Решения недоступны (например, гость): рейтинг строится по наградам. */
  submissionsUnavailable = false;
  users: Record<number, User> = {};
  awardRows: Record<number, ContestAwardRow[]> = {};
  loading = false;
  error = "";
  commissionPercent = DEFAULT_COMMISSION;

  commissionLoaded = false;
  private contestsAt = 0;
  private allSubsAt = 0;
  private inflight: Record<string, Promise<unknown> | undefined> = {};

  constructor() {
    makeAutoObservable(this, { inflight: false } as never, { autoBind: true });
  }

  private once<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const running = this.inflight[name] as Promise<T> | undefined;
    if (running) return running;
    const p = fn().finally(() => {
      delete this.inflight[name];
    });
    this.inflight[name] = p;
    return p;
  }

  reset(): void {
    this.contests = [];
    this.submissionsByExecutor = {};
    this.allSubmissionsLoaded = false;
    this.submissionsUnavailable = false;
    this.users = {};
    this.awardRows = {};
    this.contestsAt = 0;
    this.allSubsAt = 0;
  }

  get awards(): AwardWithExecutor[] {
    return toAwards(
      this.contests,
      Date.now(),
      this.commissionPercent,
      Object.values(this.submissionsByExecutor).flat(),
    );
  }

  async ensureCommission(): Promise<void> {
    if (this.commissionLoaded) return;
    await this.once("commission", async () => {
      try {
        const res = await fetchData<{ percent: number }>("/payments/commission", {}, { silent: true });
        if (Number.isFinite(res?.percent)) {
          runInAction(() => {
            this.commissionPercent = res.percent;
          });
        }
      } catch {
        /* остаётся значение по умолчанию */
      }
      runInAction(() => {
        this.commissionLoaded = true;
      });
    });
  }

  async ensureContests(force = false): Promise<void> {
    if (!force && this.contestsAt && Date.now() - this.contestsAt < CACHE_MS) return;
    await this.ensureCommission();
    await this.once("contests", async () => {
      const all: Contest[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchData<ContestListResponse>("/contests", {
          page,
          limit: PAGE,
          sort_by: "created_at",
          sort_dir: "desc",
        });
        all.push(...res.items);
        if (page >= res.pages) break;
      }
      runInAction(() => {
        this.contests = all;
        this.contestsAt = Date.now();
      });
    });
  }

  private groupSubmissions(list: Submission[]): Record<number, Submission[]> {
    const grouped: Record<number, Submission[]> = {};
    list.forEach((s) => (grouped[s.executor_id] ||= []).push(s));
    return grouped;
  }

  async ensureAllSubmissions(force = false): Promise<void> {
    if (!force && this.allSubmissionsLoaded && Date.now() - this.allSubsAt < CACHE_MS) return;
    await this.once("subs-all", async () => {
      const all: Submission[] = [];
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const chunk = await fetchData<Submission[]>(
            "/submissions",
            { page, limit: PAGE, sort_by: "created_at", sort_dir: "desc" },
            { silent: true },
          );
          all.push(...chunk);
          if (chunk.length < PAGE) break;
        }
        runInAction(() => {
          this.submissionsByExecutor = this.groupSubmissions(all);
          this.allSubmissionsLoaded = true;
          this.submissionsUnavailable = false;
          this.allSubsAt = Date.now();
        });
      } catch {
        runInAction(() => {
          this.submissionsUnavailable = true;
        });
      }
    });
  }

  async ensureExecutorSubmissions(executorId: number): Promise<Submission[]> {
    if (this.allSubmissionsLoaded || this.submissionsByExecutor[executorId]) {
      return this.submissionsByExecutor[executorId] ?? [];
    }
    return this.once(`subs-${executorId}`, async () => {
      try {
        const list: Submission[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const chunk = await fetchData<Submission[]>(
            "/submissions",
            { executor_id: executorId, page, limit: PAGE, sort_by: "created_at", sort_dir: "desc" },
            { silent: true },
          );
          list.push(...chunk);
          if (chunk.length < PAGE) break;
        }
        runInAction(() => {
          this.submissionsByExecutor[executorId] = list;
        });
        return list;
      } catch {
        runInAction(() => {
          this.submissionsUnavailable = true;
        });
        return [];
      }
    });
  }

  /** Публичный профиль; результат кешируется. */
  async ensureUser(id: number): Promise<User | null> {
    if (this.users[id]) return this.users[id];
    return this.once(`user-${id}`, async () => {
      try {
        const u = await fetchData<User>(`/users/${id}`, {}, { silent: true });
        runInAction(() => {
          this.users[id] = u;
        });
        return u;
      } catch {
        return null;
      }
    });
  }

  async ensureUsers(ids: number[]): Promise<void> {
    const todo = ids.filter((id) => !this.users[id]);
    const CONCURRENCY = 6;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      await Promise.all(todo.slice(i, i + CONCURRENCY).map((id) => this.ensureUser(id)));
    }
  }

  async ensureAwardRows(contestId: number): Promise<ContestAwardRow[]> {
    if (this.awardRows[contestId]) return this.awardRows[contestId];
    return this.once(`awards-${contestId}`, async () => {
      try {
        const rows = await fetchData<ContestAwardRow[]>(`/contests/${contestId}/awards`, {}, { silent: true });
        runInAction(() => {
          this.awardRows[contestId] = rows;
        });
        return rows;
      } catch {
        return [];
      }
    });
  }

  /** Загрузка всего для таблицы лидеров. */
  async loadLeaderboard(force = false): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      await Promise.all([this.ensureContests(force), this.ensureAllSubmissions(force)]);
      const ids = new Set<number>(Object.keys(this.submissionsByExecutor).map(Number));
      this.awards.forEach((a) => ids.add(a.executorId));
      await this.ensureUsers([...ids]);
    } catch {
      runInAction(() => {
        this.error = "Не удалось загрузить рейтинг. Попробуйте обновить страницу.";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  leaderboard(period: Period, typeId?: number | null, now: number = Date.now()): LeaderboardEntry[] {
    const typeOf = new Map(this.contests.map((c) => [c.id, c.type_id]));
    const inType = (contestId: number) => !typeId || typeOf.get(contestId) === typeId;
    const subs = Object.values(this.submissionsByExecutor)
      .flat()
      .filter((s) => inType(s.contest_id))
      .map(toRatingSubmission);
    const awards = this.awards.filter((a) => inType(a.contestId));
    return buildLeaderboard({
      users: this.users,
      submissions: subs,
      awards,
      cutoff: periodCutoff(period, now),
    });
  }
}
