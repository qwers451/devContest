import React, { useEffect, useContext } from "react";
import { Context } from "../context";
import ContestCard from "./ContestCard";
import { observer } from "mobx-react-lite";

const ContestsList = observer(() => {
  const { contest, user } = useContext(Context);

  useEffect(() => {
    contest.fetchContestsFiltered(contest.currentPage);
  }, []);

  useEffect(() => {
    if (contest.contests.length === 0) return;
    const missingIds = [
      ...new Set(contest.contests.map((c) => c.customer_id)),
    ].filter((id) => id && !user.getById(id));
    missingIds.forEach((id) => user.fetchUserById(id));
  }, [contest.contests]);

  const handlePageChange = (pageNumber) => {
    contest.fetchContestsFiltered(pageNumber);
  };

  if (contest.isLoading && contest.contests.length === 0) {
    return (
      <div className="flex justify-center items-center my-10">
        <div className="w-8 h-8 rounded-full border-4 border-violet-200 dark:border-violet-900 border-t-violet-600 dark:border-t-violet-500 animate-spin" />
      </div>
    );
  }

  if (!contest.isLoading && contest.contests.length === 0) {
    return (
      <div className="text-center my-10 text-gray-500 dark:text-gray-400">
        Нет конкурсов по выбранным фильтрам
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        {contest.contests.map((contestItem) => (
          <ContestCard
            key={contestItem.id}
            contest={contestItem}
            type={contest.getTypeNameById(contestItem.type)}
          />
        ))}
      </div>
      {contest.totalPages > 1 && (
        <div className="flex justify-center items-center gap-1 my-6">
          {[...Array(contest.totalPages)].map((_, idx) => (
            <button
              key={idx + 1}
              onClick={() => handlePageChange(idx + 1)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                contest.currentPage === idx + 1
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400"
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      )}
    </>
  );
});

export default ContestsList;
