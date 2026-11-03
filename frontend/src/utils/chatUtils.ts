const pad = (n: number) => String(n).padStart(2, "0");

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Заголовок разделителя дат: «Сегодня», «Вчера» или dd.mm.yyyy. */
export function formatDateSeparator(
  iso: string | Date,
  now: Date = new Date(),
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Время сообщения HH:MM. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время в списке диалогов: сегодня — HH:MM, вчера — «Вчера», иначе dd.mm.yyyy. */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const label = formatDateSeparator(iso, now);
  return label === "Сегодня" ? formatMessageTime(iso) : label;
}

/** Ключ дня для группировки сообщений. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** ws(s)://host/ws/chat?token=… из базового URL API (или текущего origin). */
export function buildWsUrl(
  base: string,
  token: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string {
  const root = (/^https?:\/\//i.test(base) ? base : origin).replace(/\/+$/, "");
  return `${root.replace(/^http/i, "ws")}/ws/chat?token=${encodeURIComponent(token)}`;
}
