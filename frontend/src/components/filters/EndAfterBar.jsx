import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Form } from 'react-bootstrap';
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

    // Синхронизируем состояние с contest.endAfter, если оно изменилось извне
    useEffect(() => {
        setEndAfter(formatDateForInput(contest.endAfter));
    }, [contest.endAfter]);

    // При изменении endAfter обновляем contest
    useEffect(() => {
        if (endAfter) {
            const date = new Date(endAfter);
            if (!isNaN(date.getTime())) {
                contest.setEndAfter(date);
            }
        } else {
            contest.setEndAfter(null);
        }
    }, [endAfter, contest]);

    const handleEndDateChange = (e) => {
        setEndAfter(e.target.value);
    };

    return (
        <div className="mt-2">
            <div className="mt-2 mb-2">
                <BsCalendarEvent color="#543787"/>
                <span color='#543787' className="mx-1">Дата окончания после</span>
            </div>
            <Form className="mt-2">
                <Form.Group controlId="endAfterDate">
                    <Form.Control
                        type="date"
                        value={endAfter}
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

export default observer(EndAfterBar);