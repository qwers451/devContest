import React, { useContext, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useParams, useNavigate } from "react-router-dom";
import { Context } from "../context";
import SolutionListWithFilters from "../components/SolutionListWithFilters";

const Solutions = () => {
  const { contest, solution, user } = useContext(Context);
  const { number } = useParams();
  const navigate = useNavigate();
  const [contestTitle, setContestTitle] = useState("");

  useEffect(() => {
    const init = async () => {
      if (user.user.id) {
        solution.setFreelancerId(null);

        let currentContest = contest.currentContest;
        if (!currentContest) {
          currentContest = await contest.fetchOneContestByNumber(number);
          contest.setCurrentContest(currentContest);
        }

        if (!currentContest) {
          navigate("/");
          return;
        }

        const isOwner = currentContest.customer_id === user.user.id;
        const isAdmin = user.user.role === "admin";
        if (!isOwner && !isAdmin) {
          navigate(`/contest/${number}`);
          return;
        }

        if (currentContest?.id) {
          solution.setContestId(currentContest.id);
          setContestTitle(currentContest.title);
        }
      }
    };
    init();
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SolutionListWithFilters
        title={contestTitle ? `Решения конкурса «${contestTitle}»` : 'Решения'}
        showContestTitle={false}
        showFreelancerLogin={true}
        isMySolutions={false}
      />
    </div>
  );
};

export default observer(Solutions);
