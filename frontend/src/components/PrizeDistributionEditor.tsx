import React from "react";
import {
  MAX_PLACES,
  MEDALS,
  PRIZE_PRESETS,
  formatRub,
  netPayout,
  splitPrize,
  validateDistribution,
} from "../utils/prizes";

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
  prizepool: number;
  commission: number;
}

/** Редактор призовых мест: пресеты, проценты по местам, проверка суммы и деньги по каждому месту. */
const PrizeDistributionEditor = ({ value, onChange, prizepool, commission }: Props) => {
  const error = validateDistribution(value);
  const sum = value.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const fund = Number.isFinite(prizepool) && prizepool > 0 ? prizepool : 0;
  const gross = error ? {} : splitPrize(fund, value);

  const setPart = (i: number, raw: string) => {
    const n = raw === "" ? 0 : parseInt(raw, 10);
    onChange(value.map((p, idx) => (idx === i ? (Number.isFinite(n) ? n : 0) : p)));
  };
  const addPlace = () => {
    if (value.length >= MAX_PLACES) return;
    onChange([...value, 0]);
  };
  const removePlace = (i: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, idx) => idx !== i));
  };
  const isPreset = (p: number[]) => p.length === value.length && p.every((x, i) => x === value[i]);

  const winnerNet = gross[1] != null ? netPayout(gross[1], commission) : null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4" data-testid="prize-editor">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium text-gray-200">Призовые места</h3>
        <span className="text-[12px] text-gray-500">от 1 до {MAX_PLACES} мест</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              isPreset(p.value)
                ? "border-violet-500 bg-violet-600/20 text-violet-300"
                : "border-gray-700 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {value.map((part, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2"
          >
            <span className="w-24 flex-shrink-0 text-[13px] text-gray-200">
              <span className="mr-1.5">{MEDALS[i]}</span>
              {i + 1} место
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={part || ""}
                aria-label={`Доля ${i + 1} места, %`}
                onChange={(e) => setPart(i, e.target.value)}
                className="w-20 rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <span className="text-[13px] text-gray-400">%</span>
            </div>
            <span className="ml-auto text-right text-[12px] tabular-nums text-gray-400">
              {gross[i + 1] != null ? (
                <>
                  <span className="text-gray-200">{formatRub(gross[i + 1])}</span>
                  <span className="text-gray-500"> · на руки </span>
                  <span className="text-emerald-400">{formatRub(netPayout(gross[i + 1], commission))}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => removePlace(i)}
                aria-label={`Убрать ${i + 1} место`}
                className="flex-shrink-0 rounded-md border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addPlace}
          disabled={value.length >= MAX_PLACES}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-[12px] font-medium text-violet-400 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Добавить место
        </button>
        <span
          role="status"
          className={`text-[12px] font-medium tabular-nums ${error ? "text-red-400" : "text-emerald-400"}`}
        >
          {error ? error : `Сумма долей: ${sum}% ✓`}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-violet-500/30 bg-violet-600/10 px-3 py-2 text-[12px] leading-relaxed text-gray-300">
        Призовой фонд: <b className="text-gray-100">{formatRub(fund)}</b> · Комиссия платформы {commission}% удерживается
        из выплаты
        {winnerNet != null && (
          <>
            {" "}· Победитель получит <b className="text-emerald-400">{formatRub(winnerNet)}</b>
          </>
        )}
      </div>
    </div>
  );
};

export default PrizeDistributionEditor;
