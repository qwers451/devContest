import React, { useContext, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import { fetchData, sendData } from "../services/apiService.js";
import type { Contest, Submission } from "../types";
import ConfirmationModal from "./ConfirmationModal";
import UserLink from "./UserLink";
import { useCommission } from "./useNow";
import { MEDALS, formatRub, netPayout, splitPrize } from "../utils/prizes";
import { showToast } from "../utils/toast";

interface Props {
  show: boolean;
  contest: Contest;
  /** Решение, которое нужно поставить на 1 место сразу при открытии (из карточки решения). */
  presetSubmissionId?: number | null;
  onHide: () => void;
  onDone: (updated: Contest) => void;
}

/** «Подвести итоги»: назначить места решениям, увидеть выплаты после комиссии и подтвердить. */
const AwardModal = ({ show, contest, presetSubmissionId = null, onHide, onDone }: Props) => {
  const { rating } = useContext(Context)!;
  const commission = useCommission();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [placeBySub, setPlaceBySub] = useState<Record<number, number>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Contest | null>(null);

  const distribution = contest.prize_distribution?.length ? contest.prize_distribution : [100];

  useEffect(() => {
    if (!show) return;
    setDone(null);
    setError("");
    setPlaceBySub(presetSubmissionId ? { [presetSubmissionId]: 1 } : {});
    setSubs(null);
    setLoadError("");
    fetchData<Submission[]>("/submissions", { contest_id: contest.id, limit: 100, sort_by: "ai_score", sort_dir: "desc" }, { silent: true })
      .then((list) => {
        const own = (Array.isArray(list) ? list : []).filter((s) => s.contest_id === contest.id);
        setSubs(own);
        rating.ensureUsers(own.map((s) => s.executor_id));
      })
      .catch(() => setLoadError("Не удалось загрузить решения"));
  }, [show, contest.id, presetSubmissionId]);

  const subByPlace = useMemo(() => {
    const m: Record<number, Submission> = {};
    (subs ?? []).forEach((s) => {
      const p = placeBySub[s.id];
      if (p) m[p] = s;
    });
    return m;
  }, [subs, placeBySub]);

  if (!show) return null;

  const setPlace = (subId: number, place: number) => {
    setPlaceBySub((prev) => {
      const next: Record<number, number> = {};
      // место может занимать только одно решение
      Object.entries(prev).forEach(([id, p]) => {
        if (p !== place || Number(id) === subId) next[Number(id)] = p;
      });
      if (place) next[subId] = place;
      else delete next[subId];
      return next;
    });
  };

  const awardedPlaces = Object.keys(subByPlace).map(Number).sort((a, b) => a - b);
  const hasFirst = awardedPlaces.includes(1);
  const amounts = splitPrize(contest.prizepool, distribution, awardedPlaces);
  const skipped = distribution.map((_, i) => i + 1).filter((p) => !awardedPlaces.includes(p));
  const loginOf = (s: Submission) => s.executor_login || rating.users[s.executor_id]?.login || null;

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await sendData<Contest>(`/contests/${contest.id}/awards`, {
        awards: awardedPlaces.map((place) => ({ submission_id: subByPlace[place].id, place })),
      });
      setDone(updated);
      showToast({ title: "Итоги подведены", body: "Призы выплачены победителям", kind: "success" });
      onDone(updated);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: unknown } }; message?: string };
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join("; ")
            : err?.message || "Не удалось подвести итоги";
      setError(msg);
      showToast({ title: "Не удалось подвести итоги", body: msg, kind: "warning" });
    } finally {
      setSaving(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onHide}
    >
      <div
        role="dialog"
        aria-label="Подведение итогов"
        className="animate-fade-in flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-lg border border-gray-700 bg-gray-900 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  if (done) {
    return shell(
      <div className="overflow-y-auto p-5 sm:p-6">
        <h3 className="mb-1 text-[16px] font-medium text-emerald-400">Итоги подведены</h3>
        <p className="mb-4 text-[13px] text-gray-400">Конкурс завершён, призы отправлены победителям.</p>
        <div className="space-y-2">
          {awardedPlaces.map((p) => {
            const s = subByPlace[p];
            return (
              <div key={p} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-[13px]">
                <span className="text-lg">{MEDALS[p - 1]}</span>
                <span className="text-gray-200">{s.title}</span>
                <UserLink id={s.executor_id} login={loginOf(s)} className="text-violet-400" />
                <span className="ml-auto tabular-nums text-emerald-400">{formatRub(netPayout(amounts[p], commission))}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={onHide} className="rounded-md bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700">
            Закрыть
          </button>
        </div>
      </div>,
    );
  }

  return (
    <>
      {shell(
        <>
          <div className="border-b border-gray-700 px-5 py-4 sm:px-6">
            <h3 className="text-[16px] font-medium text-gray-100">Подвести итоги</h3>
            <p className="mt-1 text-[12px] text-gray-400">
              Назначьте места решениям. Первое место обязательно. Конкурс завершится, действие необратимо.
            </p>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4 sm:px-6">
            {loadError && <p className="text-[13px] text-red-400">{loadError}</p>}
            {!subs && !loadError && <p className="text-[13px] text-gray-400">Загрузка решений…</p>}
            {subs && subs.length === 0 && <p className="text-[13px] text-gray-400">В конкурсе пока нет решений.</p>}
            {subs?.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-[13px] font-medium text-gray-100">{s.title || "Без названия"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-gray-400">
                    <UserLink id={s.executor_id} login={loginOf(s)} className="text-violet-400" />
                    <span>№{s.number}</span>
                    <span>{s.ai_score != null ? `ИИ ${Math.round(s.ai_score)}%` : "ИИ —"}</span>
                    <span>{s.avg_score != null ? `★ ${s.avg_score}` : "★ —"}</span>
                  </div>
                </div>
                <select
                  aria-label={`Место для решения ${s.title}`}
                  value={placeBySub[s.id] ?? 0}
                  onChange={(e) => setPlace(s.id, Number(e.target.value))}
                  className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value={0}>Без места</option>
                  {distribution.map((_, i) => (
                    <option key={i} value={i + 1}>
                      {MEDALS[i]} {i + 1} место
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-700 px-5 py-4 sm:px-6">
            <div className="mb-3 space-y-1 text-[13px]" data-testid="award-summary">
              {awardedPlaces.length === 0 && <p className="text-gray-500">Места пока не назначены.</p>}
              {awardedPlaces.map((p) => (
                <div key={p} className="flex flex-wrap justify-between gap-x-3 text-gray-300">
                  <span>
                    {MEDALS[p - 1]} {p} место · {subByPlace[p].title}
                  </span>
                  <span className="tabular-nums">
                    {formatRub(amounts[p])} → <b className="text-emerald-400">{formatRub(netPayout(amounts[p], commission))}</b> на руки
                  </span>
                </div>
              ))}
              {awardedPlaces.length > 0 && skipped.length > 0 && (
                <p className="text-[12px] text-amber-400">
                  Не присуждены места: {skipped.join(", ")}. Их доля добавится к {awardedPlaces[awardedPlaces.length - 1]} месту.
                </p>
              )}
              <p className="text-[12px] text-gray-500">Комиссия платформы {commission}% удерживается из каждой выплаты.</p>
            </div>
            {error && (
              <p role="alert" className="mb-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-[13px] text-red-300">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={onHide} className="rounded-md border border-gray-700 px-5 py-2 text-[13px] font-medium text-gray-300 hover:bg-gray-800">
                Отмена
              </button>
              <button
                onClick={() => setConfirm(true)}
                disabled={!hasFirst || saving}
                title={hasFirst ? undefined : "Назначьте 1 место"}
                className="rounded-md bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Выплата…" : "Подвести итоги"}
              </button>
            </div>
          </div>
        </>,
      )}
      <ConfirmationModal
        show={confirm}
        onHide={() => setConfirm(false)}
        onConfirm={submit}
        title="Подтвердите итоги"
        message={`Конкурс завершится, призы (${formatRub(contest.prizepool)} до комиссии) будут выплачены исполнителям. Действие необратимо.`}
        confirmText="Подвести итоги"
        confirmVariant="primary"
      />
    </>
  );
};

export default observer(AwardModal);
