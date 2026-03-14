import { useContext, useEffect } from "react";
import { Context } from "../main.jsx";
import ContestListWithFilters from "../components/ContestListWithFilters.jsx";

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
