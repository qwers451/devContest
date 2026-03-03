import { useContext, useEffect } from 'react';
import { Context } from "../main.jsx";
import ContestListWithFilters from "../components/ContestListWithFilters.jsx"; // Иконка фильтра

const Contests = () => {
    const { contest, user } = useContext(Context);

    useEffect(() => {
        if (user.user.id) {
            contest.setEmployerId(null);
        }
    }, [user]);

    return (
        <>
            <ContestListWithFilters />
        </>
    );
};

export default Contests;
