import React, {useContext} from 'react';
import {Card, Col} from "react-bootstrap";
import {useNavigate} from 'react-router-dom';
import {observer} from 'mobx-react-lite';
import {Context} from "../main.jsx";
import {CONTEST_ROUTE} from "../utils/consts.js";
import {BsStarFill, BsTrophy} from 'react-icons/bs';

const ContestCard = observer(({contest: item}) => {
    const {contest, user} = useContext(Context);
    const navigate = useNavigate();

    const creator = user.getById(item.employerId);
    const isOpen = item.status;
    const statusOptions = [
        { value: 1, label: 'Активный', colorClass: 'bg-success' },
        { value: 2, label: 'На проверке', colorClass: 'bg-warning' },
        { value: 3, label: 'Завершённый', colorClass: 'bg-danger' },
        { value: 4, label: 'Отменённый', colorClass: 'bg-secondary' }
    ];

    const statusOption = statusOptions.find(option => option.value === item.status);

    const statusText = statusOption ? statusOption.label : 'Неизвестный статус';
    const statusColor = statusOption ? statusOption.colorClass : 'bg-light';

    const contestTypeName = contest.getTypeNameById(item.type);

    return (<Col
        xs={12}
        className="my-2"
        onClick={(e) => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;

            contest.setCurrentContest(item);
            navigate(CONTEST_ROUTE + '/' + item.number);
        }}
    >
        <Card
            border="light"
            className="shadow-lg rounded-lg"
            style={{
                cursor: 'pointer', minHeight: '270px',
            }}
        >
            <Card.Body>
                {/* Название */}
                <div className="d-flex justify-content-between align-items-center">
                    <Card.Title className="text-truncate" style={{
                        fontSize: '1.5rem', fontWeight: 'bold', color: '#333',
                    }}>
                        {item.title}
                    </Card.Title>
                    <div className="d-flex justify-content-between align-items-center">
                        <BsStarFill color="gold" size={22} className="me-1"/>
                        <span style={{fontSize: '1rem', color: '#666'}}>{item.rating || '4.8'}</span>
                    </div>
                </div>
                {/* Описание */}
                <div style={{height: '80px'}}>
                    <Card.Text className="mt-2" style={{fontSize: '1rem', color: '#555', lineHeight: '1.4'}}>
                        {item.annotation}
                    </Card.Text>
                </div>
            </Card.Body>
            <Card.Body>
                {/* Компания и приз */}
                <div className="d-flex justify-content-between align-items-center">
                        <span style={{color: '#543787', fontWeight: '600'}}>
                            {creator ? creator.login : 'Неизвестный создатель'}
                        </span>
                    <div>
                        <BsTrophy color="green" size={20} className="me-1"/>
                        <span style={{fontSize: '1rem', fontWeight: 'bold', color: 'green'}}>
                                {item.prizepool} ₽.
                            </span>
                    </div>
                </div>
                {/* Индикатор статуса */}
                <div className="d-flex justify-content-between align-items-center mt-2">
                    <div className="d-flex align-items-center">
                        <span
                            className={`badge ${statusColor} me-2`}
                            style={{fontSize: '0.9rem', fontWeight: '500'}}
                        >
                            {statusText}
                        </span>

                        <span
                            style={{
                                fontSize: '0.9rem',
                                color: '#543787',
                                fontWeight: '500',
                                background: '#f1f1f9',
                                padding: '4px 8px',
                                borderRadius: '8px'
                            }}
                        >
                            {contestTypeName}
                        </span>
                    </div>
                    <span style={{fontSize: '0.9rem', color: '#666'}}>
                        {isOpen ? "До" : "C"} {new Date(item.endBy).toLocaleDateString('ru-RU', {
                            day: '2-digit', month: 'long', year: 'numeric'
                        })}
                    </span>
                </div>

            </Card.Body>
        </Card>
    </Col>);
});

export default ContestCard;
