import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import SolutionsFiltersBar from "./SolutionsFiltersBar";
import SolutionsList from "./SolutionsList";

const SolutionListWithFilters = observer(
  ({ title, showContestTitle, showFreelancerLogin, isMySolutions }) => {
    const { contest, solution } = useContext(Context);
    const navigate = useNavigate();

    const handlePageChange = (newPage) => {
      solution.setPage(newPage);
      solution.fetchSolutionsFiltered();
    };

    const totalPages = Math.ceil(solution.totalCount / solution.limit);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              {title || "Решения"}
            </h1>
            {!isMySolutions && contest.currentContest && (
              <button
                onClick={() =>
                  navigate(`/contest/${contest.currentContest.number}`)
                }
                className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium transition-colors"
              >
                ← К конкурсу «{contest.currentContest.title}»
              </button>
            )}
            {isMySolutions && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Ваши отправленные работы
              </p>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-6 items-start">
            <aside className="w-60 flex-shrink-0 sticky top-16">
              <SolutionsFiltersBar isMySolutions={isMySolutions} />
            </aside>

            <main className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {solution.solutions.length > 0 && totalPages > 1
                    ? `Страница ${solution.page} из ${totalPages}`
                    : ""}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={solution.sortBy}
                    onChange={(e) => {
                      solution.setSortBy(e.target.value);
                      solution.fetchSolutionsFiltered();
                    }}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  >
                    <option value="created_at">По дате добавления</option>
                    <option value="status">По статусу</option>
                    <option value="title">По названию</option>
                    <option value="ai_score">По оценке ИИ</option>
                  </select>
                  <button
                    onClick={() => {
                      solution.setSortDir(
                        solution.sortDir === "desc" ? "asc" : "desc",
                      );
                      solution.fetchSolutionsFiltered();
                    }}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors w-8 text-center"
                    title={
                      solution.sortDir === "desc"
                        ? "По убыванию"
                        : "По возрастанию"
                    }
                  >
                    {solution.sortDir === "desc" ? "↓" : "↑"}
                  </button>
                  <button
                    onClick={() => solution.resetFilters()}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium transition-colors"
                  >
                    Сбросить
                  </button>
                </div>
              </div>

              <SolutionsList
                showContestTitle={showContestTitle}
                showFreelancerLogin={showFreelancerLogin}
              />

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-1 my-6">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={solution.page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    «
                  </button>
                  <button
                    onClick={() => handlePageChange(solution.page - 1)}
                    disabled={solution.page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ‹
                  </button>
                  {[...Array(totalPages)].map((_, index) => {
                    const pageNum = index + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                          solution.page === pageNum
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handlePageChange(solution.page + 1)}
                    disabled={solution.page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={solution.page === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    »
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    );
  },
);

export default SolutionListWithFilters;
