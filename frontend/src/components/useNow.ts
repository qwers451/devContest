import { useContext, useEffect, useState } from "react";
import { Context } from "../context";
import { DEFAULT_COMMISSION } from "../utils/rating";

/** Текущее время, обновляется по таймеру (для живого отсчёта). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Процент комиссии платформы (GET /payments/commission, по умолчанию 10). */
export function useCommission(): number {
  const ctx = useContext(Context) as { rating?: { commissionPercent: number; ensureCommission: () => Promise<void> } } | null;
  const rating = ctx?.rating;
  const [percent, setPercent] = useState<number>(rating?.commissionPercent ?? DEFAULT_COMMISSION);
  useEffect(() => {
    let alive = true;
    rating
      ?.ensureCommission()
      .then(() => {
        if (alive && rating) setPercent(rating.commissionPercent);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rating]);
  return percent;
}
