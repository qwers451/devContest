import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../context';
import { fetchData, updateData } from '../services/apiService.js';
import { useNavigate, Link } from 'react-router-dom';
import UserAvatar from '../components/UserAvatar';
import { PUBLIC_PROFILE_ROUTE } from '../utils/consts.js';
import { AVATAR_COLORS, loadExtras, parseSkills, saveExtras } from '../utils/profileExtras';

const ProfilePage = () => {
    const { user } = useContext(Context);
    const navigate = useNavigate();
    const userId = user.user.id;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ email: '', login: '', password: '' });

    // Публичные поля профиля хранятся в localStorage этого браузера.
    const [extras, setExtras] = useState(() => loadExtras(userId, user.user.login));
    const [skillsText, setSkillsText] = useState(() => loadExtras(userId, user.user.login).skills.join(', '));
    const [extrasMsg, setExtrasMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const handleAvatarFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setExtrasMsg({ ok: false, text: 'Выберите файл-картинку (PNG, JPG, WebP)' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                // Уменьшаем до 160x160 (по центру), чтобы влезть в localStorage.
                const size = 160;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const side = Math.min(img.width, img.height);
                ctx?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
                setExtras(prev => ({ ...prev, avatarImage: canvas.toDataURL('image/jpeg', 0.85) }));
                setExtrasMsg(null);
            };
            img.onerror = () => setExtrasMsg({ ok: false, text: 'Не удалось прочитать картинку' });
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveExtras = () => {
        const skills = parseSkills(skillsText);
        const next = { ...extras, about: extras.about.trim().slice(0, 500), skills, link: extras.link.trim() };
        const ok = saveExtras(userId, next);
        if (ok) {
            setExtras(next);
            setSkillsText(skills.join(', '));
        }
        setExtrasMsg(ok
            ? { ok: true, text: 'Публичный профиль сохранён' }
            : { ok: false, text: 'Не удалось сохранить: хранилище браузера недоступно или переполнено' });
    };

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

    const inputCls = 'w-full px-4 py-2.5 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-100 text-[13px] transition-all duration-200 bg-gray-900';
    const labelCls = 'block text-[13px] font-semibold text-gray-300 mb-1';

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-64">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <span className="ml-3 text-gray-500 text-[13px]">Загрузка профиля…</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 py-6">
            <div className="max-w-md mx-auto px-4">
                <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 animate-fade-in">
                    <h2 className="text-[15px] font-medium text-gray-100 mb-5">Мой профиль</h2>

                    {error && (
                        <div className="mb-4 px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-[13px]">
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
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-[13px] transition-colors disabled:opacity-60"
                            >
                                Отмена
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[13px] transition-colors disabled:opacity-60"
                            >
                                {saving ? 'Сохранение…' : 'Сохранить'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 mt-5 animate-fade-in">
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <h2 className="text-[15px] font-medium text-gray-100">Публичный профиль</h2>
                        <Link
                            to={`${PUBLIC_PROFILE_ROUTE}/${userId}`}
                            className="text-[13px] text-violet-400 hover:underline"
                        >
                            Открыть
                        </Link>
                    </div>
                    <p className="text-[12px] text-gray-500 mb-4">
                        Это видят другие пользователи на вашей странице. Данные хранятся в этом браузере.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className={labelCls}>Аватар</label>
                            <div className="flex items-center gap-4">
                                <UserAvatar login={form.login} color={extras.avatarColor} image={extras.avatarImage} size={56} />
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Цвет аватара">
                                        {AVATAR_COLORS.map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                role="radio"
                                                aria-checked={extras.avatarColor === c}
                                                aria-label={`Цвет ${c}`}
                                                onClick={() => setExtras(prev => ({ ...prev, avatarColor: c }))}
                                                style={{ backgroundColor: c }}
                                                className={`h-6 w-6 rounded-full border-2 transition-transform ${extras.avatarColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-700 px-3 py-1.5 text-[12px] text-gray-200 hover:bg-gray-800">
                                            Загрузить фото
                                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                                        </label>
                                        {extras.avatarImage && (
                                            <button
                                                type="button"
                                                onClick={() => setExtras(prev => ({ ...prev, avatarImage: '' }))}
                                                className="rounded-md px-3 py-1.5 text-[12px] text-gray-400 hover:bg-gray-800"
                                            >
                                                Убрать фото
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="about">О себе</label>
                            <textarea
                                id="about"
                                rows={4}
                                maxLength={500}
                                value={extras.about}
                                onChange={e => setExtras(prev => ({ ...prev, about: e.target.value }))}
                                placeholder="Чем занимаетесь, какой опыт, что любите делать"
                                className={inputCls}
                            />
                            <div className="mt-1 text-right text-[11px] text-gray-500">{extras.about.length} / 500</div>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="skills">Навыки</label>
                            <input
                                id="skills"
                                type="text"
                                value={skillsText}
                                onChange={e => setSkillsText(e.target.value)}
                                placeholder="React, TypeScript, Node.js"
                                className={inputCls}
                            />
                            <div className="mt-1 text-[11px] text-gray-500">Через запятую, до 12 штук</div>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="portfolio-link">Ссылка на портфолио или GitHub</label>
                            <input
                                id="portfolio-link"
                                type="text"
                                value={extras.link}
                                onChange={e => setExtras(prev => ({ ...prev, link: e.target.value }))}
                                placeholder="github.com/username"
                                className={inputCls}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 pt-1">
                            <span
                                role="status"
                                className={`text-[12px] ${extrasMsg?.ok ? 'text-emerald-400' : 'text-red-400'}`}
                            >
                                {extrasMsg?.text}
                            </span>
                            <button
                                type="button"
                                onClick={handleSaveExtras}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[13px] transition-colors"
                            >
                                Сохранить профиль
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default observer(ProfilePage);
