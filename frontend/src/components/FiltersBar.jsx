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

const FiltersBar = observer(() => {
    const { contest } = useContext(Context);

    useEffect(() => {
        const t = setTimeout(() => contest.fetchContestsFiltered(), 500);
        return () => clearTimeout(t);
    }, [
        contest.searchQuery,
        contest.selectedTypes,
        contest.selectedStatuses,
        contest.minReward,
        contest.maxReward,
        contest.endBy,
        contest.endAfter,
        contest,
    ]);

    const statusOptions = [
        { value: 'active',    label: 'Активный' },
        { value: 'finished',  label: 'Завершённый' },
        { value: 'draft',     label: 'Черновик' },
        { value: 'cancelled', label: 'Отменённый' },
    ];

    const toggleStatus = (value) => {
        const cur = contest.selectedStatuses || [];
        contest.setSelectedStatuses(
            cur.includes(value) ? cur.filter(s => s !== value) : [...cur, value]
        );
    };

    const toggleType = (type) => {
        const cur = contest.selectedTypes || [];
        contest.setSelectedTypes(
            cur.some(t => t.id === type.id) ? cur.filter(t => t.id !== type.id) : [...cur, type]
        );
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Фильтры</h2>

            <FilterSection title="Поиск">
                <input
                    type="text"
                    value={contest.searchQuery || ''}
                    onChange={e => contest.setSearchQuery(e.target.value)}
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
                                checked={(contest.selectedStatuses || []).includes(s.value)}
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

            {contest.types?.length > 0 && (
                <FilterSection title="Тип конкурса">
                    <div className="space-y-2">
                        {contest.types.map(type => (
                            <label key={type.id} className="flex items-center gap-2.5 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={(contest.selectedTypes || []).some(t => t.id === type.id)}
                                    onChange={() => toggleType(type)}
                                    className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                                />
                                <span className="text-sm text-gray-700 group-hover:text-violet-700 transition-colors">
                                    {type.name}
                                </span>
                            </label>
                        ))}
                    </div>
                </FilterSection>
            )}

            <FilterSection title="Призовой фонд (₽)" defaultOpen={false}>
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={contest.minReward === 0 ? '' : contest.minReward}
                        onChange={e => contest.setMinReward(e.target.value === '' ? 0 : Number(e.target.value))}
                        placeholder="от"
                        min="0"
                        className={inputCls}
                    />
                    <input
                        type="number"
                        value={contest.maxReward === 9999999 ? '' : contest.maxReward}
                        onChange={e => contest.setMaxReward(e.target.value === '' ? 9999999 : Number(e.target.value))}
                        placeholder="до"
                        min="0"
                        className={inputCls}
                    />
                </div>
            </FilterSection>

            <FilterSection title="Сроки окончания" defaultOpen={false}>
                <div className="space-y-2">
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Не позднее</label>
                        <input
                            type="date"
                            value={contest.endBy ? new Date(contest.endBy).toISOString().split('T')[0] : ''}
                            onChange={e => contest.setEndBy(e.target.value ? new Date(e.target.value) : null)}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Не ранее</label>
                        <input
                            type="date"
                            value={contest.endAfter ? new Date(contest.endAfter).toISOString().split('T')[0] : ''}
                            onChange={e => contest.setEndAfter(e.target.value ? new Date(e.target.value) : null)}
                            className={inputCls}
                        />
                    </div>
                </div>
            </FilterSection>

            <button
                onClick={() => contest.resetFilters()}
                className="mt-3 w-full py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all font-medium"
            >
                Сбросить всё
            </button>
        </div>
    );
});

export default FiltersBar;
