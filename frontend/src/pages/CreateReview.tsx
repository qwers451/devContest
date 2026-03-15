import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../context';
import { sendData } from '../services/apiService.js';

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'application/zip', 'application/x-zip-compressed'];

const CreateReview = () => {
    const { number } = useParams();
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [currentSolution, setCurrentSolution] = useState(null);
    const [loadingSolution, setLoadingSolution] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [score, setScore] = useState('');
    const [commentary, setCommentary] = useState('');
    const [files, setFiles] = useState([]);
    const [submitError, setSubmitError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                let sol = solution.getSolutionIfExists(number);
                if (!sol) sol = await solution.fetchSolutionByNumber(number);
                if (!sol) throw new Error('Решение не найдено');
                setCurrentSolution(sol);
            } catch (err) {
                setLoadError(err.message);
            } finally {
                setLoadingSolution(false);
            }
        })();
    }, [number]);

    useEffect(() => {
        if (!loadingSolution && !loadError) {
            if (!user.isAuth || user.user.role !== 'customer') {
                navigate(`/solution/${number}`, { replace: true });
            }
        }
    }, [loadingSolution, loadError, user.isAuth, user.user, navigate, number]);

    const handleFilesChange = (e) => {
        const selected = Array.from(e.target.files || []).filter(f => ALLOWED_TYPES.includes(f.type));
        setFiles(prev => {
            const merged = [...prev];
            for (const f of selected) {
                if (!merged.find(e => e.name === f.name)) merged.push(f);
            }
            return merged;
        });
        e.target.value = '';
    };

    const removeFile = (name) => setFiles(prev => prev.filter(f => f.name !== name));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError(null);
        if (!score || !commentary) {
            setSubmitError('Заполните все поля');
            return;
        }
        setSubmitting(true);
        try {
            const payload = { score: parseFloat(score), commentary: commentary.trim() };
            const review = await sendData(`/submissions/${currentSolution.id}/reviews`, payload);

            // Upload files if any
            if (files.length > 0) {
                const fd = new FormData();
                files.forEach(f => fd.append('files', f));
                await sendData(`/submissions/${currentSolution.id}/reviews/${review.number}/files`, fd, true);
            }

            navigate(`/solution/${number}`);
        } catch (err) {
            setSubmitError(err.response?.data?.error || err.response?.data?.detail || 'Не удалось отправить отзыв');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 bg-white dark:bg-gray-700';
    const labelCls = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1';

    if (loadingSolution) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <span className="ml-3 text-gray-500 text-sm">Загрузка решения...</span>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="max-w-xl mx-auto px-4 py-10">
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                    Ошибка: {loadError}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
            <div className="max-w-xl mx-auto px-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-5">
                        Добавить отзыв к решению №{number}
                    </h2>

                    {submitError && (
                        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                            {submitError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className={labelCls}>Оценка (0–10)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="10"
                                value={score}
                                onChange={e => setScore(e.target.value)}
                                placeholder="Например, 8.5"
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Комментарий</label>
                            <textarea
                                rows={5}
                                value={commentary}
                                onChange={e => setCommentary(e.target.value)}
                                placeholder="Ваши замечания и рекомендации"
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Файлы (необязательно)</label>
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                                ↑ Добавить файлы
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx,.png,.jpg,.jpeg,.zip"
                                    onChange={handleFilesChange}
                                    className="hidden"
                                />
                            </label>
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {files.map(f => (
                                        <li key={f.name} className="flex items-center gap-2 text-sm text-gray-600">
                                            <span className="truncate max-w-xs">{f.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(f.name)}
                                                className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                                            >✕</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex justify-between pt-2">
                            <button
                                type="button"
                                onClick={() => navigate(`/solution/${number}`)}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors disabled:opacity-60"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                            >
                                {submitting ? 'Отправка...' : 'Добавить отзыв'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default observer(CreateReview);
