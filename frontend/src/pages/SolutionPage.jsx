import React, { useEffect, useContext, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Context } from "../main.jsx";
import { observer } from "mobx-react-lite";
import Markdown from "markdown-to-jsx";
import ConfirmationModal from "../components/ConfirmationModal";
import ChangeSolutionStatusModal from "../components/ChangeSolutionStatusModal";
import { downloadFileOrZip } from "../services/apiService.js";

const SolutionPage = () => {
  const { solution, contest, user } = useContext(Context);
  const { number } = useParams();
  const [currentSolution, setCurrentSolution] = useState(null);
  const [currentContest, setCurrentContest] = useState(null);
  const [freelancer, setFreelancer] = useState(null);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        let sol;
        if (
          solution.currentSolution &&
          solution.currentSolution.number == number
        ) {
          sol = solution.currentSolution;
        } else {
          sol = await solution.fetchSolutionByNumber(number);
          if (!sol) {
            setError("Решение не найдено.");
            return;
          }
        }
        setCurrentSolution(sol);

        const fetchedContest = await contest.fetchOneContestById(
          sol.contest_id,
        );
        setCurrentContest(fetchedContest);

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

            {currentSolution.files && currentSolution.files.length > 0 && (
              <>
                <hr className="my-5 border-gray-100" />
                <h3 className="text-base font-bold text-gray-800 mb-2">
                  Файлы
                </h3>
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
                        🏆 Выбрать победителем
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
        message={`Вы уверены, что хотите выбрать это решение победителем? Конкурс завершится, а приз (${currentContest.prizepool} руб.) будет начислен исполнителю. Действие необратимо.`}
        confirmText="Выбрать победителем"
        cancelText="Отмена"
        confirmVariant="primary"
      />
    </div>
  );
};

export default observer(SolutionPage);
