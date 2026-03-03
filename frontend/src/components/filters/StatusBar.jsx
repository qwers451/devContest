import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Dropdown, Form } from 'react-bootstrap';
import { BsFlag } from 'react-icons/bs';

const StatusBar = () => {
    const { contest } = useContext(Context);
    const selectedStatuses = contest.selectedStatuses || [];

    const handleStatusSelect = (status) => {
        let updatedStatuses;
        if (selectedStatuses.includes(status.value)) {
            updatedStatuses = selectedStatuses.filter(s => s !== status.value);
        } else {
            updatedStatuses = [...selectedStatuses, status.value];
        }
        contest.setSelectedStatuses(updatedStatuses);
    };

    const statusOptions = [
        { value: 1, label: 'Активный' },
        { value: 2, label: 'На проверке' },
        { value: 3, label: 'Завершённый' },
        { value: 4, label: 'Отменённый' }
    ];

    return (
        <Dropdown style={{ width: '100%' }}>
            <div className="mt-2 mb-2">
                <BsFlag color="#543787" />
                <span className="mx-1" style={{ color: '#543787' }}>Статус конкурса</span>
            </div>
            <Dropdown.Toggle
                as="div"
                id="dropdown-status"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    border: '1px solid #ced4da',
                    borderRadius: '0.375rem',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    padding: '0.375rem 0.75rem',
                    userSelect: 'none'
                }}
            >
                <div style={{ flex: 1 }}>
                    {selectedStatuses.length === 0 ? "Все" : `Выбрано статусов: ${selectedStatuses.length}`}
                </div>
            </Dropdown.Toggle>

            <Dropdown.Menu style={{ width: '100%', cursor: 'pointer' }}>
                {statusOptions.map((status) => (
                    <Dropdown.Item
                        key={status.value}
                        as="div"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleStatusSelect(status);
                        }}
                    >
                        <Form.Check
                            type="checkbox"
                            label={status.label}
                            checked={selectedStatuses.includes(status.value)}
                            onChange={() => handleStatusSelect(status)}
                            style={{
                                userSelect: 'none',
                                cursor: 'pointer'
                            }}
                        />
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default observer(StatusBar);
