import React, { useContext, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { Context } from "../context";
import { PUBLIC_PROFILE_ROUTE } from "../utils/consts.js";
import { formatMoney, type Period } from "../utils/rating";
import { loadExtras } from "../utils/profileExtras";
import UserAvatar from "../components/UserAvatar";
import StarRating from "../components/StarRating";
import RatingInfo from "../components/RatingInfo";
import { PlaceMedal } from "./PublicProfilePage";

const selectCls =
  "h-9 w-full rounded-md border border-gray-700 bg-gray-800 px-3 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400";

const LeaderboardPage = () => {
  const { rating: store, contest } = useContext(Context)!;
  const [period, setPeriod] = useState<Period>("all");
  const [typeId, setTypeId] = useState<number>(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    store.loadLeaderboard();
  }, []);

  const entries = store.leaderboard(period, typeId || null);
  const q = query.trim().toLowerCase();
  // Место считается в общем списке, поиск лишь скрывает строки.
  const rows = useMemo(
    () => entries.map((e, i) => ({ ...e, rank: i + 1 })).filter((e) => !q || e.login.toLowerCase().includes(q)),
    [entries, q],
  );

  const loadingFirst = store.loading && entries.length === 0;

  return (
    <div className="min-h-screen bg-gray-950 py-6">
      <div className="mx-auto max-w-4xl space-y-4 px-4">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-100">Рейтинг исполнителей</h1>
          <p className="mt-1 text-[13px] text-gray-400">
            Лучшие исполнители платформы по отзывам, проверке ИИ и призовым местам.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-gray-500">Поиск по логину</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Например, kate"
              className={selectCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-gray-500">Тип конкурса</span>
            <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} className={selectCls}>
              <option value={0}>Все типы</option>
              {contest.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-gray-500">Период</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={selectCls}>
              <option value="all">Всё время</option>
              <option value="30d">30 дней</option>
            </select>
          </label>
        </div>

        {store.error && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-[13px] text-red-300">
            <span>{store.error}</span>
            <button onClick={() => store.loadLeaderboard(true)} className="font-medium underline">
              Повторить
            </button>
          </div>
        )}
        {store.submissionsUnavailable && !store.error && (
          <div className="rounded-md border border-gray-700 bg-gray-900 px-4 py-2.5 text-[12px] text-gray-400">
            Войдите в аккаунт, чтобы рейтинг учитывал оценки и все решения. Сейчас учтены только призовые места.
          </div>
        )}

        {loadingFirst ? (
          <div className="flex min-h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
            <span className="ml-3 text-[13px] text-gray-500">Считаем рейтинг…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900 px-4 py-10 text-center text-[13px] text-gray-500">
            {entries.length === 0
              ? "По выбранным фильтрам пока нет исполнителей."
              : `Никого не нашли по запросу «${query.trim()}».`}
          </div>
        ) : (
          <ol className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
            {rows.map((e) => {
              const extras = loadExtras(e.userId, e.login);
              const st = e.rating.stats;
              return (
                <li key={e.userId}>
                  <Link
                    to={`${PUBLIC_PROFILE_ROUTE}/${e.userId}`}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-gray-800/60 sm:px-4"
                  >
                    <div className="flex w-8 flex-shrink-0 justify-center">
                      {e.rank <= 3 ? (
                        <PlaceMedal place={e.rank} />
                      ) : (
                        <span className="text-[13px] tabular-nums text-gray-500">{e.rank}</span>
                      )}
                    </div>
                    <UserAvatar login={e.login} color={extras.avatarColor} image={extras.avatarImage} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="truncate text-[14px] font-medium text-gray-100">{e.login}</span>
                        <span className="text-[12px] text-violet-300">{e.rating.level}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-gray-500">
                        <span>Побед: {st.wins}</span>
                        <span>Решений: {st.submissions}</span>
                        {st.totalNet > 0 && <span title="Призы на руки, после комиссии платформы">На руки: {formatMoney(st.totalNet)}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[18px] font-bold tabular-nums text-gray-100">
                        {e.rating.score.toFixed(1)}
                      </div>
                      <div className="hidden sm:block">
                        <StarRating value={e.rating.score} size={12} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        <RatingInfo />
      </div>
    </div>
  );
};

export default observer(LeaderboardPage);
