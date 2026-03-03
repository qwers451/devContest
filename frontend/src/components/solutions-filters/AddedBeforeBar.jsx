import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Form } from 'react-bootstrap';
import {BsCalendarEvent} from 'react-icons/bs';
import { Context } from '../../main.jsx';

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
            if (!isNaN(date.getTime())) {
                solution.setAddedBefore(date);
            }
        } else {
            solution.setAddedBefore(null);
        }
    }, [addedBefore, solution]);

    const handleAddedBeforeDate = (e) => {
        setAddedBefore(e.target.value);
    };

    return (
        <div className="mt-2">
            <div className="mt-2 mb-2">
                <BsCalendarEvent color="#543787"/>
                <span color='#543787' className="mx-1">Добавлено до</span>
            </div>
            <Form className="mt-2">
                <Form.Group controlId="addedBeforeDate">
                    <Form.Control
                        type="date"
                        value={addedBefore}
                        onChange={handleAddedBeforeDate}
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

export default observer(AddedBeforeBar);
