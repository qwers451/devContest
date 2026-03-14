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
            {/* Status + number */}
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
              >
                {status?.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                #{solution.number}
              </span>
            </div>

            {/* Title */}
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-snug line-clamp-1 mb-1.5 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
              {solution.title || "Без названия"}
            </h3>

            {/* Annotation */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
              {solution.annotation || "Без аннотации"}
            </p>

            {/* Contest info */}
            {showContestTitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 truncate">
                Конкурс: «{contestTitle || "Неизвестный конкурс"}»
                {employerLogin && (
                  <span className="ml-1">от @{employerLogin}</span>
                )}
              </p>
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
