import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { BsTrophy } from 'react-icons/bs';

const RewardsBar = () => {
    const { contest } = useContext(Context);
    const [minReward, setMinReward] = useState(contest.minReward);
    const [maxReward, setMaxReward] = useState(contest.maxReward);

    useEffect(() => {
        setMinReward(contest.minReward);
        setMaxReward(contest.maxReward);
    }, [contest.minReward, contest.maxReward]);

    useEffect(() => {
        const min = minReward === '' ? 0 : Number(minReward);
        const max = maxReward === '' ? 999999 : Number(maxReward);
        contest.setReward({ min, max });
    }, [minReward, maxReward, contest]);

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsTrophy className="inline mr-1 text-violet-600" />
                Приз
            </label>
            <div className="flex gap-2">
                <input
                    type="number"
                    value={minReward}
                    onChange={e => setMinReward(e.target.value)}
                    min="0"
                    placeholder="от 200"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
                />
                <input
                    type="number"
                    value={maxReward}
                    onChange={e => setMaxReward(e.target.value)}
                    min="0"
                    placeholder="до 999999"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
                />
            </div>
        </div>
    );
};

export default observer(RewardsBar);
