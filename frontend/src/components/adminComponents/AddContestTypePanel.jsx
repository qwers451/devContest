import React, { useState } from 'react';
import ContestTypeModal from './ContestTypeModal.jsx';

const AddContestTypePanel = () => {
    const [showModal, setShowModal] = useState(false);

    const handleTypeAdded = () => {
        console.log('Тип конкурса успешно добавлен!');
    };

    return (
        <div className="text-center">
            <h4 className="text-base font-bold text-gray-900 mb-4">Добавление типа конкурса</h4>
            <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors shadow-sm"
            >
                Добавить тип конкурса
            </button>
            <ContestTypeModal
                show={showModal}
                onHide={() => setShowModal(false)}
                onSuccess={handleTypeAdded}
            />
        </div>
    );
};

export default AddContestTypePanel;
