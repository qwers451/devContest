import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../context';
import { updateData, fetchData, deleteData, sendData, downloadFileOrZip } from '../services/apiService.js';

const ReviewPage = () => {
    const { number, reviewNumber } = useParams();
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showEdit, setShowEdit] = useState(false);
    const [editScore, setEditScore] = useState('');
    const [editCommentary, setEditCommentary] = useState('');
    const [saving, setSaving] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState(false);

    useEffect(() => {
        if (error === 'Отзыв не найден') {
            navigate(`/solution/${number}/reviews`, { replace: true });
        }
    }, [error, navigate, number]);

    useEffect(() => {
        (async () => {
            try {
                const sol = solution.getSolutionIfExists(number) || await solution.fetchSolutionByNumber(number);
                if (!sol) throw new Error('Решение не найдено');

                const isOwnerSol = user.user?.id === sol.executor_id;
                const isEmployer = user.user?.role === 'customer';
                if (!user.isAuth || (!isOwnerSol && !isEmployer)) {
                    throw new Error('Доступ запрещён');
                }

                const list = await fetchData(`/submissions/${sol.id}/reviews`);
                const rv = list.find(r => String(r.number) === reviewNumber);
                if (!rv) throw new Error('Отзыв не найден');

                rv.solutionId = sol.id;
                setReview(rv);
                setIsOwner(user.user?.id === rv.reviewer_id);
                setEditScore(rv.score);
                setEditCommentary(rv.commentary);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [number, reviewNumber, user.user, user.isAuth, solution]);

    const handleUploadFiles = async (e) => {
        const selected = Array.from(e.target.files || []);
        if (!selected.length) return;
        setUploadingFiles(true);
        try {
            const fd = new FormData();
            selected.forEach(f => fd.append('files', f));
            const updated = await sendData(`/submissions/${review.solutionId}/reviews/${review.number}/files`, fd, true);
            updated.solutionId = review.solutionId;
            setReview(updated);
        } catch (err) {
            setError('Ошибка загрузки файлов');
        } finally {
            setUploadingFiles(false);
            e.target.value = '';
        }
    };

    const handleDeleteFile = async (filename) => {
        try {
            const updated = await deleteData(`/submissions/${review.solutionId}/reviews/${review.number}/files/${filename}`);
            updated.solutionId = review.solutionId;
            setReview(updated);
        } catch {
            setError('Ошибка удаления файла');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { score: parseFloat(editScore), commentary: editCommentary.trim() };
            const updated = await updateData(`/submissions/${review.solutionId}/reviews/${review.number}`, payload);
            updated.solutionId = review.solutionId;
            setReview(updated);
            setShowEdit(false);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Удалить этот отзыв?')) return;
        try {
            await deleteData(`/submissions/${review.solutionId}/reviews/${review.number}`);
            navigate(`/solution/${number}/reviews`, { replace: true });
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Ошибка при удалении');
        }
    };

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 bg-white dark:bg-gray-700';
    const labelCls = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1';

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <span className="ml-3 text-gray-500 text-sm">Загрузка...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm mb-4">{error}</div>
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors">
                    Назад
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
            <div className="max-w-3xl mx-auto px-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in">
                    <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            Ревью #{review.number} к решению №{number}
                        </h3>
                    </div>
                    <div className="px-6 py-5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Оценка:</span>
                            <span className="px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold text-sm">
                                {review.score} / 10
                            </span>
                        </div>
                        <hr className="my-4 border-gray-100 dark:border-gray-700" />
                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{review.commentary}</p>

                        {/* Files */}
                        {(review.files?.length > 0 || isOwner) && (
                            <>
                                <hr className="my-4 border-gray-100 dark:border-gray-700" />
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Файлы</h4>
                                    {isOwner && (
                                        <label className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer ${uploadingFiles ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {uploadingFiles ? 'Загрузка...' : '↑ Добавить'}
                                            <input type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.zip" onChange={handleUploadFiles} className="hidden" />
                                        </label>
                                    )}
                                </div>
                                {review.files?.length > 0 ? (
                                    <ul className="space-y-1">
                                        {review.files.map((f, i) => (
                                            <li key={i} className="flex items-center gap-2">
                                                <button
                                                    onClick={() => downloadFileOrZip(`/submissions/${review.solutionId}/reviews/${review.number}/files/${f}`, f)}
                                                    className="text-violet-600 hover:underline text-sm font-medium"
                                                >{f}</button>
                                                {isOwner && (
                                                    <button onClick={() => handleDeleteFile(f)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">Файлы не прикреплены.</p>
                                )}
                            </>
                        )}
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
                        <button
                            onClick={() => navigate(-1)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-colors"
                        >
                            Назад
                        </button>
                        {isOwner && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowEdit(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 font-semibold text-sm transition-colors"
                                >
                                    Редактировать
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold text-sm transition-colors"
                                >
                                    Удалить
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit modal */}
            {showEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEdit(false)}>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-fade-in border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Редактировать отзыв #{review.number}</h3>
                        {error && (
                            <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">{error}</div>
                        )}
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className={labelCls}>Оценка</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={editScore}
                                    onChange={e => setEditScore(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Комментарий</label>
                                <textarea
                                    rows={4}
                                    value={editCommentary}
                                    onChange={e => setEditCommentary(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowEdit(false)}
                                disabled={saving}
                                className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors disabled:opacity-60"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                            >
                                {saving ? 'Сохранение...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default observer(ReviewPage);
