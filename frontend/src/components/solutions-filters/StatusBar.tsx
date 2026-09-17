import React, { useContext, useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { BsFlag } from 'react-icons/bs';
import { Context } from '../../context';

const StatusBar = () => {
    const { solution } = useContext(Context);
    const selectedStatuses = solution.selectedStatuses || [];
    const statusOptions = solution.statusOptions;
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
        solution.setSelectedStatuses(updatedStatuses);
    };

    return (
        <div ref={ref}>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1">
                <BsFlag className="inline mr-1 text-violet-600" />
                Статус решения
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="w-full px-4 py-2.5 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-[13px] bg-gray-800 text-left flex justify-between items-center transition-all duration-200"
                >
                    <span className="text-gray-600">
                        {selectedStatuses.length === 0 ? 'Все' : `Выбрано статусов: ${selectedStatuses.length}`}
                    </span>
                    <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
                        {statusOptions.map((status) => (
                            <label
                                key={status.value}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-violet-50 cursor-pointer text-[13px] text-gray-700"
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
