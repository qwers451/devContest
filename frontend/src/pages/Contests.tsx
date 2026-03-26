import { useContext, useEffect } from "react";
import { Context } from "../context";
import ContestListWithFilters from "../components/ContestListWithFilters";

const Contests = () => {
  const { contest, user } = useContext(Context);

  useEffect(() => {
    contest.setEmployerId(null);
    contest.setSelectedStatuses(["active", "finished"]);
    contest.setSelectedTypes([]);
    contest.setMinReward(0);
    contest.setMaxReward(9999999);
    contest.setSearchQuery("");
    contest.setEndBy(null);
    contest.setEndAfter(null);
    void contest.fetchContestsFiltered(1);
  }, []);

  const handleReset = () => {
    contest.setEmployerId(null);
    contest.setSelectedStatuses(["active", "finished"]);
    contest.setSelectedTypes([]);
    contest.setMinReward(0);
    contest.setMaxReward(9999999);
    contest.setSearchQuery("");
    contest.setEndBy(null);
    contest.setEndAfter(null);
    void contest.fetchContestsFiltered(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ContestListWithFilters onReset={handleReset} />
    </div>
  );
};

export default Contests;
