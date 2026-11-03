import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import { fetchData } from "../services/apiService.js";
import type { Contest, ContestAwardRow } from "../types";
import UserLink from "./UserLink";
import UserAvatar from "./UserAvatar";
import { useCommission } from "./useNow";
import { MEDALS, formatRub, netPayout } from "../utils/prizes";

/** «Итоги конкурса»: подиум (1 — по центру, 2 — слева, 3 — справа; на телефоне друг под другом). */
const ContestResults = ({ contest }: { contest: Contest }) => {
  const { rating } = useContext(Context)!;
  const navigate = useNavigate();
  const commission = useCommission();
  const [rows, setRows] = useState<ContestAwardRow[]>((contest.awards as ContestAwardRow[]) ?? []);

  useEffect(() => {
    let alive = true;
    fetchData<ContestAwardRow[]>(`/contests/${contest.id}/awards`, {}, { silent: true })
      .then((list) => {
        if (alive && Array.isArray(list) && list.length) setRows(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [contest.id]);

  useEffect(() => {
    rating.ensureUsers(rows.map((r) => r.executor_id));
  }, [rows]);

  const sorted = [...rows].sort((a, b) => a.place - b.place);
  if (!sorted.length) return null;

  const loginOf = (r: ContestAwardRow) => r.executor_login || rating.users[r.executor_id]?.login || null;
  const netOfRow = (r: ContestAwardRow) => r.net_amount ?? netPayout(r.amount, commission);
  const slots = Math.min(3, contest.prize_distribution?.length || 3);
  const maxAwarded = sorted[sorted.length - 1].place;
  const podium = sorted.filter((r) => r.place <= 3);
  const skipped = [1, 2, 3].filter((p) => p <= slots && p < maxAwarded && !sorted.some((r) => r.place === p));
  const rest = sorted.filter((r) => r.place > 3);
  // порядок на десктопе: 2 — 1 — 3
  const desktopOrder: Record<number, string> = { 1: "md:order-2", 2: "md:order-1", 3: "md:order-3" };
  const height: Record<number, string> = { 1: "md:pt-6 md:pb-6", 2: "md:mt-8", 3: "md:mt-12" };
  const tone: Record<number, string> = {
    1: "border-amber-400/60 bg-amber-400/10",
    2: "border-gray-400/50 bg-gray-400/10",
    3: "border-orange-500/50 bg-orange-500/10",
  };

  const card = (r: ContestAwardRow, big: boolean) => (
    <div
      key={r.place}
      className={`flex flex-col items-center rounded-lg border px-4 py-4 text-center ${big ? tone[r.place] ?? "" : "border-gray-700 bg-gray-800"} ${
        desktopOrder[r.place] ?? ""
      } ${height[r.place] ?? ""}`}
    >
      <div className="text-3xl leading-none">{MEDALS[r.place - 1]}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">{r.place} место</div>
      <div className="mt-3">
        <UserAvatar login={loginOf(r)} size={r.place === 1 ? 56 : 44} />
      </div>
      <UserLink id={r.executor_id} login={loginOf(r)} className="mt-2 text-[14px] font-medium text-violet-300" />
      <button
        onClick={() => navigate(`/solution/${r.submission_number ?? r.submission_id}`)}
        className="mt-0.5 max-w-full truncate text-[12px] text-gray-400 hover:text-gray-200 hover:underline"
        title={r.submission_title ?? undefined}
      >
        {r.submission_title || `Решение №${r.submission_number ?? r.submission_id}`}
      </button>
      <div className="mt-3 text-[15px] font-semibold tabular-nums text-emerald-400">{formatRub(netOfRow(r))}</div>
      <div className="text-[11px] tabular-nums text-gray-500">из {formatRub(r.amount)} до комиссии</div>
    </div>
  );

  return (
    <section className="border-b border-gray-700 px-6 py-5" aria-label="Итоги конкурса" data-testid="contest-results">
      <h2 className="mb-4 text-[14px] font-medium text-gray-200">Итоги конкурса</h2>
      <div className={`grid grid-cols-1 gap-3 md:items-end ${podium.length + skipped.length > 1 ? "md:grid-cols-3" : "md:mx-auto md:max-w-xs"}`}>
        {podium.map((r) => card(r, true))}
        {skipped.map((p) => (
          <div
            key={`skip-${p}`}
            className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-700 px-4 py-4 text-center opacity-60 ${desktopOrder[p] ?? ""} ${height[p] ?? ""}`}
          >
            <div className="text-2xl leading-none">{MEDALS[p - 1]}</div>
            <div className="mt-1 text-[12px] text-gray-500">{p} место — не присуждено</div>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{rest.map((r) => card(r, false))}</div>
      )}
    </section>
  );
};

export default observer(ContestResults);
