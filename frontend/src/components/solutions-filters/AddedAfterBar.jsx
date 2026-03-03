import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Form } from 'react-bootstrap';
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
            if (!isNaN(date.getTime())) {
                solution.setAddedAfter(date);
            }
        } else {
            solution.setAddedAfter(null);
        }
    }, [addedAfter, solution]);

    const handleAddedAfterDate = (e) => {
        setAddedAfter(e.target.value);
    };

    return (
        <div className="mt-2">
            <div className="mt-2 mb-2">
                <BsCalendarEvent color="#543787"/>
                <span color='#543787' className="mx-1">Добавлено после</span>
            </div>
            <Form className="mt-2">
                <Form.Group controlId="addedAfterDate">
                    <Form.Control
                        type="date"
                        value={addedAfter}
                        onChange={handleAddedAfterDate}
                        style={{
                            fontSize: '0.8rem',
                            border: '1px solid #ced4da',
                            borderRadius: '0.375rem',
                        }}
                    />
                </Form.Group>
            </Form>
        </div>
    );
};

export default observer(AddedAfterBar);
