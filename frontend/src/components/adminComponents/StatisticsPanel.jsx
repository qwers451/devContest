import React, { useState, useEffect, useContext } from 'react';
import {Button, Card} from "react-bootstrap";
import { Bar } from 'react-chartjs-2';
import { observer } from 'mobx-react-lite';
import { Context } from "../../main.jsx";
import { Chart } from 'chart.js';
import {
    BarController, BarElement, CategoryScale, LinearScale,
    Tooltip, Legend
} from 'chart.js';
import FiltersBar from "../FiltersBar.jsx";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const StatisticsPanel = observer(() => {
    const { contest } = useContext(Context);
    const [selectedX, setSelectedX] = useState('type');
    const [selectedY, setSelectedY] = useState('prizepool');
    const [updateCounter, setUpdateCounter] = useState(0);

    useEffect(() => {
        contest.fetchStatistics(selectedX, selectedY);
    }, [selectedX, selectedY, updateCounter]);

    const handleResetFilters = () => {
        contest.resetFilters();
    };

    const xOptions = [
        { value: 'type', label: 'Тип конкурса' },
        { value: 'status', label: 'Статус' },
        { value: 'createdAt', label: 'Дата создания' },
        { value: 'endBy', label: 'Дата окончания' },
        { value: 'prizepool', label: 'Призовой фонд' },
    ];

    const yOptions = [
        { value: 'type', label: 'Тип конкурса' },
        { value: 'status', label: 'Статус' },
        { value: 'createdAt', label: 'Дата создания' },
        { value: 'endBy', label: 'Дата окончания' },
        { value: 'prizepool', label: 'Призовой фонд' },
        { value: 'count', label: 'Количество' }
    ];

    const { statistics } = contest;
    if (!statistics || !statistics.x_labels) {
        return (
            <div>
                <Card className="shadow-sm">
                    <Card.Body>
                        <h2 style={{ color: "#543787" }}>Статистика</h2>
                        <p className="text-muted">Загрузка...</p>
                    </Card.Body>
                </Card>
            </div>
        );
    }

    let labels = statistics.x_labels;
    if (selectedX === 'type' && contest.types) {
        const typeMap = contest.types.reduce((map, t) => ({ ...map, [t.id]: t.name }), {});
        labels = labels.map(id => typeMap[id] || id);
    } else if (selectedX === 'status' && contest.status) {
        const statusMap = contest.status;
        labels = labels.map(id => statusMap[id] || id);
    }

    let datasets = statistics.datasets;
    if (selectedY === 'type' && contest.types) {
        const typeMap = contest.types.reduce((map, t) => ({ ...map, [t.id]: t.name }), {});
        datasets = datasets.map(ds => ({ ...ds, label: typeMap[ds.label] || ds.label }));
    } else if (selectedY === 'status' && contest.status) {
        const statusMap = contest.status;
        datasets = datasets.map(ds => ({ ...ds, label: statusMap[ds.label] || ds.label }));
    }

    const colors = ['#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#4bc0c0'];
    datasets = datasets.map((ds, index) => ({
        ...ds,
        backgroundColor: colors[index % colors.length]
    }));

    const chartData = {
        labels,
        datasets
    };

    const chartOptions = {
        scales: {
            y: {
                ticks: {
                    precision: 0
                },
                beginAtZero: true
            }
        }
    };

    return (
        <div>
            <Card className="shadow-sm">
                <Card.Body>
                    <h2 style={{ color: "#543787" }}>Статистика</h2>
                    <FiltersBar />
                    <div className='mt-3' style={{ marginBottom: '20px' }}>
                        <label style={{ marginRight: '10px' }}>Ось X: </label>
                        <select value={selectedX} onChange={e => setSelectedX(e.target.value)}>
                            {xOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <label className='ms-2' style={{ marginRight: '10px' }}>Ось Y: </label>
                        <select value={selectedY} onChange={e => setSelectedY(e.target.value)}>
                            {yOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <Button onClick={() => setUpdateCounter(prev => prev + 1)} className="ms-3">Применить фильтры</Button>
                        <Button
                            onClick={handleResetFilters}
                            variant="outline-secondary"
                            size="sm"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: '500',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '14px',
                                height: '35px',
                                lineHeight: '1',
                            }}
                        >
                            Сбросить фильтры
                        </Button>
                    </div>
                    <Bar data={chartData} options={chartOptions} />
                </Card.Body>
            </Card>
        </div>
    );
});

export default StatisticsPanel;
