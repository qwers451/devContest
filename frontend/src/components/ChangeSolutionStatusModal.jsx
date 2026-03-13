import React, { useState, useContext } from 'react';
import { Context } from '../main.jsx';

const ChangeSolutionStatusModal = ({
    show,
    onHide,
    currentStatus,
    onSave
}) => {
    const { solution } = useContext(Context);
    const [selectedStatus, setSelectedStatus] = useState(currentStatus);

    const statusOptions = Object.entries(solution.statusMap).map(([value, data]) => ({
        value: parseInt(value),
        label: data.label
    }));

    const handleSave = () => {
        onSave(selectedStatus);
        onHide();
    };

    if (!show) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onHide}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold text-gray-900 mb-4">Статус решения</h3>
                <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Выберите новый статус:
                    </label>
                    <select
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(parseInt(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
                    >
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onHide}
                        className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                    >
                        Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeSolutionStatusModal;
