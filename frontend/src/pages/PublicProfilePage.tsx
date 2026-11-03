import React, { useContext, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BsGithub, BsTrophy } from "react-icons/bs";
import { Context } from "../context";
import { DEMO } from "../services/demoData";
import { fetchFileObjectUrl } from "../services/apiService";
import type { Contest, Submission, User } from "../types";
import {
  CONTEST_ROUTE,
  LEADERBOARD_ROUTE,
  MESSAGES_ROUTE,
  PROFILE_ROUTE,
  SOLUTION_ROUTE,
} from "../utils/consts.js";
import {
  computeCustomerStats,
  computeRating,
  formatMoney,
  nextLevel,
} from "../utils/rating";
import { loadExtras, safeLink } from "../utils/profileExtras";
import { findChatTarget } from "../utils/chatTarget";
import { toRatingSubmission } from "../store/RatingStore";
import UserAvatar from "../components/UserAvatar";
import StarRating from "../components/StarRating";
import RatingInfo from "../components/RatingInfo";
import { showToast } from "../utils/toast";

const ROLE_LABEL: Record<string, string> = {
  executor: "Исполнитель",
  customer: "Заказчик",
  admin: "Администратор",
};

const PLACE_STYLE: Record<number, string> = {
  1: "bg-amber-400 text-amber-950",
  2: "bg-gray-300 text-gray-900",
  3: "bg-orange-400 text-orange-950",
};

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

