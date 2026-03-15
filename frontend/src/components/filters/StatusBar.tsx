import React, { useContext, useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../context';
import { BsFlag } from 'react-icons/bs';

const statusOptions = [
    { value: 'draft', label: 'Черновик' },
    { value: 'active', label: 'Активный' },
    { value: 'finished', label: 'Завершённый' },
    { value: 'cancelled', label: 'Отменённый' },
];

const StatusBar = () => {
    const { contest } = useContext(Context);
    const selectedStatuses = contest.selectedStatuses || [];
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleStatusSelect = (status) => {
        let updatedStatuses;
        if (selectedStatuses.includes(status.value)) {
            updatedStatuses = selectedStatuses.filter(s => s !== status.value);
        } else {
            updatedStatuses = [...selectedStatuses, status.value];
        }
        contest.setSelectedStatuses(updatedStatuses);
    };

    return (
        <div ref={ref}>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsFlag className="inline mr-1 text-violet-600" />
                Статус конкурса
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-sm bg-white text-left flex justify-between items-center transition-all duration-200"
                >
                    <span className="text-gray-600">
                        {selectedStatuses.length === 0 ? 'Все' : `Выбрано статусов: ${selectedStatuses.length}`}
                    </span>
                    <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {statusOptions.map((status) => (
                            <label
                                key={status.value}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-violet-50 cursor-pointer text-sm text-gray-700"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedStatuses.includes(status.value)}
                                    onChange={() => handleStatusSelect(status)}
                                    className="accent-violet-600"
                                />
                                {status.label}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default observer(StatusBar);
