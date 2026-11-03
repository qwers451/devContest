/** Обратный отсчёт до окончания приёма работ — чистые функции. */

export interface Countdown {
  expired: boolean;
  /** Меньше суток до конца (подсвечивается красным). */
  urgent: boolean;
  days: number;
  hours: number;
  minutes: number;
  totalMs: number;
}

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

export function getCountdown(endsAt: string | number | Date, now: number = Date.now()): Countdown {
  const end = new Date(endsAt).getTime();
  const diff = end - now;
  if (!Number.isFinite(diff) || diff <= 0) {
    return { expired: true, urgent: false, days: 0, hours: 0, minutes: 0, totalMs: 0 };
  }
  return {
    expired: false,
    urgent: diff < DAY,
    days: Math.floor(diff / DAY),
    hours: Math.floor((diff % DAY) / HOUR),
    minutes: Math.floor((diff % HOUR) / MIN),
    totalMs: diff,
  };
}

/** «Осталось 2 д 4 ч 13 мин» / «Приём работ завершён». */
export function formatCountdown(c: Countdown): string {
  if (c.expired) return "Приём работ завершён";
  const parts: string[] = [];
  if (c.days > 0) parts.push(`${c.days} д`);
  if (c.days > 0 || c.hours > 0) parts.push(`${c.hours} ч`);
  parts.push(`${c.minutes} мин`);
  return `Осталось ${parts.join(" ")}`;
}

/** Короткая форма для карточек: «3 дня», «5 ч», «12 мин» — null, если срок вышел. */
export function formatCountdownShort(c: Countdown): string | null {
  if (c.expired) return null;
  if (c.days >= 1) {
    const m10 = c.days % 10;
    const m100 = c.days % 100;
    const w = m100 >= 11 && m100 <= 14 ? "дней" : m10 === 1 ? "день" : m10 >= 2 && m10 <= 4 ? "дня" : "дней";
    return `${c.days} ${w}`;
  }
  if (c.hours >= 1) return `${c.hours} ч`;
  return `${Math.max(1, c.minutes)} мин`;
}

/** Причина, по которой нельзя отправить решение, или null, если можно. */
export function submissionBlockReason(status: string, endsAt: string, now: number = Date.now()): string | null {
  if (status !== "active") return "Конкурс не принимает решения";
  if (getCountdown(endsAt, now).expired) return "Срок приёма решений истёк";
  return null;
}
