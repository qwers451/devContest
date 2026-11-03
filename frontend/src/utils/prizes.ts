/**
 * Призовые места: проверка распределения, деление фонда и сумма на руки.
 * Логика зеркалит backend (contests.py: _split_prize / _net_of): деньги считаются в копейках,
 * последнее присуждённое место получает остаток, чтобы сумма сошлась с фондом до копейки.
 */
import { DEFAULT_COMMISSION } from "./rating";

export const MAX_PLACES = 5;

export const PRIZE_PRESETS: { label: string; value: number[] }[] = [
  { label: "Один победитель 100%", value: [100] },
  { label: "60 / 30 / 10", value: [60, 30, 10] },
  { label: "50 / 30 / 20", value: [50, 30, 20] },
];

const toCents = (rub: number): number => Math.round(rub * 100);
const fromCents = (c: number): number => c / 100;

/** Ошибка распределения или null, если всё верно. */
export function validateDistribution(parts: number[]): string | null {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PLACES) {
    return `Количество призовых мест — от 1 до ${MAX_PLACES}`;
  }
  if (parts.some((p) => !Number.isInteger(p))) return "Доли должны быть целыми числами";
  if (parts.some((p) => p < 1)) return "Каждое место должно получать не менее 1%";
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum !== 100) return `Сумма долей должна быть 100% (сейчас ${sum}%)`;
  return null;
}

/**
 * Суммы по местам (в рублях). `awarded` — какие места (1-based) реально присуждены;
 * по умолчанию все. Доля неприсуждённых мест уходит последнему присуждённому месту.
 */
export function splitPrize(total: number, parts: number[], awarded?: number[]): Record<number, number> {
  const places = (awarded ?? parts.map((_, i) => i + 1))
    .filter((p) => p >= 1 && p <= parts.length)
    .sort((a, b) => a - b);
  const result: Record<number, number> = {};
  if (!places.length) return result;
  const totalC = toCents(total);
  let spent = 0;
  for (const place of places.slice(0, -1)) {
    const part = Math.round((totalC * parts[place - 1]) / 100);
    result[place] = fromCents(part);
    spent += part;
  }
  result[places[places.length - 1]] = fromCents(totalC - spent);
  return result;
}

/** Комиссия платформы с выплаты (копейки округляются). */
export function commissionOf(gross: number, percent: number): number {
  const pct = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : DEFAULT_COMMISSION;
  return fromCents(Math.round((toCents(gross) * pct) / 100));
}

/** Сумма на руки: выплата минус комиссия. */
export function netPayout(gross: number, percent: number): number {
  return fromCents(toCents(gross) - toCents(commissionOf(gross, percent)));
}

export function placesCountLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word =
    m100 >= 11 && m100 <= 14
      ? "призовых мест"
      : m10 === 1
        ? "призовое место"
        : m10 >= 2 && m10 <= 4
          ? "призовых места"
          : "призовых мест";
  return `${n} ${word}`;
}

export const formatRub = (v: number): string =>
  `${v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;

export const MEDALS = ["🥇", "🥈", "🥉", "4", "5"];

export interface PrizeRow {
  place: number;
  percent: number;
  awarded: boolean;
  gross: number | null;
  net: number | null;
}

/**
 * Строки блока «Призовой фонд». Для завершённого конкурса с наградами — фактические суммы
 * (неприсуждённые места без денег), иначе — номинальное деление по процентам.
 */
export function buildPrizeRows(
  prizepool: number,
  parts: number[],
  commissionPercent: number,
  finished: boolean,
  awards?: { place: number; amount: number; net_amount?: number | null }[],
): PrizeRow[] {
  if (finished && awards && awards.length) {
    return parts.map((percent, i) => {
      const a = awards.find((x) => x.place === i + 1);
      if (!a) return { place: i + 1, percent, awarded: false, gross: null, net: null };
      const gross = Number(a.amount);
      return { place: i + 1, percent, awarded: true, gross, net: a.net_amount ?? netPayout(gross, commissionPercent) };
    });
  }
  const split = splitPrize(prizepool, parts);
  return parts.map((percent, i) => ({
    place: i + 1,
    percent,
    awarded: true,
    gross: split[i + 1] ?? 0,
    net: netPayout(split[i + 1] ?? 0, commissionPercent),
  }));
}
