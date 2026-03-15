import React, { useEffect, useContext, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Context } from "../main.jsx";
import { observer } from "mobx-react-lite";
import Markdown from "markdown-to-jsx";
import ConfirmationModal from "../components/ConfirmationModal";
import ChangeSolutionStatusModal from "../components/ChangeSolutionStatusModal";
import { downloadFileOrZip, sendData } from "../services/apiService.js";

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
  const [milestoneError, setMilestoneError] = useState('');
  const [evalTriggering, setEvalTriggering] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
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

        // Load milestones if contest has stages with individual prizes
        const hasPrizeStages = fetchedContest?.stages?.some(s => s.prize_amount > 0);
        if (hasPrizeStages) {
          await payment.fetchMilestones(sol.contest_id);
        }

        // Load AI evaluation (non-blocking — may return 404 if not yet evaluated)
        solution.fetchEvaluation(sol.id);

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
    fetchData();
  }, [number]);

  // Poll for evaluation result every 6s (max 20 attempts ≈ 2 min)
  // Must be before any conditional returns (Rules of Hooks)
  const shouldHaveEvaluation = !!(currentContest?.tz_text && currentSolution?.description);
  useEffect(() => {
    if (!shouldHaveEvaluation || solution.evaluation || solution.evaluationUnavailable) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const intervalId = setInterval(async () => {
      if (solution.evaluation) { clearInterval(intervalId); return; }
      attempts++;
      const found = await solution.fetchEvaluation(currentSolution.id);
      if (found || attempts >= MAX_ATTEMPTS) {
        clearInterval(intervalId);
        if (!found) solution.markEvaluationUnavailable();
      }
    }, 6000);
    return () => clearInterval(intervalId);
  }, [shouldHaveEvaluation, currentSolution?.id]);

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

  const isAdmin = user.user?.role === "admin";
  const isOwner = user.user?.id === currentSolution.executor_id;
  const isEmployer = user.user?.role === "customer";
  const isContestOwner = user.user?.id === currentContest?.customer_id;
  const isContestActive = currentContest?.status === "active";
  const isCreated = currentSolution.created_at === currentSolution.updated_at;

  const prizeStages = (currentContest?.stages || []).filter(s => s.prize_amount > 0);
  const hasMilestones = prizeStages.length > 0;
  // Track which stages have been paid to THIS specific executor
  const paidStageIds = new Set(
    (payment.milestones || [])
      .filter(m => m.executor_id === currentSolution.executor_id)
      .map(m => m.stage_id)
  );
  const allMilestonesPaid = hasMilestones && prizeStages.every(s => paidStageIds.has(s.id));
  // Escrow balance: total paid across ALL executors for all milestones
  const totalMilestonePaid = (payment.milestones || []).reduce((sum, m) => sum + m.amount, 0);
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
    } catch (error) {
      console.error("Ошибка изменения статуса:", error);
    }
  };

  const handleMilestonePayment = async (stage) => {
    setMilestoneError('');
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
      setMilestoneError('Ошибка выплаты: ' + (err?.response?.data?.detail || err.message));
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

      // Обновляем данные конкурса в ContestStore
      contest.setCurrentContest(updatedContest);

      // Обновляем локальное состояние решения (если API не возвращает обновленное решение)
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
      await downloadFileOrZip(
        `/submissions/${currentSolution.id}/files/${fileName}`,
        fileName,
      );
    }
  };

  const isExecutor = user.user?.id === currentSolution?.executor_id;

  const handleUploadFiles = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      selected.forEach(f => formData.append('files', f));
      const updated = await sendData(`/submissions/${currentSolution.id}/files`, formData, true);
      setCurrentSolution(updated);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Ошибка загрузки файлов');
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  const statusInfo = solution.getStatus(solution.currentSolution.status);

  const btnPrimary =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors";
  const btnSecondary =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors";
  const btnDanger =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors";
  const btnInfo =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-colors";
  const btnWarning =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors";
  const btnSuccess =
    "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors";

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-1">
                  {currentSolution.title || "Без названия"}
                </h1>
                <p className="text-sm text-gray-500 mb-2">
                  Конкурс «{currentContest.title}» от{" "}
                  <span className="font-medium text-violet-600">
                    @
                    {user.getById(currentContest.customer_id)?.login ||
                      "Неизвестно"}
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
                <p className="font-semibold text-gray-700">
                  {freelancer?.login || "Неизвестный фрилансер"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Создано: {formatDate(currentSolution.created_at)}
                </p>
                {!isCreated && (
                  <p className="text-xs text-gray-400">
                    Обновлено: {formatDate(currentSolution.updated_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Описание</h2>
            <div className="prose prose-sm max-w-none text-gray-700">
              <Markdown options={{ disableParsingRawHTML: true }}>
                {currentSolution.description}
              </Markdown>
            </div>

            {/* AI Evaluation section */}
            {(solution.evaluation || solution.evaluationLoading || (shouldHaveEvaluation && !solution.evaluationUnavailable)) && (
              <>
                <hr className="my-5 border-gray-100" />
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-base font-bold text-gray-800">Автоматическая оценка ИИ</h3>
                  <button
                    onClick={async () => {
                      setEvalTriggering(true);
                      try {
                        await solution.triggerEvaluation(currentSolution.id);
                      } catch { /* ignore */ } finally {
                        setEvalTriggering(false);
                      }
                    }}
                    disabled={evalTriggering || solution.evaluationLoading}
                    title="Запустить оценку заново"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs text-gray-500 font-medium transition-colors"
                  >
                    {evalTriggering ? (
                      <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
                    ) : '↻'}
                    Оценить
                  </button>
                </div>
                {(solution.evaluationLoading || (!solution.evaluation && shouldHaveEvaluation)) ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                    {solution.evaluationLoading ? 'Загружается…' : 'Оценка в процессе, проверяем каждые 6 сек…'}
                  </div>
                ) : solution.evaluation && (
                  <div className="space-y-3">
                    {/* Score row */}
                    <div className="flex items-center gap-4">
                      <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                        solution.evaluation.compliance_score >= 80 ? 'bg-emerald-500' :
                        solution.evaluation.compliance_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`}>
                        {solution.evaluation.compliance_score}%
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Соответствие требованиям ТЗ</p>
                        {solution.evaluation.critical_issues ? (
                          <p className="text-xs text-red-600 font-semibold mt-0.5">⚠ Обнаружены критические нарушения</p>
                        ) : (
                          <p className="text-xs text-emerald-600 mt-0.5">Критических нарушений нет</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {solution.evaluation.passed_requirements.length} выполнено · {solution.evaluation.failed_requirements.length} не выполнено
                        </p>
                      </div>
                    </div>

                    {/* Requirements lists */}
                    {solution.evaluation.passed_requirements.length > 0 && (
                      <div className="bg-emerald-50 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-emerald-700 mb-2">Выполненные требования</p>
                        <ul className="space-y-1">
                          {solution.evaluation.passed_requirements.map((r, i) => (
                            <li key={i} className="text-xs text-gray-700 flex gap-2">
                              <span className="text-emerald-500 flex-shrink-0 font-bold">✓</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {solution.evaluation.failed_requirements.length > 0 && (
                      <div className="bg-red-50 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-red-600 mb-2">Невыполненные требования</p>
                        <ul className="space-y-1">
                          {solution.evaluation.failed_requirements.map((r, i) => (
                            <li key={i} className="text-xs text-gray-700 flex gap-2">
                              <span className="text-red-400 flex-shrink-0 font-bold">✗</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">Оценка сформирована автоматически · Окончательное решение принимает заказчик</p>
                  </div>
                )}
              </>
            )}

            {/* Milestone payments section */}
            {hasMilestones && (isContestOwner || isAdmin) && (
              <>
                <hr className="my-5 border-gray-100" />
                <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                  <h3 className="text-base font-bold text-gray-800">Поэтапная выплата</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500">
                      Выплачено: <span className="font-semibold text-gray-700">{totalMilestonePaid.toLocaleString('ru-RU')} ₽</span>
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-500">
                      Остаток эскроу: <span className={`font-semibold ${escrowRemaining > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{escrowRemaining.toLocaleString('ru-RU')} ₽</span>
                    </span>
                  </div>
                </div>
                {milestoneError && (
                  <p className="text-sm text-red-500 mb-2">{milestoneError}</p>
                )}
                <div className="space-y-2">
                  {prizeStages.map(stage => {
                    const paid = paidStageIds.has(stage.id);
                    const loading = milestoneLoading === stage.id;
                    return (
                      <div key={stage.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">{stage.name}</p>
                          <p className="text-xs text-gray-500">{stage.prize_amount.toLocaleString('ru-RU')} ₽</p>
                        </div>
                        {paid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            ✓ Выплачено
                          </span>
                        ) : isContestActive ? (
                          <button
                            onClick={() => handleMilestonePayment(stage)}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors"
                          >
                            {loading ? (
                              <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : '💸'}
                            Выплатить
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Конкурс не активен</span>
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
            )}

            {(currentSolution.files?.length > 0 || isExecutor) && (
              <>
                <hr className="my-5 border-gray-100" />
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-base font-bold text-gray-800">Файлы</h3>
                  {isExecutor && (
                    <label className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 font-medium transition-colors cursor-pointer ${uploadingFiles ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingFiles ? 'Загрузка...' : '↑ Добавить файлы'}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept=".zip,.png,.jpg,.jpeg,.gif,.pdf,.docx"
                        onChange={handleUploadFiles}
                      />
                    </label>
                  )}
                </div>
                {currentSolution.files?.length > 0 ? (
                  <>
                    <ul className="space-y-1 mb-3">
                      {currentSolution.files.map((fileName, index) => (
                        <li key={index}>
                          <button
                            onClick={() =>
                              downloadFileOrZip(
                                `/submissions/${currentSolution.id}/files/${fileName}`,
                                fileName,
                              )
                            }
                            className="text-violet-600 hover:text-violet-800 text-sm font-medium hover:underline"
                          >
                            {fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button onClick={handleDownloadAll} className={btnSuccess}>
                      Скачать всё
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Файлы не прикреплены.</p>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex flex-wrap gap-2 justify-between">
              {/* Navigation buttons */}
              <div className="flex flex-wrap gap-2">
                {(isOwner || isAdmin) && (
                  <>
                    <button
                      onClick={() =>
                        navigate(`/contest/${currentContest.number}`)
                      }
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
                    onClick={() =>
                      navigate(`/contest/${currentContest.number}/solutions`)
                    }
                    className={btnSecondary}
                  >
                    Вернуться к списку решений
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {(isOwner || isAdmin) && (
                  <>
                    <button
                      onClick={() =>
                        navigate(`/solution/${currentSolution.number}/reviews`)
                      }
                      className={btnInfo}
                    >
                      Отзывы
                    </button>
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
                      onClick={() =>
                        navigate(`/solution/${currentSolution.number}/reviews`)
                      }
                      className={btnInfo}
                    >
                      Отзывы
                    </button>
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
                        🏆 {hasMilestones ? 'Завершить конкурс' : 'Выбрать победителем'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
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
        message={
          hasMilestones
            ? `Конкурс завершится. ${allMilestonesPaid ? 'Все поэтапные выплаты уже произведены.' : `Оставшиеся средства (${currentContest.prizepool} руб.) будут выплачены исполнителю.`} Действие необратимо.`
            : `Вы уверены, что хотите выбрать это решение победителем? Конкурс завершится, а приз (${currentContest.prizepool} руб.) будет начислен исполнителю. Действие необратимо.`
        }
        confirmText={hasMilestones ? 'Завершить конкурс' : 'Выбрать победителем'}
        cancelText="Отмена"
        confirmVariant="primary"
      />
    </div>
  );
};

export default observer(SolutionPage);
