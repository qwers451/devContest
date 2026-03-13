import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { sendData } from '../services/apiService.js';

const CreateReview = () => {
    const { number } = useParams();
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [currentSolution, setCurrentSolution] = useState(null);
    const [loadingSolution, setLoadingSolution] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [score, setScore] = useState('');
    const [commentary, setCommentary] = useState('');
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
            await sendData(`/submissions/${currentSolution.id}/reviews`, payload);
            navigate(`/solution/${number}`);
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'Не удалось отправить отзыв');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white';
    const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

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
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-xl mx-auto px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-900 mb-5">
                        Добавить отзыв к решению №{number}
                    </h2>

                    {submitError && (
                        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
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
                        <div className="flex justify-between pt-2">
                            <button
                                type="button"
                                onClick={() => navigate(`/solution/${number}`)}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors disabled:opacity-60"
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
