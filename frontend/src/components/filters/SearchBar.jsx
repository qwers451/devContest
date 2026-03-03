import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Form } from 'react-bootstrap';
import { BsSearch } from 'react-icons/bs';

const SearchBar = () => {
    const { contest } = useContext(Context);
    const [searchQuery, setSearchQuery] = useState(contest.searchQuery || '');

    useEffect(() => {
        setSearchQuery(contest.searchQuery);
    }, [contest.searchQuery]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        contest.setSearchQuery(query);
    };

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
                        placeholder="Поиск по названию, создателю или описанию..."
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