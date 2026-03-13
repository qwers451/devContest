import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { BsCalendarEvent } from 'react-icons/bs';
import { Context } from '../../main.jsx';

const AddedAfterBar = () => {
    const { solution } = useContext(Context);

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const [addedAfter, setAddedAfter] = useState(formatDateForInput(solution.addedAfter));

    useEffect(() => {
        setAddedAfter(formatDateForInput(solution.addedAfter));
    }, [solution.addedAfter]);

    useEffect(() => {
        if (addedAfter) {
            const date = new Date(addedAfter);
            if (!isNaN(date.getTime())) solution.setAddedAfter(date);
        } else {
            solution.setAddedAfter(null);
        }
    }, [addedAfter, solution]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsCalendarEvent className="inline mr-1 text-violet-600" />
                Добавлено после
            </label>
            <input
                type="date"
                value={addedAfter}
                onChange={e => setAddedAfter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
            />
        </div>
    );
};

export default observer(AddedAfterBar);
