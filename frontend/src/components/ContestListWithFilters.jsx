import React, { useContext } from 'react';
import ContestsList from './ContestsList.jsx';
import { Context } from '../main.jsx';
import FiltersBar from './FiltersBar.jsx';
import { observer } from 'mobx-react-lite';

const ContestListWithFilters = observer(() => {
    const { contest } = useContext(Context);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Page header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">Конкурсы</h1>
                    <p className="text-gray-500 text-sm">Найдите задачи, предложите лучшее решение и выиграйте приз</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-6 items-start">
                    {/* Sidebar */}
                    <aside className="w-60 flex-shrink-0 sticky top-16">
                        <FiltersBar />
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-gray-500">
                                {contest.contests.length > 0
                                    ? `Страница ${contest.currentPage} из ${contest.totalPages}`
                                    : ''}
                            </span>
                            <button
                                onClick={() => contest.resetFilters()}
                                className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                            >
                                Сбросить фильтры
                            </button>
                        </div>
                        <ContestsList />
                    </main>
                </div>
            </div>
        </div>
    );
});

export default ContestListWithFilters;
