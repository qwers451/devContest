import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Context } from '../context';
import ContestListWithFilters from '../components/ContestListWithFilters';
import { CREATE_CONTEST_ROUTE } from '../utils/consts';

const MyContests = () => {
    const { contest, user } = useContext(Context);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user.user?.id) return;
        contest.setEmployerId(user.user.id);
        contest.setSelectedStatuses([]);
        contest.setSelectedTypes([]);
        contest.setMinReward(0);
        contest.setMaxReward(9999999);
        contest.setSearchQuery("");
        contest.setEndBy(null);
        contest.setEndAfter(null);
        void contest.fetchContestsFiltered(1);
    }, [user.user?.id]);

    const header = (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                            Мои конкурсы
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Управляйте своими конкурсами и черновиками
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(CREATE_CONTEST_ROUTE)}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                    >
                        + Создать конкурс
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <ContestListWithFilters header={header} />
        </div>
    );
};

export default MyContests;
