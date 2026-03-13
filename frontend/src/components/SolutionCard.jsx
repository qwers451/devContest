import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { SOLUTION_ROUTE } from '../utils/consts.js';

const statusStyles = {
    1: { bg: 'bg-sky-100',    text: 'text-sky-700' },
    2: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    3: { bg: 'bg-green-600',   text: 'text-white' },
    4: { bg: 'bg-amber-100',   text: 'text-amber-700' },
    5: { bg: 'bg-blue-100',    text: 'text-blue-700' },
};

const SolutionCard = observer(({ solution, contestTitle, freelancerLogin, employerLogin, showContestTitle, showFreelancerLogin }) => {
    const { solution: solutionContext } = useContext(Context);
    const navigate = useNavigate();

    const status = solutionContext.getStatus(solution.status);
    const style = statusStyles[solution.status] || { bg: 'bg-gray-100', text: 'text-gray-600' };

    const isCreated = solution.updated_at === solution.created_at;
    const dateLabel = isCreated ? 'Добавлено' : 'Обновлено';
    const formattedDate = new Date(isCreated ? solution.created_at : solution.updated_at)
        .toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div
            onClick={() => {
                if (window.getSelection()?.toString().length > 0) return;
                solutionContext.setCurrentSolution(solution);
                navigate(SOLUTION_ROUTE + '/' + solution.number);
            }}
            className="group bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden animate-fade-in"
        >
            <div className="flex items-stretch">
                {/* Left: main content */}
                <div className="flex-1 px-5 py-4 min-w-0">
                    {/* Status + number */}
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
                            {status?.label}
                        </span>
                        <span className="text-xs text-gray-400">#{solution.number}</span>
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-1 mb-1.5 group-hover:text-violet-700 transition-colors">
                        {solution.title || 'Без названия'}
                    </h3>

                    {/* Annotation */}
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                        {solution.annotation || 'Без аннотации'}
                    </p>

                    {/* Contest info */}
                    {showContestTitle && (
                        <p className="text-xs text-gray-400 mt-2 truncate">
                            Конкурс: «{contestTitle || 'Неизвестный конкурс'}»
                            {employerLogin && <span className="ml-1">от @{employerLogin}</span>}
                        </p>
                    )}
                </div>

                {/* Right: meta */}
                <div className="flex-shrink-0 w-40 border-l border-gray-100 px-4 py-4 flex flex-col items-end justify-between">
                    {showFreelancerLogin && freelancerLogin && (
                        <div className="text-xs text-violet-600 font-medium truncate max-w-[140px]">
                            @{freelancerLogin}
                        </div>
                    )}
                    {!showFreelancerLogin && <div />}
                    <div className="text-right">
                        <div className="text-xs text-gray-400">{dateLabel}</div>
                        <div className="text-xs text-gray-600 font-medium">{formattedDate}</div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default SolutionCard;
