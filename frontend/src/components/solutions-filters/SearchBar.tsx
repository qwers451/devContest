import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { BsSearch } from 'react-icons/bs';
import { Context } from '../../context';

const SearchBar = ({ isMySolutions }) => {
    const { solution } = useContext(Context);
    const [searchQuery, setSearchQuery] = useState(solution.searchQuery || '');

    useEffect(() => {
        setSearchQuery(solution.searchQuery);
    }, [solution.searchQuery]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        solution.setSearchQuery(query, isMySolutions);
    };

    const placeholder = isMySolutions
        ? 'Поиск по названию, описанию, названию/описанию конкурса или заказчику'
        : 'Поиск по названию, описанию или фрилансеру';

    return (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
                <BsSearch className="inline mr-1 text-violet-600" />
                Поиск
            </label>
            <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white"
            />
        </div>
    );
};

export default observer(SearchBar);
