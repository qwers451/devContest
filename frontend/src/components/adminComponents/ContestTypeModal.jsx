import React, { useState } from 'react';
import { sendData } from '../../services/apiService.js';
import { observer } from 'mobx-react-lite';

const ContestTypeModal = ({ show, onHide, onSuccess }) => {
    const [name, setName] = useState('');

    const handleSubmit = async () => {
        if (!name.trim()) {
            alert('Введите название типа конкурса');
            return;
        }
        try {
            await sendData('/contest-types', { name });
            alert('Тип конкурса добавлен!');
            setName('');
            onSuccess?.();
            onHide();
        } catch (error) {
            alert(`Ошибка при добавлении: ${error.response?.data?.error || error.message}`);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onHide}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Добавить тип конкурса</h3>
                <div className="mb-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Название типа</label>
                    <input
                        type="text"
                        placeholder="Введите название"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onHide}
                        className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                    >
                        Отменить
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                    >
                        Добавить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default observer(ContestTypeModal);
