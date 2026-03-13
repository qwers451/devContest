import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';

const FilterSection = ({ title, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-gray-100 py-3 last:border-0">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between text-sm font-semibold text-gray-800 hover:text-violet-700 transition-colors"
            >
                {title}
                <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
            </button>
            {open && <div className="mt-3">{children}</div>}
        </div>
    );
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-700 text-sm bg-white transition-all';

const statusOptions = [
    { value: 1, label: 'Новое' },
    { value: 2, label: 'Просмотрено' },
    { value: 3, label: 'Победитель' },
    { value: 4, label: 'Необходимы правки' },
    { value: 5, label: 'Правки внесены' },
];

const SolutionsFiltersBar = observer(({ isMySolutions }) => {
    const { solution } = useContext(Context);

    useEffect(() => {
        const timeout = setTimeout(() => {
            solution.setPage(1);
            solution.fetchSolutionsFiltered();
        }, 500);
        return () => clearTimeout(timeout);
    }, [
        solution.searchQuery,
        solution.selectedStatuses,
        solution.addedBefore,
        solution.addedAfter,
        solution,
    ]);

    const toggleStatus = (value) => {
        const cur = solution.selectedStatuses || [];
        solution.setSelectedStatuses(
            cur.includes(value) ? cur.filter(s => s !== value) : [...cur, value]
        );
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Фильтры</h2>

            <FilterSection title="Поиск">
                <input
                    type="text"
                    value={solution.searchQuery || ''}
                    onChange={e => solution.setSearchQuery(e.target.value, isMySolutions)}
                    placeholder="По названию..."
                    className={inputCls}
                />
            </FilterSection>

            <FilterSection title="Статус">
                <div className="space-y-2">
                    {statusOptions.map(s => (
                        <label key={s.value} className="flex items-center gap-2.5 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={(solution.selectedStatuses || []).includes(s.value)}
                                onChange={() => toggleStatus(s.value)}
                                className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700 group-hover:text-violet-700 transition-colors">
                                {s.label}
                            </span>
                        </label>
                    ))}
                </div>
            </FilterSection>

            <FilterSection title="Дата добавления" defaultOpen={false}>
                <div className="space-y-2">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Не позднее</label>
                        <input
                            type="date"
                            value={solution.addedBefore ? new Date(solution.addedBefore).toISOString().split('T')[0] : ''}
                            onChange={e => solution.setAddedBefore(e.target.value ? new Date(e.target.value) : null)}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Не ранее</label>
                        <input
                            type="date"
                            value={solution.addedAfter ? new Date(solution.addedAfter).toISOString().split('T')[0] : ''}
                            onChange={e => solution.setAddedAfter(e.target.value ? new Date(e.target.value) : null)}
                            className={inputCls}
                        />
                    </div>
                </div>
            </FilterSection>

            <button
                onClick={() => solution.resetFilters()}
                className="mt-3 w-full py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all font-medium"
            >
                Сбросить всё
            </button>
        </div>
    );
});

export default SolutionsFiltersBar;
