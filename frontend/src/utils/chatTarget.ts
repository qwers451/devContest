import type { Contest, Submission, User } from "../types";

export interface ChatTarget {
  contestId: number;
  /** Для заказчика — id исполнителя, с которым открывается беседа. */
  executorId?: number;
}

const ts = (s: string) => {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Где можно открыть чат между зрителем и владельцем профиля (правила бэкенда):
 * заказчик → исполнитель, у которого есть решение в конкурсе этого заказчика;
 * исполнитель → заказчик активного конкурса либо конкурса, куда исполнитель отправил решение.
 * Из подходящих конкурсов берётся самый свежий. null — написать нельзя.
 */
export function findChatTarget(
  viewer: Pick<User, "id" | "role"> | null | undefined,
  profile: Pick<User, "id" | "role"> | null | undefined,
  contests: Contest[],
  /** Решения исполнителя (владельца профиля или зрителя — того, кто исполнитель). */
  executorSubmissions: Pick<Submission, "contest_id" | "executor_id">[],
): ChatTarget | null {
  if (!viewer || !profile || viewer.id === profile.id) return null;

  if (viewer.role === "customer" && profile.role === "executor") {
    const mine = new Map(contests.filter((c) => c.customer_id === viewer.id).map((c) => [c.id, c]));
    const shared = executorSubmissions
      .filter((s) => s.executor_id === profile.id && mine.has(s.contest_id))
      .map((s) => mine.get(s.contest_id)!);
    const best = [...shared].sort((a, b) => ts(b.created_at) - ts(a.created_at))[0];
    return best ? { contestId: best.id, executorId: profile.id } : null;
  }

  if (viewer.role === "executor" && profile.role === "customer") {
    const submitted = new Set(
      executorSubmissions.filter((s) => s.executor_id === viewer.id).map((s) => s.contest_id),
    );
    const candidates = contests.filter(
      (c) => c.customer_id === profile.id && (c.status === "active" || submitted.has(c.id)),
    );
    const best = [...candidates].sort((a, b) => ts(b.created_at) - ts(a.created_at))[0];
    return best ? { contestId: best.id } : null;
  }

  return null;
}
