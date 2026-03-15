import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { BsCalendarEvent } from 'react-icons/bs';
import { Context } from '../../context';

const AddedBeforeBar = () => {
    const { solution } = useContext(Context);

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const [addedBefore, setAddedBefore] = useState(formatDateForInput(solution.addedBefore));

    useEffect(() => {
        setAddedBefore(formatDateForInput(solution.addedBefore));
    }, [solution.addedBefore]);

    useEffect(() => {
        if (addedBefore) {
            const date = new Date(addedBefore);
            if (!isNaN(date.getTime())) solution.setAddedBefore(date);
        } else {
            solution.setAddedBefore(null);
        }
    }, [addedBefore, solution]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsCalendarEvent className="inline mr-1 text-violet-600" />
                Добавлено до
            </label>
            <input
                type="date"
                value={addedBefore}
                onChange={e => setAddedBefore(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
            />
        </div>
    );
};

export default observer(AddedBeforeBar);
