import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Form } from 'react-bootstrap';
import { BsSearch } from 'react-icons/bs';
import { Context } from '../../main.jsx';

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
        <div style={{ width: '100%' }} className="mt-2">
            <div className="mt-2 mb-2">
                <BsSearch color="#543787" />
                <span color="#543787" className="mx-1">Поиск</span>
            </div>
            <Form>
                <Form.Group controlId="searchQuery">
                    <Form.Control
                        type="text"
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder={placeholder}
                        style={{
                            fontSize: '0.8rem',
                        }}
                    />
                </Form.Group>
            </Form>
        </div>
    );
};

export default observer(SearchBar);
