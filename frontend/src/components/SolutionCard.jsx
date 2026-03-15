import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../main.jsx";
import { SOLUTION_ROUTE } from "../utils/consts.js";

const statusStyles = {
  1: {
    bg: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-700 dark:text-sky-300",
  },
  2: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  3: {
    bg: "bg-green-600 dark:bg-green-700",
    text: "text-white dark:text-green-50",
  },
  4: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
  },
  5: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
  },
};

const SolutionCard = observer(
  ({
    solution,
    contestTitle,
    freelancerLogin,
    employerLogin,
    showContestTitle,
    showFreelancerLogin,
  }) => {
    const { solution: solutionContext } = useContext(Context);
    const navigate = useNavigate();

    const status = solutionContext.getStatus(solution.status);
    const style = statusStyles[solution.status] || {
      bg: "bg-gray-100 dark:bg-gray-700",
      text: "text-gray-600 dark:text-gray-300",
    };

    const isCreated = solution.updated_at === solution.created_at;
    const dateLabel = isCreated ? "Добавлено" : "Обновлено";
    const formattedDate = new Date(
      isCreated ? solution.created_at : solution.updated_at,
    ).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const score = solution.ai_score;
    const hasAiScore = score != null;
    const aiColor = score >= 80
      ? { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", track: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-emerald-200 dark:border-emerald-800" }
      : score >= 50
      ? { bar: "bg-amber-400", text: "text-amber-700 dark:text-amber-400", track: "bg-amber-100 dark:bg-amber-900/30", border: "border-amber-200 dark:border-amber-800" }
      : { bar: "bg-red-500", text: "text-red-700 dark:text-red-400", track: "bg-red-100 dark:bg-red-900/30", border: "border-red-200 dark:border-red-800" };

    return (
      <div
        onClick={() => {
          if (window.getSelection()?.toString().length > 0) return;
          solutionContext.setCurrentSolution(solution);
          navigate(SOLUTION_ROUTE + "/" + solution.number);
        }}
        className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-500 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden animate-fade-in"
      >
        <div className="flex items-stretch">
          {/* Left: main content */}
          <div className="flex-1 px-5 py-4 min-w-0">
            {/* Status + number + avg score */}
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
              >
                {status?.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                #{solution.number}
              </span>
              {solution.avg_score != null && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Средняя оценка отзывов">
                  ★ {solution.avg_score}
                </span>
              )}
              {solution.critical_issues && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title="ИИ выявил критические нарушения ТЗ">
                  ⚠ критические нарушения
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-snug line-clamp-1 mb-1.5 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
              {solution.title || "Без названия"}
            </h3>

            {/* Annotation */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
              {solution.annotation || "Без аннотации"}
            </p>

            {/* Last review preview */}
            {solution.last_review && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-1 italic">
                «{solution.last_review.commentary?.slice(0, 80)}{solution.last_review.commentary?.length > 80 ? '…' : ''}»
              </p>
            )}

            {/* Contest info */}
            {showContestTitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 truncate">
                Конкурс: «{contestTitle || "Неизвестный конкурс"}»
                {employerLogin && (
                  <span className="ml-1">от @{employerLogin}</span>
                )}
              </p>
            )}

            {/* AI score bar */}
            {hasAiScore && (
              <div className={`mt-3 rounded-lg border ${aiColor.border} px-3 py-2 flex items-center gap-3`}>
                <svg className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${aiColor.text}`}>{score}%</span>
                    {solution.critical_issues && (
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                        ⚠ критические проблемы
                      </span>
                    )}
                  </div>
                  <div className={`h-1.5 rounded-full ${aiColor.track} overflow-hidden`}>
                    <div
                      className={`h-full rounded-full ${aiColor.bar} transition-all duration-300`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: meta */}
          <div className="flex-shrink-0 w-40 border-l border-gray-100 dark:border-gray-700 px-4 py-4 flex flex-col items-end justify-between">
            {showFreelancerLogin && freelancerLogin && (
              <div className="text-xs text-violet-600 dark:text-violet-400 font-medium truncate max-w-[140px]">
                @{freelancerLogin}
              </div>
            )}
            {!showFreelancerLogin && <div />}
            <div className="text-right">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {dateLabel}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                {formattedDate}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default SolutionCard;
