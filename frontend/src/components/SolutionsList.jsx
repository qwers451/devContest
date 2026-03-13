import React, { useEffect, useContext, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import SolutionCard from './SolutionCard.jsx';

const SolutionsList = ({ showContestTitle, showFreelancerLogin }) => {
    const { solution } = useContext(Context);
    const [showLoader, setShowLoader] = useState(false);

    useEffect(() => {
        if (solution.isLoading) {
            setShowLoader(true);
        } else {
            const timer = setTimeout(() => setShowLoader(false), 100);
            return () => clearTimeout(timer);
        }
    }, [solution.isLoading]);

    if (showLoader) {
        return (
            <div className="flex justify-center items-center my-10">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
            </div>
        );
    }

    if (solution.solutions.length === 0) {
        return (
            <div className="text-center my-10 text-gray-500">
                Нет решений по выбранным фильтрам
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3">
            {solution.solutions.map((solutionItem) => (
                <SolutionCard
                    key={solutionItem.number}
                    solution={solutionItem}
                    contestTitle={solutionItem.contestTitle}
                    freelancerLogin={solutionItem.freelancerLogin}
                    employerLogin={solutionItem.employerLogin}
                    showContestTitle={showContestTitle}
                    showFreelancerLogin={showFreelancerLogin}
                />
            ))}
        </div>
    );
};

export default observer(SolutionsList);
