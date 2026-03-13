import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
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
                <span className="ml-3 text-gray-500 text-sm">Загрузка отзывов...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-10">
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-4xl mx-auto px-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Отзывы к решению №{number}
                </h2>

                {reviews.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                        <p className="text-gray-500 text-sm">Ещё нет отзывов.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reviews.map(r => (
                            <div
                                key={r.number}
                                onClick={() => navigate(`/solution/${number}/review/${r.number}`)}
                                className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-violet-100 hover:-translate-y-1 transition-all duration-300 cursor-pointer p-5 animate-fade-in"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-gray-900 group-hover:text-violet-700 transition-colors">
                                        Ревью #{r.number}
                                    </h4>
                                    <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold text-xs">
                                        {r.score} / 10
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 line-clamp-3">
                                    {r.commentary.length > 100 ? r.commentary.slice(0, 100) + '…' : r.commentary}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6">
                    <button
                        onClick={() => navigate(`/solution/${number}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors"
                    >
                        Назад к решению
                    </button>
                </div>
            </div>
        </div>
    );
};

export default observer(SolutionReviews);
