import React, { useContext, useEffect } from 'react';
import { Context } from '../context';
import ContestListWithFilters from '../components/ContestListWithFilters';

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