export const PlaceMedal = ({ place }: { place: number }) => (
  <span
    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold ${
      PLACE_STYLE[place] ?? "bg-gray-700 text-gray-200"
    }`}
    title={`${place} место`}
  >
    {place}
  </span>
);

const StatCard = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3" title={hint}>
    <div className="text-[18px] font-semibold tabular-nums text-gray-100">{value}</div>
    <div className="mt-0.5 text-[12px] text-gray-500">{label}</div>
  </div>
);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Превью первой картинки из файлов решения; без доступа или без картинок — цветная заглушка. */
const PortfolioPreview = ({ submission, title, color }: { submission?: Submission; title: string; color: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const imageName = submission?.files?.find((f) => IMAGE_RE.test(f));

  useEffect(() => {
    if (DEMO || !submission || !imageName) return;
    let revoked = false;
    let created: string | null = null;
    fetchFileObjectUrl(`/submissions/${submission.id}/files/${encodeURIComponent(imageName)}`)
      .then((u) => {
        if (revoked) window.URL.revokeObjectURL(u);
        else {
          created = u;
          setUrl(u);
        }
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (created) window.URL.revokeObjectURL(created);
    };
  }, [submission?.id, imageName]);

  if (url) return <img src={url} alt={title} className="h-full w-full object-cover" />;
  return (
    <div
      className="flex h-full w-full items-center justify-center text-[34px] font-bold text-white/80"
      style={{ background: `linear-gradient(135deg, ${color}, #111827)` }}
      aria-hidden="true"
    >
      {title.trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
};

const PublicProfilePage = () => {
  const { id } = useParams();
  const userId = Number(id);
  const { user: me, rating: store, chat, solution: solutionStore } = useContext(Context)!;
  const navigate = useNavigate();

  const [profile, setProfile] = useState<User | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [openingChat, setOpeningChat] = useState(false);
  const [mySubs, setMySubs] = useState<Submission[]>([]);

  const viewer = me.isAuth ? (me.user as User) : null;
  const isMe = !!viewer && viewer.id === userId;

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setProfile(null);
    if (!Number.isFinite(userId) || userId <= 0) {
      setStatus("missing");
      return;
    }
    (async () => {
      const u = await store.ensureUser(userId);
      if (!alive) return;
      if (!u) {
        setStatus("missing");
        return;
      }
      await Promise.all([
        store.ensureContests(),
        u.role === "executor" ? store.ensureExecutorSubmissions(u.id) : Promise.resolve([]),
        viewer && viewer.role === "executor" && viewer.id !== u.id
          ? store.ensureExecutorSubmissions(viewer.id).then((s) => alive && setMySubs(s))
          : Promise.resolve(),
      ]).catch(() => undefined);
      if (!alive) return;
      setProfile(u);
      setStatus("ready");
    })();
    return () => {
      alive = false;
    };
  }, [userId, viewer?.id, viewer?.role]);

  const extras = useMemo(() => (profile ? loadExtras(profile.id, profile.login) : null), [profile?.id]);
  const subs: Submission[] = profile ? store.submissionsByExecutor[profile.id] ?? [] : [];
  const contestById = useMemo(() => new Map(store.contests.map((c) => [c.id, c])), [store.contests]);

  const myAwards = useMemo(
    () => (profile ? store.awards.filter((a) => a.executorId === profile.id) : []),
    [store.awards, profile?.id],
  );

  // Для награды без загруженного решения (гость) берём название из /contests/{id}/awards.
  useEffect(() => {
    if (!profile || profile.role !== "executor") return;
    myAwards.forEach((a) => {
      if (!subs.some((s) => s.id === a.submissionId)) store.ensureAwardRows(a.contestId);
    });
  }, [profile?.id, myAwards.length, subs.length]);

  const rating = useMemo(
    () =>
      computeRating({
        submissions: subs.map(toRatingSubmission),
        awards: myAwards,
      }),
    [subs, myAwards],
  );

  const customerContests: Contest[] = useMemo(
    () =>
      profile?.role === "customer"
        ? store.contests.filter((c) => c.customer_id === profile.id && c.status !== "draft")
        : [],
    [store.contests, profile?.id, profile?.role],
  );
  const customerStats = useMemo(
    () =>
      computeCustomerStats(
        customerContests.map((c) => ({
          status: c.status,
          prizepool: c.prizepool,
          hasWinner: !!c.winner || (c.awards?.length ?? 0) > 0,
        })),
      ),
    [customerContests],
  );

  const chatTarget = useMemo(() => {
    if (!viewer || !profile || isMe) return null;
    const execSubs = viewer.role === "executor" ? mySubs : subs;
    return findChatTarget(viewer, profile, store.contests, execSubs);
  }, [viewer?.id, viewer?.role, profile?.id, store.contests, mySubs, subs]);

  const startChat = async () => {
    if (!chatTarget) return;
    setOpeningChat(true);
    try {
      const conv = await chat.openWith(chatTarget.contestId, chatTarget.executorId);
      navigate(`${MESSAGES_ROUTE}/${conv.id}`);
    } catch {
      showToast({ title: "Не удалось открыть чат", body: "Попробуйте ещё раз чуть позже.", kind: "warning" });
    } finally {
      setOpeningChat(false);
    }
  };

  const canOpenSolution = (s: Submission) => {
    if (!viewer) return false;
    if (viewer.role === "admin" || viewer.id === s.executor_id) return true;
    return contestById.get(s.contest_id)?.customer_id === viewer.id;
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
        <span className="ml-3 text-[13px] text-gray-500">Загрузка профиля…</span>
      </div>
    );
  }

  if (status === "missing" || !profile || !extras) {
    return (
      <div className="min-h-screen bg-gray-950 py-10">
        <div className="mx-auto max-w-md rounded-lg border border-gray-700 bg-gray-900 p-8 text-center">
          <h1 className="mb-2 text-[16px] font-medium text-gray-100">Пользователь не найден</h1>
          <p className="mb-5 text-[13px] text-gray-400">Возможно, ссылка устарела или аккаунт удалён.</p>
          <Link
            to={LEADERBOARD_ROUTE}
            className="inline-flex h-8 items-center rounded-md bg-violet-600 px-4 text-[13px] font-medium text-white hover:bg-violet-500"
          >
            К рейтингу исполнителей
          </Link>
        </div>
      </div>
    );
  }

  const isExecutor = profile.role === "executor";
  const link = safeLink(extras.link);
  const next = nextLevel(rating.score);
  const st = rating.stats;

  // Портфолио: призовые решения (по месту), затем решения со статусом «Победитель» без строки награды.
  const awardedIds = new Set(myAwards.map((a) => a.submissionId));
  const portfolio = [
    ...myAwards
      .map((a) => {
        const sub = subs.find((s) => s.id === a.submissionId);
        const row = store.awardRows[a.contestId]?.find((r) => r.submission_id === a.submissionId);
        const contest = contestById.get(a.contestId);
        return {
          key: `a-${a.contestId}-${a.place}`,
          place: a.place,
          amount: a.amount,
          sub,
          title: sub?.title ?? row?.submission_title ?? "Решение",
          number: sub?.number ?? row?.submission_number ?? null,
          contest,
          contestTitle: contest?.title ?? sub?.contest_title ?? "Конкурс",
          date: a.awardedAt,
        };
      })
      .sort((x, y) => x.place - y.place || y.date.localeCompare(x.date)),
    ...subs
      .filter((s) => s.status === 3 && !awardedIds.has(s.id))
      .map((s) => ({
        key: `w-${s.id}`,
        place: 1,
        amount: 0,
        sub: s as Submission | undefined,
        title: s.title,
        number: s.number as number | null,
        contest: contestById.get(s.contest_id),
        contestTitle: contestById.get(s.contest_id)?.title ?? s.contest_title ?? "Конкурс",
        date: s.updated_at,
      })),
  ];

  const statusLabel = (n: number) => solutionStore.getStatus(n)?.label ?? "";

  return (
    <div className="min-h-screen bg-gray-950 py-6">
      <div className="mx-auto max-w-4xl space-y-5 px-4">
        <div className="animate-fade-in rounded-lg border border-gray-700 bg-gray-900 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <UserAvatar
              login={profile.login}
              color={extras.avatarColor}
              image={extras.avatarImage}
              size={80}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[20px] font-semibold text-gray-100">{profile.login}</h1>
                <span className="rounded-full border border-gray-700 px-2.5 py-0.5 text-[12px] text-gray-300">
                  {ROLE_LABEL[profile.role] ?? profile.role}
                </span>
                {isExecutor && rating.badges.map((b) => (
                  <span
                    key={b.id}
                    title={b.hint}
                    className="rounded-full bg-violet-600/20 px-2.5 py-0.5 text-[12px] font-medium text-violet-300"
                  >
                    {b.label}
                  </span>
                ))}
                {profile.role === "customer" && customerStats.reliable && (
                  <span
                    title="Не менее 80% завершённых конкурсов закончились выбором победителя"
                    className="rounded-full bg-emerald-600/20 px-2.5 py-0.5 text-[12px] font-medium text-emerald-300"
                  >
                    Надёжный заказчик
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-gray-500">На платформе с {formatDate(profile.created_at)}</p>

              {extras.about && (
                <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-gray-300">{extras.about}</p>
              )}
              {extras.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extras.skills.map((s) => (
                    <span key={s} className="rounded-md bg-gray-800 px-2 py-1 text-[12px] text-gray-300">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-flex max-w-full items-center gap-1.5 text-[13px] text-violet-400 hover:underline"
                >
                  <BsGithub className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
              {!extras.about && extras.skills.length === 0 && !link && isMe && (
                <p className="mt-3 text-[13px] text-gray-500">
                  Расскажите о себе, добавьте навыки и ссылку на портфолио в настройках профиля.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {isMe && (
                  <Link
                    to={PROFILE_ROUTE}
                    className="inline-flex h-8 items-center rounded-md border border-gray-700 px-3.5 text-[13px] font-medium text-gray-200 hover:bg-gray-800"
                  >
                    Редактировать профиль
                  </Link>
                )}
                {chatTarget && (
                  <button
                    onClick={startChat}
                    disabled={openingChat}
                    className="inline-flex h-8 items-center rounded-md bg-violet-600 px-4 text-[13px] font-medium text-white hover:bg-violet-500 disabled:opacity-60"
                  >
                    {openingChat ? "Открываем…" : "Написать"}
                  </button>
                )}
              </div>
            </div>

            {isExecutor && (
              <div className="flex flex-shrink-0 items-center gap-4 rounded-lg border border-gray-700 bg-gray-950/60 px-5 py-4 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                <div>
                  <div className="text-[34px] font-bold leading-none tabular-nums text-gray-100">
                    {rating.score.toFixed(1)}
                  </div>
                  <div className="mt-1.5">
                    <StarRating value={rating.score} />
                  </div>
                </div>
                <div className="sm:mt-1">
                  <div className="text-[14px] font-semibold text-violet-300">{rating.level}</div>
                  {next && rating.score > 0 && (
                    <div className="text-[11px] text-gray-500">
                      до уровня «{next.label}» — {(next.min - rating.score).toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {isExecutor ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Решений" value={st.submissions} />
              <StatCard label="Побед" value={st.wins} />
              <StatCard label="Призовых мест" value={st.prizePlaces} />
              <StatCard
                label="Заработано (на руки)"
                value={formatMoney(st.totalNet)}
                hint={`Призы после комиссии платформы (${store.commissionPercent}%). Сумма до комиссии: ${formatMoney(st.totalPrize)}`}
              />
              <StatCard
                label="Средняя оценка"
                value={st.avgReview !== null ? `${st.avgReview.toFixed(1)} / 10` : "—"}
                hint={`Оценённых решений: ${st.reviewsCount}`}
              />
              <StatCard label="Средний балл ИИ" value={st.avgAi !== null ? `${st.avgAi}%` : "—"} />
              <StatCard
                label="Доля успеха"
                value={`${Math.round(st.successRate * 100)}%`}
                hint="Доля решений, получивших призовое место"
              />
              <StatCard label="Уровень" value={rating.level} />
            </div>

            <RatingInfo />

            <section>
              <h2 className="mb-3 text-[15px] font-medium text-gray-100">Портфолио</h2>
              {portfolio.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900 px-4 py-8 text-center text-[13px] text-gray-500">
                  Пока нет призовых работ. Победы и призовые места появятся здесь.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {portfolio.map((p) => {
                    const href = p.sub && canOpenSolution(p.sub)
                      ? `${SOLUTION_ROUTE}/${p.sub.number}`
                      : p.contest
                        ? `${CONTEST_ROUTE}/${p.contest.number}`
                        : null;
                    const body = (
                      <>
                        <div className="relative aspect-[16/9] overflow-hidden bg-gray-800">
                          <PortfolioPreview submission={p.sub} title={p.title} color={extras.avatarColor} />
                          <span className="absolute left-2 top-2">
                            <PlaceMedal place={p.place} />
                          </span>
                        </div>
                        <div className="p-3">
                          <div className="line-clamp-1 text-[14px] font-medium text-gray-100">{p.title}</div>
                          <div className="mt-0.5 line-clamp-1 text-[12px] text-gray-500">«{p.contestTitle}»</div>
                          <div className="mt-2 flex items-center justify-between text-[12px]">
                            <span className="text-gray-500">{p.place} место</span>
                            {p.amount > 0 && (
                              <span className="font-medium tabular-nums text-emerald-400">{formatMoney(p.amount)}</span>
                            )}
                          </div>
                        </div>
                      </>
                    );
                    const cls =
                      "block overflow-hidden rounded-lg border border-gray-700 bg-gray-900 transition-colors hover:border-violet-500";
                    return href ? (
                      <Link key={p.key} to={href} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <div key={p.key} className={cls}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-[15px] font-medium text-gray-100">
                Все решения <span className="text-gray-500">({subs.length})</span>
              </h2>
              {store.submissionsUnavailable && subs.length === 0 ? (
                <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-5 text-[13px] text-gray-400">
                  Список решений виден после входа в аккаунт.
                </div>
              ) : subs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900 px-4 py-8 text-center text-[13px] text-gray-500">
                  Исполнитель пока не отправил ни одного решения.
                </div>
              ) : (
                <div className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                  {subs.map((s) => {
                    const href = canOpenSolution(s)
                      ? `${SOLUTION_ROUTE}/${s.number}`
                      : contestById.get(s.contest_id)
                        ? `${CONTEST_ROUTE}/${contestById.get(s.contest_id)!.number}`
                        : null;
                    const inner = (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] text-gray-100">{s.title}</div>
                          <div className="truncate text-[12px] text-gray-500">
                            «{contestById.get(s.contest_id)?.title ?? s.contest_title ?? "Конкурс"}» ·{" "}
                            {new Date(s.created_at).toLocaleDateString("ru-RU")}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5 text-[12px]">
                          {s.status === 3 && (
                            <span className="rounded bg-green-600 px-2 py-0.5 font-semibold text-white">
                              {statusLabel(3)}
                            </span>
                          )}
                          {s.ai_score != null && (
                            <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-300">ИИ {Math.round(s.ai_score)}%</span>
                          )}
                          {s.avg_score != null && (
                            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-300">★ {s.avg_score}</span>
                          )}
                        </div>
                      </div>
                    );
                    return href ? (
                      <Link key={s.id} to={href} className="block hover:bg-gray-800/60">
                        {inner}
                      </Link>
                    ) : (
                      <div key={s.id}>{inner}</div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : profile.role === "customer" ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Конкурсов" value={customerStats.total} />
              <StatCard label="Активных" value={customerStats.active} />
              <StatCard label="Завершённых" value={customerStats.finished} />
              <StatCard label="Призовой фонд" value={formatMoney(customerStats.totalPrizeFund)} />
              <StatCard
                label="Выбран победитель"
                value={customerStats.winnerShare === null ? "—" : `${Math.round(customerStats.winnerShare * 100)}%`}
                hint="Доля завершённых конкурсов, где заказчик выбрал победителя"
              />
            </div>

            <section>
              <h2 className="mb-3 text-[15px] font-medium text-gray-100">Конкурсы заказчика</h2>
              {customerContests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900 px-4 py-8 text-center text-[13px] text-gray-500">
                  Заказчик пока не опубликовал конкурсов.
                </div>
              ) : (
                <div className="divide-y divide-gray-800 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                  {customerContests.map((c) => (
                    <Link
                      key={c.id}
                      to={`${CONTEST_ROUTE}/${c.number}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] text-gray-100">{c.title}</div>
                        <div className="text-[12px] text-gray-500">
                          до {new Date(c.ends_at).toLocaleDateString("ru-RU")}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
                          c.status === "active"
                            ? "bg-emerald-600/20 text-emerald-300"
                            : c.status === "finished"
                              ? "bg-gray-700 text-gray-300"
                              : "bg-amber-600/20 text-amber-300"
                        }`}
                      >
                        {c.status === "active" ? "Идёт приём" : c.status === "finished" ? "Завершён" : "Отменён"}
                      </span>
                      <span className="flex-shrink-0 text-[13px] font-medium tabular-nums text-gray-200">
                        {formatMoney(c.prizepool)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <BsTrophy className="h-3.5 w-3.5" />
          <Link to={LEADERBOARD_ROUTE} className="hover:text-violet-400 hover:underline">
            Рейтинг исполнителей
          </Link>
        </div>
      </div>
    </div>
  );
};

export default observer(PublicProfilePage);
