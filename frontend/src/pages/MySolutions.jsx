import React, { useContext, useEffect } from 'react';
import { observer } from "mobx-react-lite";
import { Context } from "../main.jsx";
import SolutionListWithFilters from "../components/SolutionListWithFilters.jsx"

const MySolutions = () => {
    const { solution, user } = useContext(Context);

    useEffect(() => {
        if (user.user.id) {
            solution.setFreelancerId(user.user.id);
            solution.setContestId(null);
        }
    }, [user]);

    return (
        <>
            <SolutionListWithFilters
                title={"Мои решения"}
                showContestTitle={true}
                showFreelancerLogin={false}
                isMySolutions={true}
            />
        </>
    );
};

export default observer(MySolutions);
