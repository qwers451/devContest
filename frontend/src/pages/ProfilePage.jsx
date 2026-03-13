import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { fetchData, updateData } from '../services/apiService.js';
import { useNavigate } from 'react-router-dom';

const ProfilePage = () => {
    const { user } = useContext(Context);
    const navigate = useNavigate();
    const userId = user.user.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ email: '', login: '', password: '' });

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchData('/users/profile');
                setForm({ email: data.email || '', login: data.login || '', password: '' });
            } catch (err) {
                setError(err.response?.data?.error || 'Не удалось загрузить профиль');
            } finally {
                setLoading(false);
            }
        })();
    }, [userId]);

    const handleChange = (e) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const payload = {
            email: form.email,
            login: form.login,
            ...(form.password ? { password: form.password } : {})
        };

        try {
            const updated = await updateData('/users/profile', payload);
            user.setUser(updated);
            alert('Профиль сохранён');
        } catch (err) {
            setError(err.response?.data?.error || 'Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white';
    const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <span className="ml-3 text-gray-500 text-sm">Загрузка профиля…</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-md mx-auto px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-900 mb-5">Мой профиль</h2>

                    {error && (
                        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className={labelCls}>Email</label>
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Логин</label>
                            <input
                                type="text"
                                name="login"
                                value={form.login}
                                onChange={handleChange}
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Новый пароль</label>
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                placeholder="Оставьте пустым, чтобы не менять"
                                className={inputCls}
                            />
                        </div>
                        <div className="flex justify-between pt-2">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors disabled:opacity-60"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                            >
                                {saving ? 'Сохранение…' : 'Сохранить'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default observer(ProfilePage);
