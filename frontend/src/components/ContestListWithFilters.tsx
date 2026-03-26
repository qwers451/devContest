import React, { useContext } from "react";
import ContestsList from "./ContestsList";
import { Context } from "../context";
import FiltersBar from "./FiltersBar";
import { observer } from "mobx-react-lite";

interface Props {
  header?: React.ReactNode;
  onReset?: () => void;
}

const ContestListWithFilters = observer(({ header, onReset }: Props) => {
  const { contest } = useContext(Context);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {header !== undefined ? header : (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              Конкурсы
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Найдите задачи, предложите лучшее решение и выиграйте приз
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6 items-start">
          <aside className="w-60 flex-shrink-0 sticky top-16">
            <FiltersBar />
          </aside>

          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {contest.contests.length > 0
                  ? `Страница ${contest.currentPage} из ${contest.totalPages}`
                  : ""}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={contest.sortBy}
                  onChange={(e) => {
                    contest.setSortBy(e.target.value);
                    contest.fetchContestsFiltered(1);
                  }}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <option value="created_at">По дате создания</option>
                  <option value="prizepool">По призу</option>
                  <option value="ends_at">По дедлайну</option>
                  <option value="title">По названию</option>
                </select>
                <button
                  onClick={() => {
                    contest.setSortDir(
                      contest.sortDir === "desc" ? "asc" : "desc",
                    );
                    contest.fetchContestsFiltered(1);
                  }}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors w-8 text-center"
                  title={
                    contest.sortDir === "desc"
                      ? "По убыванию"
                      : "По возрастанию"
                  }
                >
                  {contest.sortDir === "desc" ? "↓" : "↑"}
                </button>
                <button
                  onClick={() => onReset ? onReset() : contest.resetFilters()}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium transition-colors"
                >
                  Сбросить
                </button>
              </div>
            </div>
            <ContestsList />
          </main>
        </div>
      </div>
    </div>
  );
});

export default ContestListWithFilters;
