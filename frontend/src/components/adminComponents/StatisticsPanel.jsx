import React, { useState, useEffect, useContext } from 'react';
import { Bar } from 'react-chartjs-2';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Chart } from 'chart.js';
import {
    BarController, BarElement, CategoryScale, LinearScale,
    Tooltip, Legend
} from 'chart.js';
import FiltersBar from '../FiltersBar.jsx';

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

    const selectCls = 'px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm text-gray-700 bg-white';

    if (!statistics || !statistics.x_labels) {
        return (
            <div>
                <h2 className="text-xl font-bold text-violet-700 mb-2">Статистика</h2>
                <p className="text-gray-400 text-sm">Загрузка...</p>
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

    const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    datasets = datasets.map((ds, index) => ({
        ...ds,
        backgroundColor: colors[index % colors.length]
    }));

    const chartData = { labels, datasets };
    const chartOptions = {
        scales: { y: { ticks: { precision: 0 }, beginAtZero: true } }
    };

    return (
        <div>
            <h2 className="text-xl font-bold text-violet-700 mb-4">Статистика</h2>
            <FiltersBar />
            <div className="flex items-center gap-4 flex-wrap mt-4 mb-5">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700">Ось X:</label>
                    <select value={selectedX} onChange={e => setSelectedX(e.target.value)} className={selectCls}>
                        {xOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700">Ось Y:</label>
                    <select value={selectedY} onChange={e => setSelectedY(e.target.value)} className={selectCls}>
                        {yOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => setUpdateCounter(prev => prev + 1)}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
                >
                    Применить
                </button>
                <button
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold text-sm transition-colors"
                >
                    Сбросить фильтры
                </button>
            </div>
            <Bar data={chartData} options={chartOptions} />
        </div>
    );
});

export default StatisticsPanel;
