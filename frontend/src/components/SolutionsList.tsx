import React, { useContext } from "react";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import SolutionCard from "./SolutionCard";

const SolutionsList = ({ showContestTitle, showFreelancerLogin }) => {
  const { solution } = useContext(Context);

  if (solution.isLoading && solution.solutions.length === 0) {
    return (
      <div className="flex justify-center items-center my-10">
        <div className="w-8 h-8 rounded-full border-4 border-violet-200 dark:border-violet-900 border-t-violet-600 dark:border-t-violet-500 animate-spin" />
      </div>
    );
  }

  if (!solution.isLoading && solution.solutions.length === 0) {
    return (
      <div className="text-center my-10 text-gray-500 dark:text-gray-400">
        Нет решений по выбранным фильтрам
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {solution.solutions.map((solutionItem) => (
        <SolutionCard
          key={solutionItem.number}
          solution={solutionItem}
          contestTitle={solutionItem.contest_title}
          freelancerLogin={solutionItem.executor_login}
          showContestTitle={showContestTitle}
          showFreelancerLogin={showFreelancerLogin}
        />
      ))}
    </div>
  );
};

export default observer(SolutionsList);
