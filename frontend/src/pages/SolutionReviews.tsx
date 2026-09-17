import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../context';
import { fetchData } from '../services/apiService.js';

const SolutionReviews = () => {
    const { number } = useParams();
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            setError(null);
            setLoading(true);
            try {
                const sol = solution.getSolutionIfExists(number) || await solution.fetchSolutionByNumber(number);
                if (!sol) throw new Error('Решение не найдено');

                const isOwner = user.user?.id === sol.executor_id;
                const isEmployer = user.user?.role === 'customer';
                if (!user.isAuth || (!isOwner && !isEmployer)) {
                    throw new Error('Доступ запрещён');
                }

                const data = await fetchData(`/submissions/${sol.id}/reviews`);
                setReviews(data);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [number]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <span className="ml-3 text-gray-500 text-[13px]">Загрузка отзывов...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-10">
                <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-[13px]">{error}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 py-6">
            <div className="max-w-4xl mx-auto px-4">
                <h2 className="text-[17px] font-medium text-gray-100 mb-6">
                    Отзывы к решению №{number}
                </h2>

                {reviews.length === 0 ? (
                    <div className="bg-gray-900 rounded-lg border border-gray-700 p-8 text-center">
                        <p className="text-gray-400 text-[13px]">Ещё нет отзывов.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reviews.map(r => (
                            <div
                                key={r.number}
                                onClick={() => navigate(`/solution/${number}/review/${r.number}`)}
                                className="group bg-gray-900 rounded-lg border border-gray-700 hover: hover:border-violet-100 dark:hover:border-violet-700 hover:-translate-y-1 transition-all duration-300 cursor-pointer p-5 animate-fade-in"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-gray-100 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
                                        Ревью #{r.number}
                                    </h4>
                                    <span className="px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-medium text-xs">
                                        {r.score} / 10
                                    </span>
                                </div>
                                <p className="text-[13px] text-gray-400 line-clamp-3">
                                    {r.commentary.length > 100 ? r.commentary.slice(0, 100) + '…' : r.commentary}
                                </p>
                                {r.files?.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-2">
                                        📎 {r.files.length} {r.files.length === 1 ? 'файл' : 'файлов'}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6">
                    <button
                        onClick={() => navigate(`/solution/${number}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-[13px] transition-colors"
                    >
                        Назад к решению
                    </button>
                </div>
            </div>
        </div>
    );
};

export default observer(SolutionReviews);
