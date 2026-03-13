import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { BsCalendarEvent } from 'react-icons/bs';

const EndByBar = () => {
    const { contest } = useContext(Context);

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const [endBy, setEndBy] = useState(formatDateForInput(contest.endBy));

    useEffect(() => {
        setEndBy(formatDateForInput(contest.endBy));
    }, [contest.endBy]);

    useEffect(() => {
        if (endBy) {
            const date = new Date(endBy);
            if (!isNaN(date.getTime())) contest.setEndBy(date);
        } else {
            contest.setEndBy(null);
        }
    }, [endBy, contest]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsCalendarEvent className="inline mr-1 text-violet-600" />
                Дата окончания до
            </label>
            <input
                type="date"
                value={endBy}
                onChange={e => setEndBy(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
            />
        </div>
    );
};

export default observer(EndByBar);
