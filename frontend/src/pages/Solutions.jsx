import React, { useContext, useEffect, useState } from 'react';
import { observer } from "mobx-react-lite";
import { useParams } from 'react-router-dom';
import { Context } from "../main.jsx";
import SolutionListWithFilters from "../components/SolutionListWithFilters.jsx"

const Solutions = () => {
    const { contest, solution, user } = useContext(Context);
    const { number } = useParams();

    const [contestTitle, setContestTitle] = useState('');

    useEffect(() => {
        const init = async () => {
            if (user.user.id) {
                solution.setFreelancerId(null);

                let currentContest = contest.currentContest;
                if (!currentContest) {
                    currentContest = await contest.fetchOneContestByNumber(number);
                    contest.setCurrentContest(currentContest);
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
        <>
            <SolutionListWithFilters
                title={`Решения конкурса «${contestTitle}»`}
                showContestTitle={false}
                showFreelancerLogin={true}
                isMySolutions={false}
            />
        </>
    );
};

export default observer(Solutions);
