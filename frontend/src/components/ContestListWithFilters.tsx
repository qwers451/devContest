import React, { useContext, useState } from "react";
import ContestsList from "./ContestsList";
import { Context } from "../context";
import FiltersBar from "./FiltersBar";
import { observer } from "mobx-react-lite";
import { BsFilter } from "react-icons/bs";

interface Props {
  header?: React.ReactNode;
  onReset?: () => void;
}

const ContestListWithFilters = observer(({ header, onReset }: Props) => {
  const { contest } = useContext(Context);
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950">
      {header !== undefined ? header : (
        <div className="border-b border-gray-700">
          <div className="mx-auto flex max-w-[1400px] items-baseline justify-between gap-4 px-5 py-5">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-gray-100">
                Конкурсы
              </h1>
              <p className="mt-0.5 text-[13px] text-gray-400">
                Задачи от заказчиков — выберите конкурс и предложите решение
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1400px] px-5 py-5">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-full md:hidden flex justify-between items-center mb-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lin-btn lin-btn-secondary"
            >
              <BsFilter size={18} />
              Фильтры
            </button>
          </div>

          <aside className={`w-full md:w-64 flex-shrink-0 md:sticky md:top-[60px] ${showFilters ? 'block' : 'hidden md:block'}`}>
            <FiltersBar />
          </aside>

          <main className="flex-1 min-w-0 w-full">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <span className="text-[13px] text-gray-500">
                {contest.contests.length > 0
                  ? `Страница ${contest.currentPage} из ${contest.totalPages}`
                  : ""}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  aria-label="Сортировка конкурсов"
                  value={contest.sortBy}
                  onChange={(e) => {
                    contest.setSortBy(e.target.value);
                    contest.fetchContestsFiltered(1);
                  }}
                  className="h-7 rounded-md border border-gray-700 bg-gray-900 px-2 text-[12px] text-gray-300 focus:border-violet-500 focus:outline-none"
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
                  className="h-7 w-7 rounded-md border border-gray-700 bg-gray-900 text-[12px] text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
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
                  className="ml-1 h-7 rounded-md px-2 text-[12px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
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
