import { useContext, useEffect } from "react";
import { Context } from "../context";
import ContestListWithFilters from "../components/ContestListWithFilters";

const Contests = () => {
  const { contest, user } = useContext(Context);

  useEffect(() => {
    if (user.user.id) {
      contest.setEmployerId(null);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ContestListWithFilters />
    </div>
  );
};

export default Contests;
