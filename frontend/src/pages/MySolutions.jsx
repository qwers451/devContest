import React, { useContext, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import SolutionListWithFilters from '../components/SolutionListWithFilters.jsx';

const MySolutions = () => {
    const { solution, user } = useContext(Context);

    useEffect(() => {
        if (user.user.id) {
            solution.setFreelancerId(user.user.id);
            solution.setContestId(null);
        }
    }, [user]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <SolutionListWithFilters
                title="Мои решения"
                showContestTitle={true}
                showFreelancerLogin={false}
                isMySolutions={true}
            />
        </div>
    );
};

export default observer(MySolutions);
