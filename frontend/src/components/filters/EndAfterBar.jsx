import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { BsCalendarEvent } from 'react-icons/bs';

const EndAfterBar = () => {
    const { contest } = useContext(Context);

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const [endAfter, setEndAfter] = useState(formatDateForInput(contest.endAfter));

    useEffect(() => {
        setEndAfter(formatDateForInput(contest.endAfter));
    }, [contest.endAfter]);

    useEffect(() => {
        if (endAfter) {
            const date = new Date(endAfter);
            if (!isNaN(date.getTime())) contest.setEndAfter(date);
        } else {
            contest.setEndAfter(null);
        }
    }, [endAfter, contest]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsCalendarEvent className="inline mr-1 text-violet-600" />
                Дата окончания после
            </label>
            <input
                type="date"
                value={endAfter}
                onChange={e => setEndAfter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
            />
        </div>
    );
};

export default observer(EndAfterBar);
