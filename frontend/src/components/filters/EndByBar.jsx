import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Form } from 'react-bootstrap';
import {BsCalendarEvent, BsTrophy} from 'react-icons/bs';

const EndByBar = () => {
    const { contest } = useContext(Context);

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const [endBy, setEndBy] = useState(formatDateForInput(contest.endBy));

    // Синхронизируем состояние с contest.endBy, если оно изменилось извне
    useEffect(() => {
        setEndBy(formatDateForInput(contest.endBy));
    }, [contest.endBy]);

    // При изменении endBy обновляем contest
    useEffect(() => {
        if (endBy) {
            const date = new Date(endBy);
            if (!isNaN(date.getTime())) {
                contest.setEndBy(date);
            }
        } else {
            contest.setEndBy(null);
        }
    }, [endBy, contest]);

    const handleEndDateChange = (e) => {
        setEndBy(e.target.value);
    };

    return (
        <div className="mt-2">
            <div className="mt-2 mb-2">
                <BsCalendarEvent color="#543787"/>
                <span color='#543787' className="mx-1">Дата окончания до</span>
            </div>
            <Form className="mt-2">
                <Form.Group controlId="endDate">
                    <Form.Control
                        type="date"
                        value={endBy}
                        onChange={handleEndDateChange}
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

export default observer(EndByBar);