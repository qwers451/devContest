import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import SolutionsFiltersBar from './SolutionsFiltersBar.jsx';
import SolutionsList from './SolutionsList.jsx';

const SolutionListWithFilters = observer(({ title, showContestTitle, showFreelancerLogin, isMySolutions }) => {
    const { contest, solution } = useContext(Context);
    const navigate = useNavigate();

    const handlePageChange = (newPage) => {
        solution.setPage(newPage);
        solution.fetchSolutionsFiltered();
    };

    const totalPages = Math.ceil(solution.totalCount / solution.limit);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Page header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">
                        {title || 'Решения'}
                    </h1>
                    {!isMySolutions && contest.currentContest && (
                        <button
                            onClick={() => navigate(`/contest/${contest.currentContest.number}`)}
                            className="text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors"
                        >
                            ← К конкурсу «{contest.currentContest.title}»
                        </button>
                    )}
                    {isMySolutions && (
                        <p className="text-gray-500 text-sm">Ваши отправленные работы</p>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-6 items-start">
                    {/* Sidebar */}
                    <aside className="w-60 flex-shrink-0 sticky top-16">
                        <SolutionsFiltersBar isMySolutions={isMySolutions} />
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-gray-500">
                                {solution.solutions.length > 0 && totalPages > 1
                                    ? `Страница ${solution.page} из ${totalPages}`
                                    : ''}
                            </span>
                            <button
                                onClick={() => solution.resetFilters()}
                                className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                            >
                                Сбросить фильтры
                            </button>
                        </div>

                        <SolutionsList
                            showContestTitle={showContestTitle}
                            showFreelancerLogin={showFreelancerLogin}
                        />

                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-1 my-6">
                                <button
                                    onClick={() => handlePageChange(1)}
                                    disabled={solution.page === 1}
                                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    «
                                </button>
                                <button
                                    onClick={() => handlePageChange(solution.page - 1)}
                                    disabled={solution.page === 1}
                                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    ‹
                                </button>
                                {[...Array(totalPages)].map((_, index) => {
                                    const pageNum = index + 1;
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => handlePageChange(pageNum)}
                                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                solution.page === pageNum
                                                    ? 'bg-violet-600 text-white shadow-sm'
                                                    : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => handlePageChange(solution.page + 1)}
                                    disabled={solution.page === totalPages}
                                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    ›
                                </button>
                                <button
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={solution.page === totalPages}
                                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    »
                                </button>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
});

export default SolutionListWithFilters;
