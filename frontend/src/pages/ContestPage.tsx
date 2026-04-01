import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Context } from '../context';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import { deleteData, fetchData, sendData, downloadFileOrZip } from '../services/apiService.js';
import type { ContestRequirementsOut, ContestStatsOut } from '../types';
import { BsTrophy } from 'react-icons/bs';

const statusConfig = {
    active:    { label: 'Активный',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    draft:     { label: 'Черновик',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    finished:  { label: 'Завершённый', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
    cancelled: { label: 'Отменённый', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

const ContestPage = () => {
    const { contest, user } = useContext(Context);
    const { number } = useParams();
    const [currentContest, setCurrentContest] = useState(null);
    const [error, setError] = useState(null);
    const [editingStages, setEditingStages] = useState(false);
    const [draftStages, setDraftStages] = useState([]);
    const [savingStages, setSavingStages] = useState(false);
    const [uploadingTz, setUploadingTz] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState(false);
    const [requirements, setRequirements] = useState<ContestRequirementsOut | null>(null);
    const [stats, setStats] = useState<ContestStatsOut | null>(null);
    const [extractingReqs, setExtractingReqs] = useState(false);
    const [activeTab, setActiveTab] = useState('description');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchContest = async () => {
            const fetched = await contest.fetchOneContestByNumber(number);
            if (fetched) {
                setCurrentContest(fetched);
                if (fetched.customer_id) user.fetchUserById(fetched.customer_id);
            } else {
                setError('Конкурс не найден.');
            }
        };
        fetchContest();
    }, [number]);

    useEffect(() => {
        if (currentContest?.customer_id) user.fetchUserById(currentContest.customer_id);
    }, [currentContest?.customer_id]);

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    useEffect(() => {
        if (!currentContest) return;
        const id = currentContest.id;
        fetchData<ContestRequirementsOut>(`/evaluation/requirements/${id}`, {}, { silent: true })
            .then(setRequirements)
            .catch(() => setRequirements(null));
        fetchData<ContestStatsOut>(`/evaluation/contest/${id}/stats`, {}, { silent: true })
            .then(setStats)
            .catch(() => setStats(null));
    }, [currentContest?.id]);

    if (error) return <div className="max-w-5xl mx-auto px-4 py-10 text-red-500">{error}</div>;
    if (!currentContest) return (
        <div className="flex justify-center items-center min-h-64">
            <div className="w-8 h-8 rounded-full border-4 border-violet-200 dark:border-violet-800 border-t-violet-600 dark:border-t-violet-400 animate-spin" />
        </div>
    );

    const isAdmin = user.user && user.user.role === 'admin';
    const isOwner = user.getCurrentUserId() === currentContest.customer_id;
    const isFreelancer = user.user && user.user.role === 'executor';
    const isFinished = currentContest.status === 'finished';

    const handleTzFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingTz(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const updated = await sendData(`/contests/${currentContest.id}/tz-file`, formData, true);
            setCurrentContest(updated);
        } catch (err) {
            alert(err?.response?.data?.detail || 'Не удалось загрузить файл ТЗ');
        } finally {
            setUploadingTz(false);
            e.target.value = '';
        }
    };

    const handleDeleteFile = async (fileName) => {
        try {
            const updated = await deleteData(`/contests/${currentContest.id}/files/${fileName}`);
            setCurrentContest(updated);
        } catch (err) {
            alert('Ошибка удаления файла');
        }
    };

    const handleUploadFiles = async (e) => {
        const selected = Array.from(e.target.files || []);
        if (!selected.length) return;
        setUploadingFiles(true);
        try {
            const formData = new FormData();
            selected.forEach(f => formData.append('files', f));
            const updated = await sendData(`/contests/${currentContest.id}/files`, formData, true);
            setCurrentContest(updated);
        } catch (err) {
            alert(err?.response?.data?.detail || 'Ошибка загрузки файлов');
        } finally {
            setUploadingFiles(false);
            e.target.value = '';
        }
    };

    const handleExtractRequirements = async () => {
        if (!currentContest.tz_text) return;
        setExtractingReqs(true);
        try {
            const result = await sendData<ContestRequirementsOut>(
                `/evaluation/requirements/${currentContest.id}`,
                { tz_text: currentContest.tz_text }
            );
            setRequirements(result);
        } catch (err) {
            alert(err?.response?.data?.detail || 'Не удалось извлечь требования');
        } finally {
            setExtractingReqs(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Вы точно хотите удалить этот конкурс?')) return;
        try {
            await deleteData(`/contests/${currentContest.id}`);
            navigate('/');
        } catch (e) {
            console.error(e);
            alert('Не удалось удалить конкурс');
        }
    };

    const sortedStages = [...(currentContest.stages || [])].sort((a, b) => a.order - b.order);

    const activeStageId = currentContest.current_stage_id ?? (() => {
        if (sortedStages.length === 0) return null;
        const now = new Date();
        const upcoming = sortedStages.filter(s => s.deadline && new Date(s.deadline) >= now);
        return upcoming.length > 0 ? upcoming[0].id : sortedStages[sortedStages.length - 1].id;
    })();

    const handleSetCurrentStage = async (stageId) => {
        try {
            const newId = (currentContest.current_stage_id === stageId) ? null : stageId;
            const updated = await contest.setCurrentStage(currentContest.id, newId);
            setCurrentContest(updated);
        } catch (e) {
            console.error(e);
            alert('Не удалось изменить текущий этап');
        }
    };

    const startEditingStages = () => {
        setDraftStages(sortedStages.map(s => ({
            ...s,
            deadline: s.deadline ? s.deadline.slice(0, 10) : '',
        })));
        setEditingStages(true);
    };

    const addDraftStage = () => {
        setDraftStages(prev => [...prev, { name: '', description: '', deadline: '', order: prev.length + 1 }]);
    };

    const removeDraftStage = (idx) => {
        setDraftStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
    };

    const updateDraftStage = (idx, field, value) => {
        setDraftStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const saveStages = async () => {
        setSavingStages(true);
        try {
            const payload = draftStages
                .filter(s => s.name.trim())
                .map((s, i) => ({
                    name: s.name,
                    description: s.description || undefined,
                    deadline: s.deadline ? new Date(s.deadline).toISOString() : undefined,
                    order: i + 1,
                }));
            const updated = await contest.updateStages(currentContest.id, payload);
            setCurrentContest(updated);
            setEditingStages(false);
        } catch (e) {
            console.error(e);
            alert('Не удалось сохранить этапы');
        } finally {
            setSavingStages(false);
        }
    };

    const status = statusConfig[currentContest.status] || statusConfig.draft;
    const typeName = contest.getTypeNameById(currentContest.type_id);

    const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:outline-none text-gray-800 dark:text-gray-200 text-sm bg-white dark:bg-gray-700';
    const btnSecondary = 'inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none';

    const tabs = [
        { id: 'description', label: 'Описание' },
        { id: 'stages', label: 'Этапы' },
        ...((stats || requirements || isAdmin || isOwner) ? [{ id: 'ai', label: 'Анализ ИИ' }] : [])
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
            <div className="max-w-4xl mx-auto px-4">
                <nav className="flex items-center gap-2 mb-4 text-sm" aria-label="Хлебные крошки">
                    <button
                        onClick={() => navigate('/contests')}
                        className="text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950 focus:outline-none rounded"
                    >
                        Конкурсы
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">/</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-xs">{currentContest.title}</span>
                </nav>

                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in flex flex-col min-h-[500px]">
                    <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
                                    {currentContest.title}
                                </h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
                                        {status.label}
                                    </span>
                                    {typeName && (
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                            {typeName}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                    {Number(currentContest.prizepool).toLocaleString('ru')} ₽
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    До {new Date(currentContest.ends_at).toLocaleDateString('ru-RU')}
                                </div>
                            </div>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            Создатель: <span className="font-medium text-violet-600 dark:text-violet-400">
                                @{user.getById(currentContest.customer_id)?.login || '...'}
                            </span>
                        </div>
                    </div>

                    {isFinished && currentContest.winner && (
                        <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50 flex items-center gap-3">
                            <span className="text-emerald-600 dark:text-emerald-400"><BsTrophy className="w-5 h-5" /></span>
                            <div>
                                <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Конкурс завершён — победитель выбран!</p>
                                <button
                                    onClick={() => navigate(`/solution/${currentContest.winner.submission_id}`)}
                                    className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 font-medium text-sm underline mt-0.5 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-emerald-900 focus:outline-none rounded"
                                >
                                    Перейти к победившему решению
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-1 border-b border-gray-100 dark:border-gray-700 overflow-x-auto px-4 pt-2">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none rounded-t-lg ${activeTab === tab.id
                                    ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 px-6 py-5">
                        {activeTab === 'description' && (
                            <div className="space-y-6 animate-fade-in">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-3">Описание проекта</h2>
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                                        <Markdown options={{ disableParsingRawHTML: true }}>
                                            {currentContest.description || ''}
                                        </Markdown>
                                    </div>
                                </div>

                                {(currentContest.tz_text || currentContest.tz_filename || (isOwner || isAdmin)) && (
                                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Техническое задание</h3>
                                            {currentContest.tz_filename && (
                                                <button
                                                    onClick={() => downloadFileOrZip(`/contests/${currentContest.id}/tz-file`, currentContest.tz_filename)}
                                                    className={btnSecondary}
                                                    aria-label={`Скачать ТЗ ${currentContest.tz_filename}`}
                                                >
                                                    ↓ {currentContest.tz_filename}
                                                </button>
                                            )}
                                            {(isOwner || isAdmin) && !isFinished && (
                                                <label className={`${btnSecondary} cursor-pointer ${uploadingTz ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {uploadingTz ? 'Загрузка...' : '↑ PDF / DOCX'}
                                                    <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleTzFileUpload} />
                                                </label>
                                            )}
                                        </div>
                                        {currentContest.tz_text ? (
                                            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 font-sans">
                                                {currentContest.tz_text}
                                            </pre>
                                        ) : (
                                            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Текст ТЗ не извлечён. Загрузите PDF или DOCX.</p>
                                        )}
                                    </div>
                                )}

                                {(currentContest.files?.length > 0 || (isOwner || isAdmin)) && (
                                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-3 mb-3">
                                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Файлы</h3>
                                            {(isOwner || isAdmin) && !isFinished && (
                                                <label className={`${btnSecondary} cursor-pointer ${uploadingFiles ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {uploadingFiles ? 'Загрузка...' : '↑ Добавить файлы'}
                                                    <input type="file" multiple className="hidden" onChange={handleUploadFiles} />
                                                </label>
                                            )}
                                        </div>
                                        {currentContest.files?.length > 0 ? (
                                            <ul className="space-y-2">
                                                {currentContest.files.map((fileName, idx) => (
                                                    <li key={idx} className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => downloadFileOrZip(`/contests/${currentContest.id}/files/${fileName}`, fileName)}
                                                            className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none rounded"
                                                        >
                                                            {fileName}
                                                        </button>
                                                        {(isOwner || isAdmin) && !isFinished && (
                                                            <button
                                                                onClick={() => handleDeleteFile(fileName)}
                                                                className="text-red-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
                                                                aria-label={`Удалить файл ${fileName}`}
                                                                title="Удалить файл"
                                                            >✕</button>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Файлы не прикреплены.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'stages' && (
                            <div className="animate-fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Таймлайн конкурса</h3>
                                    {(isOwner || isAdmin) && !isFinished && !editingStages && (
                                        <button onClick={startEditingStages} className={btnSecondary}>
                                            Редактировать этапы
                                        </button>
                                    )}
                                </div>

                                {editingStages ? (
                                    <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-800">
                                        {draftStages.map((stage, idx) => (
                                            <div key={idx} className="flex flex-wrap items-center gap-2 mb-3">
                                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400 w-5">{idx + 1}.</span>
                                                <input
                                                    placeholder="Название этапа"
                                                    value={stage.name}
                                                    onChange={e => updateDraftStage(idx, 'name', e.target.value)}
                                                    className={`flex-1 min-w-[150px] ${inputCls}`}
                                                    aria-label={`Название этапа ${idx + 1}`}
                                                />
                                                <input
                                                    type="date"
                                                    value={stage.deadline}
                                                    onChange={e => updateDraftStage(idx, 'deadline', e.target.value)}
                                                    className={`w-36 flex-shrink-0 ${inputCls}`}
                                                    aria-label={`Дедлайн этапа ${idx + 1}`}
                                                />
                                                <input
                                                    placeholder="Описание (необязательно)"
                                                    value={stage.description || ''}
                                                    onChange={e => updateDraftStage(idx, 'description', e.target.value)}
                                                    className={`flex-1 min-w-[150px] ${inputCls}`}
                                                    aria-label={`Описание этапа ${idx + 1}`}
                                                />
                                                <button
                                                    onClick={() => removeDraftStage(idx)}
                                                    className="p-2 rounded-lg border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none"
                                                    aria-label={`Удалить этап ${idx + 1}`}
                                                >✕</button>
                                            </div>
                                        ))}
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            <button
                                                onClick={addDraftStage}
                                                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus:outline-none"
                                            >
                                                + Добавить этап
                                            </button>
                                            <button
                                                onClick={saveStages}
                                                disabled={savingStages}
                                                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-emerald-500 focus:outline-none"
                                            >
                                                {savingStages ? 'Сохранение...' : 'Сохранить'}
                                            </button>
                                            <button
                                                onClick={() => setEditingStages(false)}
                                                className={btnSecondary}
                                            >
                                                Отмена
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sortedStages.length === 0 && (
                                            <p className="text-sm text-gray-400 dark:text-gray-500">Этапы не добавлены. Конкурс завершится в указанный срок.</p>
                                        )}
                                        {sortedStages.map((stage) => {
                                            const isActive = stage.id === activeStageId;
                                            const isManual = currentContest.current_stage_id != null;
                                            return (
                                                <div
                                                    key={stage.id}
                                                    className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}
                                                >
                                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isActive ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                                        {stage.order}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{stage.name}</span>
                                                            {isActive && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                                                                    Текущий {isManual ? '' : '(авто)'}
                                                                </span>
                                                            )}
                                                            {stage.deadline && (
                                                                <span className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-2 py-0.5 rounded shadow-sm border border-gray-100 dark:border-gray-700">
                                                                    до {new Date(stage.deadline).toLocaleDateString('ru-RU')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {stage.description && (
                                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{stage.description}</p>
                                                        )}
                                                    </div>
                                                    {(isOwner || isAdmin) && !isFinished && (
                                                        <button
                                                            onClick={() => handleSetCurrentStage(stage.id)}
                                                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus:outline-none ${isActive && isManual ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                                        >
                                                            {isActive && isManual ? '✓ Текущий' : 'Назначить'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div className="animate-fade-in">
                                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                                    <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Система оценки требований</h3>
                                    {(isOwner || isAdmin) && currentContest.tz_text && (
                                        <button
                                            onClick={handleExtractRequirements}
                                            disabled={extractingReqs}
                                            className={`${btnSecondary} ${extractingReqs ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            {extractingReqs ? 'Анализ ТЗ...' : '⚙ Извлечь/Обновить требования'}
                                        </button>
                                    )}
                                </div>

                                {stats && stats.evaluated_count > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-700">
                                            <div className="text-3xl font-black text-gray-800 dark:text-gray-100">{stats.evaluated_count}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Решений оценено</div>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-700">
                                            <div className="text-3xl font-black text-violet-600 dark:text-violet-400">
                                                {stats.avg_score !== null ? `${stats.avg_score}%` : '—'}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Средний балл</div>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-700">
                                            <div className="text-3xl font-black text-red-500 dark:text-red-400">{stats.critical_issues_count}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Крит. нарушений</div>
                                        </div>
                                    </div>
                                )}

                                {requirements && requirements.requirements.length > 0 ? (
                                    <div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                            Критерии извлечены из ТЗ · <span className="font-medium">{new Date(requirements.cached_at).toLocaleDateString('ru-RU')}</span>
                                        </p>
                                        <ul className="space-y-2">
                                            {requirements.requirements.map((req, i) => (
                                                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                                                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${req.is_critical ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`} title={req.is_critical ? 'Критическое требование' : 'Обычное требование'}>
                                                        {req.is_critical ? '!' : '·'}
                                                    </span>
                                                    <span className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-snug">
                                                        {req.text}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                                        <p className="text-gray-500 dark:text-gray-400">Требования пока не извлечены. Анализ недоступен.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-3 mt-auto">
                        {(isFreelancer && !isFinished) && (
                            <button
                                onClick={() => navigate(`/contest/${currentContest.number}/create-solution`)}
                                className="flex-1 sm:flex-none min-h-[44px] inline-flex justify-center items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-all duration-200 shadow-sm focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus:outline-none"
                            >
                                Отправить решение
                            </button>
                        )}
                        {(isAdmin || isOwner) && (
                            <>
                                {isOwner && currentContest.status === 'draft' && (
                                    <button
                                        onClick={() => navigate(`/payment/checkout?contest_id=${currentContest.id}&amount=${currentContest.prizepool}`)}
                                        className="flex-1 sm:flex-none min-h-[44px] inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus:outline-none"
                                    >
                                        Оплатить и опубликовать
                                    </button>
                                )}
                                <button
                                    onClick={() => navigate(`/contest/${currentContest.number}/solutions`)}
                                    className="flex-1 sm:flex-none min-h-[44px] inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus:outline-none"
                                >
                                    Решения
                                </button>
                                {isOwner && !isFinished && (
                                    <button
                                        onClick={() => navigate(`/contest/edit/${currentContest.number}`, { state: JSON.parse(JSON.stringify(currentContest)) })}
                                        className="flex-1 sm:flex-none min-h-[44px] inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 font-semibold text-sm transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus:outline-none"
                                    >
                                        Редактировать
                                    </button>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={handleDelete}
                                        className="flex-1 sm:flex-none min-h-[44px] inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus:outline-none"
                                    >
                                        Удалить
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default observer(ContestPage);
