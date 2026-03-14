import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Context } from '../main.jsx';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import { deleteData, sendData } from '../services/apiService.js';

const statusConfig = {
    active:    { label: 'Активный',    cls: 'bg-emerald-100 text-emerald-700' },
    draft:     { label: 'Черновик',    cls: 'bg-gray-100 text-gray-600' },
    finished:  { label: 'Завершённый', cls: 'bg-violet-100 text-violet-700' },
    cancelled: { label: 'Отменённый', cls: 'bg-red-100 text-red-600' },
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
    const navigate = useNavigate();

    useEffect(() => {
        if (contest.currentContest && contest.currentContest.number == number) {
            setCurrentContest(contest.currentContest);
        } else {
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
        }
    }, [number, contest.currentContest]);

    useEffect(() => {
        if (currentContest?.customer_id) user.fetchUserById(currentContest.customer_id);
    }, [currentContest?.customer_id]);

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    if (error) return <div className="max-w-5xl mx-auto px-4 py-10 text-red-500">{error}</div>;
    if (!currentContest) return (
        <div className="flex justify-center items-center min-h-64">
            <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
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

    const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-sm bg-white';

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-4xl mx-auto px-4">
                {/* Main Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    {/* Header */}
                    <div className="px-6 py-5 border-b border-gray-100">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">
                                    {currentContest.title}
                                </h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
                                        {status.label}
                                    </span>
                                    {typeName && (
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                            {typeName}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className="text-2xl font-black text-emerald-600">
                                    {Number(currentContest.prizepool).toLocaleString('ru')} ₽
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">
                                    До {new Date(currentContest.ends_at).toLocaleDateString('ru-RU')}
                                </div>
                            </div>
                        </div>
                        <div className="text-sm text-gray-500 mt-2">
                            Создатель: <span className="font-medium text-violet-600">
                                @{user.getById(currentContest.customer_id)?.login || '...'}
                            </span>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5">
                        {/* Winner block */}
                        {isFinished && (
                            <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                                <span className="text-2xl">🏆</span>
                                <div>
                                    <p className="font-semibold text-emerald-800 text-sm">Конкурс завершён — победитель выбран!</p>
                                    {currentContest.winner && (
                                        <button
                                            onClick={() => navigate(`/solution/${currentContest.winner.submission_id}`)}
                                            className="text-emerald-700 hover:text-emerald-900 font-medium text-sm underline mt-0.5"
                                        >
                                            Перейти к победившему решению
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Description */}
                        <h2 className="text-lg font-bold text-gray-800 mb-3">Описание проекта</h2>
                        <div className="prose prose-sm max-w-none text-gray-700">
                            <Markdown options={{ disableParsingRawHTML: true }}>
                                {currentContest.description || ''}
                            </Markdown>
                        </div>

                        {/* Technical specification */}
                        {(currentContest.tz_text || (isOwner || isAdmin)) && (
                            <>
                                <hr className="my-5 border-gray-100" />
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-base font-bold text-gray-800">Техническое задание</h3>
                                    {(isOwner || isAdmin) && !isFinished && (
                                        <label className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 font-medium transition-colors cursor-pointer ${uploadingTz ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {uploadingTz ? 'Загрузка...' : '↑ PDF / DOCX'}
                                            <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleTzFileUpload} />
                                        </label>
                                    )}
                                </div>
                                {currentContest.tz_text ? (
                                    <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        {currentContest.tz_text}
                                    </pre>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">Техническое задание не заполнено. Загрузите PDF или DOCX.</p>
                                )}
                            </>
                        )}

                        {/* Stages */}
                        {(sortedStages.length > 0 || ((isOwner || isAdmin) && !isFinished)) && (
                            <>
                                <hr className="my-5 border-gray-100" />
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-base font-bold text-gray-800">Этапы конкурса</h3>
                                    {(isOwner || isAdmin) && !isFinished && !editingStages && (
                                        <button
                                            onClick={startEditingStages}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                                        >
                                            Редактировать этапы
                                        </button>
                                    )}
                                </div>

                                {editingStages ? (
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        {draftStages.map((stage, idx) => (
                                            <div key={idx} className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="text-xs font-bold text-gray-500 w-5">{idx + 1}.</span>
                                                <input
                                                    placeholder="Название этапа"
                                                    value={stage.name}
                                                    onChange={e => updateDraftStage(idx, 'name', e.target.value)}
                                                    className={`flex-1 min-w-32 ${inputCls}`}
                                                />
                                                <input
                                                    type="date"
                                                    value={stage.deadline}
                                                    onChange={e => updateDraftStage(idx, 'deadline', e.target.value)}
                                                    className={`w-36 ${inputCls}`}
                                                />
                                                <input
                                                    placeholder="Описание (необязательно)"
                                                    value={stage.description || ''}
                                                    onChange={e => updateDraftStage(idx, 'description', e.target.value)}
                                                    className={`flex-1 min-w-32 ${inputCls}`}
                                                />
                                                <button
                                                    onClick={() => removeDraftStage(idx)}
                                                    className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={addDraftStage}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 text-xs font-medium transition-colors"
                                            >
                                                + Добавить этап
                                            </button>
                                            <button
                                                onClick={saveStages}
                                                disabled={savingStages}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                                            >
                                                {savingStages ? 'Сохранение...' : 'Сохранить'}
                                            </button>
                                            <button
                                                onClick={() => setEditingStages(false)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium transition-colors"
                                            >
                                                Отмена
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {sortedStages.length === 0 && (
                                            <p className="text-sm text-gray-400">Этапы не добавлены. Нажмите «Редактировать этапы», чтобы добавить.</p>
                                        )}
                                        {sortedStages.map((stage) => {
                                            const isActive = stage.id === activeStageId;
                                            const isManual = currentContest.current_stage_id != null;
                                            return (
                                                <div
                                                    key={stage.id}
                                                    className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${isActive ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-100'}`}
                                                >
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isActive ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                                                        {stage.order}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-sm text-gray-800">{stage.name}</span>
                                                            {isActive && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                                    Текущий {isManual ? '' : '(авто)'}
                                                                </span>
                                                            )}
                                                            {stage.deadline && (
                                                                <span className="text-xs text-gray-400">
                                                                    до {new Date(stage.deadline).toLocaleDateString('ru-RU')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {stage.description && (
                                                            <p className="text-xs text-gray-500 mt-0.5">{stage.description}</p>
                                                        )}
                                                    </div>
                                                    {(isOwner || isAdmin) && !isFinished && (
                                                        <button
                                                            onClick={() => handleSetCurrentStage(stage.id)}
                                                            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isActive && isManual ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                                        >
                                                            {isActive && isManual ? '✓ Текущий' : 'Назначить'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                    </div>

                    {/* Footer actions */}
                    {(isFreelancer && !isFinished) && (
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                            <button
                                onClick={() => navigate(`/contest/${currentContest.number}/create-solution`)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-all duration-200 shadow-sm"
                            >
                                Создать решение
                            </button>
                        </div>
                    )}

                    {(isAdmin || isOwner) && (
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2">
                            <button
                                onClick={() => navigate(`/contest/${currentContest.number}/solutions`)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
                            >
                                Просмотреть решения
                            </button>
                            {isOwner && !isFinished && (
                                <button
                                    onClick={() => navigate(`/contest/edit/${currentContest.number}`, { state: JSON.parse(JSON.stringify(currentContest)) })}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold text-sm transition-colors"
                                >
                                    Редактировать конкурс
                                </button>
                            )}
                            {isAdmin && (
                                <button
                                    onClick={handleDelete}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                                >
                                    Удалить конкурс
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default observer(ContestPage);
