import React, { useContext, useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../context';
import { BsTags } from 'react-icons/bs';

const TypeBar = () => {
    const { contest } = useContext(Context);
    const selectedTypes = contest.selectedTypes || [];
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleTypeSelect = (type) => {
        let updatedTypes;
        if (selectedTypes.some(t => t.id === type.id)) {
            updatedTypes = selectedTypes.filter(t => t.id !== type.id);
        } else {
            updatedTypes = [...selectedTypes, type];
        }
        contest.setSelectedTypes(updatedTypes);
    };

    return (
        <div ref={ref}>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsTags className="inline mr-1 text-violet-600" />
                Тип конкурса
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-sm bg-white text-left flex justify-between items-center transition-all duration-200"
                >
                    <span className="text-gray-600">
                        {selectedTypes.length === 0 ? 'Все' : `Выбрано типов: ${selectedTypes.length}`}
                    </span>
                    <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {contest?.types?.map((type) => (
                            <label
                                key={type.id}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-violet-50 cursor-pointer text-sm text-gray-700"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedTypes.some(t => t.id === type.id)}
                                    onChange={() => handleTypeSelect(type)}
                                    className="accent-violet-600"
                                />
                                {type.name}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default observer(TypeBar);
