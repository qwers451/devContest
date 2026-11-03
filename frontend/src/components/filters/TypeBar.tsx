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
            <label className="block text-[13px] font-semibold text-gray-200 mb-1">
                <BsTags className="inline mr-1 text-violet-600" />
                Тип конкурса
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="w-full px-4 py-2.5 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-[13px] bg-gray-800 text-left flex justify-between items-center transition-all duration-200"
                >
                    <span className="text-gray-400">
                        {selectedTypes.length === 0 ? 'Все' : `Выбрано типов: ${selectedTypes.length}`}
                    </span>
                    <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
                        {contest?.types?.map((type) => (
                            <label
                                key={type.id}
                                className="flex items-center gap-2 px-4 py-2 hover:bg-violet-50 cursor-pointer text-[13px] text-gray-200"
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
