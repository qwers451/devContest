import React, { useEffect, useContext, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Context } from "../context";
import { observer } from "mobx-react-lite";
import Markdown from "markdown-to-jsx";
import ConfirmationModal from "../components/ConfirmationModal";
import ChangeSolutionStatusModal from "../components/ChangeSolutionStatusModal";
import {
  downloadFileOrZip,
  sendData,
  deleteData,
  fetchData,
} from "../services/apiService.js";
import { BsCpu, BsTrophy } from "react-icons/bs";

const EvaluationSection = ({
  canShow,
  isLoading,
  evaluation,
  shouldHaveEvaluation,
  evaluationUnavailable,
  evalError,
  canManageEvaluation,
  evalTriggering,
  onTrigger,
}) => {
  if (!canShow) {
    return null;
  }

  const showLoadingState = isLoading || (!evaluation && shouldHaveEvaluation);
  if (showLoadingState) {
    return (
      <>
        <hr className="my-5 border-gray-100 dark:border-gray-700" />
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-900/10 px-5 py-4 flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <BsCpu className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-violet-800 dark:text-violet-300 text-sm">
              Автоматическая оценка ИИ
            </p>
            {evalError ? (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                {evalError}
              </p>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 rounded-full border-2 border-violet-300 dark:border-violet-700 border-t-violet-600 dark:border-t-violet-400 animate-spin flex-shrink-0" />
                <p className="text-xs text-violet-500 dark:text-violet-400">
                  {isLoading
                    ? "Загружается…"
                    : evaluationUnavailable
                      ? "Оценка не найдена. Нажмите «Оценить» для запуска."
                      : "Оценка выполняется"}
                </p>
              </div>
            )}
          </div>
          {canManageEvaluation && !isLoading && !evalTriggering && (
            <button
              onClick={onTrigger}
              disabled={evalTriggering}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex-shrink-0"
            >
              {evalTriggering ? (
                <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <BsCpu className="w-3.5 h-3.5" />
              )}
              Оценить
            </button>
          )}
        </div>
      </>
    );
  }

  if (!evaluation) {
    return null;
  }

  const score = evaluation.compliance_score;
  const isHigh = score >= 80;
  const isMid = score >= 50;
  const scoreColor = isHigh
    ? "text-emerald-600 dark:text-emerald-400"
    : isMid
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  const scoreBg = isHigh
    ? "bg-emerald-500"
    : isMid
      ? "bg-amber-500"
      : "bg-red-500";
  const borderColor = isHigh
    ? "border-emerald-200 dark:border-emerald-800"
    : isMid
      ? "border-amber-200 dark:border-amber-800"
      : "border-red-200 dark:border-red-800";
  const bgColor = isHigh
    ? "bg-emerald-50/50 dark:bg-emerald-900/10"
    : isMid
      ? "bg-amber-50/50 dark:bg-amber-900/10"
      : "bg-red-50/50 dark:bg-red-900/10";
  const trackColor = isHigh
    ? "bg-emerald-100 dark:bg-emerald-900/30"
    : isMid
      ? "bg-amber-100 dark:bg-amber-900/30"
      : "bg-red-100 dark:bg-red-900/30";

  return (
    <>
      <hr className="my-5 border-gray-100 dark:border-gray-700" />
      <div
        className={`rounded-2xl border ${borderColor} ${bgColor} overflow-hidden`}
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center">
            <BsCpu className="w-7 h-7 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                Оценка ИИ · соответствие ТЗ
              </p>
              <button
                onClick={onTrigger}
                disabled={evalTriggering || isLoading}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 text-xs text-gray-500 dark:text-gray-400 font-medium transition-colors flex-shrink-0"
              >
                {evalTriggering ? (
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
                ) : (
                  "↻"
                )}
                Переоценить
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className={`text-3xl font-black ${scoreColor}`}>
                {score}%
              </div>
              <div className="flex-1">
                <div
                  className={`h-2.5 rounded-full ${trackColor} overflow-hidden`}
                >
                  <div
                    className={`h-full rounded-full ${scoreBg} transition-all duration-700`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {evaluation.critical_issues ? (
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      ⚠ Критические нарушения
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Критических нарушений нет
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {evaluation.passed_requirements.length} вып. ·{" "}
                    {evaluation.failed_requirements.length} не вып.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {evaluation.requirements_detail?.length > 0 ? (
          <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 space-y-2">
            {evaluation.requirements_detail.map((req, index) => {
              const isGood = req.score >= 70;
              const isMidReq = req.score === 50;
              const scoreCls = isGood
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                : isMidReq
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
              return (
                <div key={index} className="flex items-start gap-2">
                  <span
                    className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-5 rounded text-xs font-bold tabular-nums ${scoreCls}`}
                  >
                    {req.score}
                  </span>
                  {req.is_critical && (
                    <span
                      className="flex-shrink-0 inline-flex items-center justify-center w-4 h-5 text-xs font-bold text-red-500 dark:text-red-400"
                      title="Критическое требование"
                    >
                      !
                    </span>
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    {req.text}
                    {req.comment && (
                      <span className="text-gray-400 dark:text-gray-500">
                        {" "}
                        — {req.comment}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : evaluation.passed_requirements.length > 0 ||
          evaluation.failed_requirements.length > 0 ? (
          <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 grid gap-2 sm:grid-cols-2">
            {evaluation.passed_requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                  Выполнено
                </p>
                <ul className="space-y-1">
                  {evaluation.passed_requirements.map((requirement, index) => (
                    <li
                      key={index}
                      className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5 leading-relaxed"
                    >
                      <span className="text-emerald-500 flex-shrink-0 font-bold mt-px">
                        ✓
                      </span>
                      {requirement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evaluation.failed_requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5">
                  Не выполнено
                </p>
                <ul className="space-y-1">
                  {evaluation.failed_requirements.map((requirement, index) => (
                    <li
                      key={index}
                      className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5 leading-relaxed"
                    >
                      <span className="text-red-400 flex-shrink-0 font-bold mt-px">
                        ✗
                      </span>
                      {requirement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
        <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Оценка сформирована автоматически · Окончательное решение принимает
            заказчик
          </p>
        </div>
      </div>
    </>
  );
};

const MilestonesSection = ({
  hasMilestones,
  canManage,
  totalMilestonePaid,
  escrowRemaining,
  milestoneError,
  prizeStages,
  paidStageIds,
  milestoneLoading,
  isContestActive,
  onPay,
  allMilestonesPaid,
  formatMoney,
}) => {
  if (!hasMilestones || !canManage) {
    return null;
  }

  return (
    <>
      <hr className="my-5 border-gray-100 dark:border-gray-700" />
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">
          Поэтапная выплата
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Выплачено:{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {formatMoney(totalMilestonePaid)}
            </span>
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            Остаток эскроу:{" "}
            <span
              className={`font-semibold ${escrowRemaining > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}
            >
              {formatMoney(escrowRemaining)}
            </span>
          </span>
        </div>
      </div>
      {milestoneError && (
        <p className="text-sm text-red-500 mb-2">{milestoneError}</p>
      )}
      <div className="space-y-2">
        {prizeStages.map((stage) => {
          const paid = paidStageIds.has(stage.id);
          const loading = milestoneLoading === stage.id;
          return (
            <div
              key={stage.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">
                  {stage.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatMoney(stage.prize_amount)}
                </p>
              </div>
              {paid ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  ✓ Выплачено
                </span>
              ) : isContestActive ? (
                <button
                  onClick={() => onPay(stage)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors"
                >
                  {loading ? (
                    <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    "💸"
                  )}
                  Выплатить
                </button>
              ) : (
                <span className="text-xs text-gray-400">
                  Конкурс не активен
                </span>
              )}
            </div>
          );
        })}
      </div>
      {allMilestonesPaid && (
        <p className="mt-2 text-xs text-emerald-600 font-medium">
          Все этапы оплачены. Выберите победителя для завершения конкурса.
        </p>
      )}
    </>
  );
};

const FilesSection = ({
  hasFiles,
  canUpload,
  uploadingFiles,
  onUpload,
  files,
  onDownload,
  canEditFiles,
  onDelete,
  onDownloadAll,
  downloadAllClassName,
}) => {
  if (!hasFiles && !canUpload) {
    return null;
  }

  return (
    <>
      <hr className="my-5 border-gray-100 dark:border-gray-700" />
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">
          Файлы
        </h3>
        {canUpload && (
          <label
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer ${uploadingFiles ? "opacity-50 pointer-events-none" : ""}`}
          >
            {uploadingFiles ? "Загрузка..." : "↑ Добавить файлы"}
            <input
              type="file"
              multiple
              className="hidden"
              accept=".zip,.png,.jpg,.jpeg,.gif,.pdf,.docx"
              onChange={onUpload}
            />
          </label>
        )}
      </div>
      {hasFiles ? (
        <>
          <ul className="space-y-1 mb-3">
            {files.map((fileName, index) => (
              <li key={index} className="flex items-center gap-2">
                <button
                  onClick={() => onDownload(fileName)}
                  className="text-violet-600 hover:text-violet-800 text-sm font-medium hover:underline"
                >
                  {fileName}
                </button>
                {canEditFiles && (
                  <button
                    onClick={() => onDelete(fileName)}
                    className="text-red-400 hover:text-red-600 text-xs transition-colors"
                    title="Удалить файл"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={onDownloadAll} className={downloadAllClassName}>
            Скачать всё
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Файлы не прикреплены.
        </p>
      )}
    </>
  );
};

const ReviewsSection = ({ reviews, avgScore, solutionNumber, navigate }) => {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <>
      <hr className="my-0 border-gray-100 dark:border-gray-700" />
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">
            Отзывы ({reviews.length})
            {avgScore != null && (
              <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                ★ ср. {avgScore}
              </span>
            )}
          </h3>
          <button
            onClick={() => navigate(`/solution/${solutionNumber}/reviews`)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium transition-colors"
          >
            Все отзывы →
          </button>
        </div>
        <div className="space-y-2">
          {reviews.slice(0, 3).map((review) => (
            <div
              key={review.id}
              onClick={() =>
                navigate(`/solution/${solutionNumber}/review/${review.number}`)
              }
              className="cursor-pointer rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold text-xs">
                  {review.score} / 10
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(review.created_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {review.files?.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    📎 {review.files.length}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {review.commentary}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const StatusHistorySection = ({ statusLog, getStatus }) => {
  if (statusLog.length === 0) {
    return null;
  }

  return (
    <>
      <hr className="my-0 border-gray-100 dark:border-gray-700" />
      <div className="px-6 py-5">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-3">
          История статусов
        </h3>
        <div className="space-y-1">
          {statusLog.map((log) => {
            const fromStatus = getStatus(log.old_status);
            const toStatus = getStatus(log.new_status);
            return (
              <div
                key={log.id}
                className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
              >
                <span className="text-gray-300 dark:text-gray-600 font-mono">
                  {new Date(log.changed_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {log.old_status != null && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      {fromStatus?.label || log.old_status}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">→</span>
                  </>
                )}
                <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold">
                  {toStatus?.label || log.new_status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

const SolutionPage = () => {
  const { solution, contest, user, payment } = useContext(Context);
  const { number } = useParams();
  const [currentSolution, setCurrentSolution] = useState(null);
  const [currentContest, setCurrentContest] = useState(null);
  const [freelancer, setFreelancer] = useState(null);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [milestoneLoading, setMilestoneLoading] = useState(null);
  const [milestoneError, setMilestoneError] = useState("");
  const [evalTriggering, setEvalTriggering] = useState(false);
  const [evalTriggerKey, setEvalTriggerKey] = useState(0);
  const [evalError, setEvalError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [statusLog, setStatusLog] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadPageData = async () => {
      try {
        const sol = await solution.fetchSolutionByNumber(number);
        if (!sol) {
          setError("Решение не найдено.");
          return;
        }
        setCurrentSolution(sol);

        const fetchedContest = await contest.fetchOneContestById(
          sol.contest_id,
        );
        setCurrentContest(fetchedContest);

        const uid = user.user?.id;
        const role = user.user?.role;
        const allowed =
          role === "admin" ||
          sol.executor_id === uid ||
          fetchedContest?.customer_id === uid;
        if (!allowed) {
          navigate(`/contest/${fetchedContest?.number ?? ""}`);
          return;
        }

        const hasPrizeStages = fetchedContest?.stages?.some(
          (s) => s.prize_amount > 0,
        );
        if (hasPrizeStages) {
          await payment.fetchMilestones(sol.contest_id);
        }

        solution.fetchEvaluation(sol.id);

        fetchData(`/submissions/${sol.id}/reviews`)
          .then(setReviews)
          .catch(() => {});
        fetchData(`/submissions/${sol.id}/status-log`)
          .then(setStatusLog)
          .catch(() => {});

        const [execUser] = await Promise.all([
          user.fetchUserById(sol.executor_id),
          fetchedContest?.customer_id
            ? user.fetchUserById(fetchedContest.customer_id)
            : Promise.resolve(null),
        ]);
        setFreelancer(execUser);
      } catch (err) {
        console.error(err);
        setError(err.message);
      }
    };
    loadPageData();
  }, [number]);

  const shouldHaveEvaluation = !!(
    currentContest?.tz_text && currentSolution?.description
  );
  useEffect(() => {
    if (!shouldHaveEvaluation || solution.evaluation) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;
    const intervalId = setInterval(async () => {
      if (solution.evaluation) {
        clearInterval(intervalId);
        return;
      }
      attempts++;
      const found = await solution.fetchEvaluation(currentSolution.id);
      if (found || attempts >= MAX_ATTEMPTS) {
        clearInterval(intervalId);
        if (!found) solution.markEvaluationUnavailable();
      }
    }, 6000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldHaveEvaluation, currentSolution?.id, evalTriggerKey]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 text-red-500">{error}</div>
    );
  }

  if (!currentSolution || !currentContest) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
      </div>
    );
  }

  const handleTriggerEval = async () => {
    setEvalTriggering(true);
    setEvalError(null);
    try {
      await solution.triggerEvaluation(currentSolution.id);
      setEvalTriggerKey((k) => k + 1);
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || "Ошибка запуска оценки";
      setEvalError(msg);
    } finally {
      setEvalTriggering(false);
    }
  };

  const isAdmin = user.user?.role === "admin";
  const isOwner = user.user?.id === currentSolution.executor_id;
  const isExecutor = user.user?.id === currentSolution.executor_id;
  const isEmployer = user.user?.role === "customer";
  const isContestOwner = user.user?.id === currentContest?.customer_id;
  const isContestActive = currentContest?.status === "active";
  const isCreated = currentSolution.created_at === currentSolution.updated_at;
  const canManageSolution = isOwner || isAdmin;
  const canManageEvaluation = isAdmin || isContestOwner;
  const canShowEvaluationSection =
    solution.evaluation ||
    solution.evaluationLoading ||
    (shouldHaveEvaluation &&
      (!solution.evaluationUnavailable || canManageEvaluation));
  const contestRoute = `/contest/${currentContest.number}`;
  const contestSolutionsRoute = `${contestRoute}/solutions`;
  const currentCustomer = user.getById(currentContest.customer_id);
  const hasAttachedFiles = currentSolution.files?.length > 0;
  const canEditFiles = isExecutor || isAdmin;

  const prizeStages = (currentContest?.stages || []).filter(
    (s) => s.prize_amount > 0,
  );
  const hasMilestones = prizeStages.length > 0;
  const paidStageIds = new Set(
    (payment.milestones || [])
      .filter((m) => m.executor_id === currentSolution.executor_id)
      .map((m) => m.stage_id),
  );
  const allMilestonesPaid =
    hasMilestones && prizeStages.every((s) => paidStageIds.has(s.id));
  const totalMilestonePaid = (payment.milestones || []).reduce(
    (sum, m) => sum + m.amount,
    0,
  );
  const escrowRemaining = (currentContest?.prizepool || 0) - totalMilestonePaid;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const formatMoney = (amount) => `${Number(amount).toLocaleString("ru-RU")} ₽`;
  const refreshStatusLog = () =>
    fetchData(`/submissions/${currentSolution.id}/status-log`)
      .then(setStatusLog)
      .catch(() => {});
  const downloadSubmissionFile = (fileName) =>
    downloadFileOrZip(
      `/submissions/${currentSolution.id}/files/${fileName}`,
      fileName,
    );
  const uploadSubmissionFiles = async (selectedFiles) => {
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));
    return sendData(`/submissions/${currentSolution.id}/files`, formData, true);
  };
  const winnerConfirmText = hasMilestones
    ? "Завершить конкурс"
    : "Выбрать победителем";
  const winnerConfirmMessage = hasMilestones
    ? `Конкурс завершится. ${allMilestonesPaid ? "Все поэтапные выплаты уже произведены." : `Оставшиеся средства (${currentContest.prizepool} руб.) будут выплачены исполнителю.`} Действие необратимо.`
    : `Вы уверены, что хотите выбрать это решение победителем? Конкурс завершится, а приз (${currentContest.prizepool} руб.) будет начислен исполнителю. Действие необратимо.`;

  const handleDelete = async () => {
    try {
      navigate("/");
      await solution.deleteSolutionById(currentSolution.id);
    } catch (error) {
      console.error("Ошибка удаления:", error);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      if (solution.currentSolution.status === newStatus) return;
      const updatedSolution = await solution.updateSolutionStatus(
        currentSolution.id,
        newStatus,
      );
      setCurrentSolution(updatedSolution);
      refreshStatusLog();
    } catch (error) {
      console.error("Ошибка изменения статуса:", error);
    }
  };

  const handleMilestonePayment = async (stage) => {
    setMilestoneError("");
    setMilestoneLoading(stage.id);
    try {
      await solution.selectWinner(
        currentContest.id,
        currentSolution.id,
        currentSolution.executor_id,
        stage.id,
      );
      await payment.fetchMilestones(currentContest.id);
    } catch (err) {
      setMilestoneError(
        "Ошибка выплаты: " + (err?.response?.data?.detail || err.message),
      );
    } finally {
      setMilestoneLoading(null);
    }
  };

  const handleSelectWinner = async () => {
    try {
      const updatedContest = await solution.selectWinner(
        currentContest.id,
        currentSolution.id,
        currentSolution.executor_id,
      );

      contest.setCurrentContest(updatedContest);

      const updatedSol = { ...currentSolution, status: 3 };
      solution.setCurrentSolution(updatedSol);

      navigate(`/contest/${updatedContest.number}`);
    } catch (error) {
      console.error("Ошибка выбора победителя:", error);
      alert(
        "Не удалось выбрать победителя: " +
          (error?.response?.data?.detail || error.message),
      );
    }
  };

  const handleDownloadAll = async () => {
    for (const fileName of currentSolution.files) {
      await downloadSubmissionFile(fileName);
    }
  };

  const handleDeleteFile = async (fileName) => {
    try {
      const updated = await deleteData(
        `/submissions/${currentSolution.id}/files/${fileName}`,
      );
      setCurrentSolution(updated);
    } catch (err) {
      alert("Ошибка удаления файла");
    }
  };

  const handleUploadFiles = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setUploadingFiles(true);
    try {
      const updated = await uploadSubmissionFiles(selected);
      setCurrentSolution(updated);
    } catch (err) {
      alert(err?.response?.data?.detail || "Ошибка загрузки файлов");
    } finally {
      setUploadingFiles(false);
      e.target.value = "";
    }
  };

  const statusInfo = solution.getStatus(solution.currentSolution.status);

  const btnPrimary =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors";
  const btnSecondary =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors";
  const btnDanger =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors";
  const btnWarning =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors";
  const btnSuccess =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
      <div className="max-w-4xl mx-auto px-4">
        <nav className="flex items-center gap-2 mb-4 text-sm">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            ← Назад
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <button
            onClick={() => navigate(contestSolutionsRoute)}
            className="text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            Решения
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-xs">
            {currentSolution.title || "Без названия"}
          </span>
        </nav>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight mb-1">
                  {currentSolution.title || "Без названия"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Конкурс «{currentContest.title}» от{" "}
                  <span className="font-medium text-violet-600 dark:text-violet-400">
                    @{currentCustomer?.login || "Неизвестно"}
                  </span>
                </p>
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
                  style={{
                    color: statusInfo?.textColor,
                    backgroundColor: statusInfo?.color,
                  }}
                >
                  {statusInfo?.label}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  {freelancer?.login || "Неизвестный фрилансер"}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Создано: {formatDate(currentSolution.created_at)}
                </p>
                {!isCreated && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Обновлено: {formatDate(currentSolution.updated_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-3">
              Описание
            </h2>
            <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
              <Markdown options={{ disableParsingRawHTML: true }}>
                {currentSolution.description}
              </Markdown>
            </div>

            <EvaluationSection
              canShow={canShowEvaluationSection}
              isLoading={solution.evaluationLoading}
              evaluation={solution.evaluation}
              shouldHaveEvaluation={shouldHaveEvaluation}
              evaluationUnavailable={solution.evaluationUnavailable}
              evalError={evalError}
              canManageEvaluation={canManageEvaluation}
              evalTriggering={evalTriggering}
              onTrigger={handleTriggerEval}
            />

            <MilestonesSection
              hasMilestones={hasMilestones}
              canManage={isContestOwner || isAdmin}
              totalMilestonePaid={totalMilestonePaid}
              escrowRemaining={escrowRemaining}
              milestoneError={milestoneError}
              prizeStages={prizeStages}
              paidStageIds={paidStageIds}
              milestoneLoading={milestoneLoading}
              isContestActive={isContestActive}
              onPay={handleMilestonePayment}
              allMilestonesPaid={allMilestonesPaid}
              formatMoney={formatMoney}
            />

            <FilesSection
              hasFiles={hasAttachedFiles}
              canUpload={isExecutor}
              uploadingFiles={uploadingFiles}
              onUpload={handleUploadFiles}
              files={currentSolution.files || []}
              onDownload={downloadSubmissionFile}
              canEditFiles={canEditFiles}
              onDelete={handleDeleteFile}
              onDownloadAll={handleDownloadAll}
              downloadAllClassName={btnSuccess}
            />
          </div>

          <ReviewsSection
            reviews={reviews}
            avgScore={currentSolution.avg_score}
            solutionNumber={currentSolution.number}
            navigate={navigate}
          />

          <StatusHistorySection
            statusLog={statusLog}
            getStatus={(n) => solution.getStatus(n)}
          />

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-2 justify-between">
              <div className="flex flex-wrap gap-2">
                {(isOwner || isAdmin) && (
                  <>
                    <button
                      onClick={() => navigate(contestRoute)}
                      className={btnSecondary}
                    >
                      К конкурсу
                    </button>
                    <button
                      onClick={() => navigate("/my-solutions")}
                      className={btnPrimary}
                    >
                      Мои решения
                    </button>
                  </>
                )}
                {isEmployer && (
                  <button
                    onClick={() => navigate(contestSolutionsRoute)}
                    className={btnSecondary}
                  >
                    Вернуться к списку решений
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {canManageSolution && (
                  <>
                    <button
                      onClick={() =>
                        navigate(`/solution/${currentSolution.number}/edit`, {
                          state: JSON.parse(JSON.stringify(currentSolution)),
                        })
                      }
                      className={btnSuccess}
                    >
                      Редактировать
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className={btnDanger}
                    >
                      Удалить
                    </button>
                  </>
                )}
                {isEmployer && (
                  <>
                    <button
                      onClick={() => setShowStatusModal(true)}
                      className={btnWarning}
                    >
                      Изменить статус
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `/solution/${currentSolution.number}/create-review`,
                        )
                      }
                      className={btnSuccess}
                    >
                      Оставить отзыв
                    </button>
                    {isContestOwner && isContestActive && (
                      <button
                        onClick={() => setShowWinnerModal(true)}
                        className={btnPrimary}
                      >
                        <BsTrophy className="w-4 h-4" />
                        {winnerConfirmText}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Удаление решения"
        message="Вы уверены, что хотите удалить решение?"
        confirmText="Удалить"
        cancelText="Отмена"
        confirmVariant="danger"
      />

      <ChangeSolutionStatusModal
        show={showStatusModal}
        onHide={() => setShowStatusModal(false)}
        currentStatus={solution.currentSolution.status}
        onSave={handleStatusChange}
      />

      <ConfirmationModal
        show={showWinnerModal}
        onHide={() => setShowWinnerModal(false)}
        onConfirm={handleSelectWinner}
        title="Выбор победителя"
        message={winnerConfirmMessage}
        confirmText={winnerConfirmText}
        cancelText="Отмена"
        confirmVariant="primary"
      />
    </div>
  );
};

export default observer(SolutionPage);
