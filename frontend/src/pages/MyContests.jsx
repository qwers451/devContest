import React, { useContext, useEffect } from 'react';
import { Context } from '../main.jsx';
import ContestListWithFilters from '../components/ContestListWithFilters.jsx';

const MyContests = () => {
    const { contest, user } = useContext(Context);

    useEffect(() => {
        if (user.user.id) {
            contest.setEmployerId(user.user.id);
        }
    }, [user]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <ContestListWithFilters />
        </div>
    );
};

export default MyContests;
