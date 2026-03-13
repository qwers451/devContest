import React, { useContext, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Context } from '../main.jsx';
import { observer } from 'mobx-react-lite';
import {
    CONTESTS_ROUTE, ADMIN_ROUTE, LOGIN_ROUTE, MY_SOLUTIONS_ROUTE,
    MY_CONTESTS_ROUTE, CREATE_CONTEST_ROUTE, PROFILE_ROUTE
} from '../utils/consts.js';

const SunIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
);

const MoonIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
);

const NavBar = observer(() => {
    const { user } = useContext(Context);
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [isDark, setIsDark] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    React.useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    const logOut = () => {
        user.setUser({});
        user.setIsAuth(false);
        localStorage.removeItem('token');
        navigate(CONTESTS_ROUTE);
        setOpen(false);
    };

    const linkClass = ({ isActive }) =>
        `text-sm font-medium transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-gray-600 hover:text-violet-600'}`;

    const links = () => {
        if (!user.isAuth) return null;
        const role = user.user?.role;
        return (
            <>
                <NavLink to={CONTESTS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
                    Конкурсы
                </NavLink>
                {role === 'executor' && (
                    <NavLink to={MY_SOLUTIONS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
                        Мои решения
                    </NavLink>
                )}
                {role === 'customer' && (
                    <>
                        <NavLink to={MY_CONTESTS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
                            Мои конкурсы
                        </NavLink>
                        <NavLink to={CREATE_CONTEST_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
                            Добавить конкурс
                        </NavLink>
                    </>
                )}
                {role === 'admin' && (
                    <NavLink to={ADMIN_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
                        Админ панель
                    </NavLink>
                )}
            </>
        );
    };

    return (
        <nav className="sticky top-0 z-40 bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                {/* Logo */}
                <button
                    onClick={() => navigate(CONTESTS_ROUTE)}
                    className="flex items-center gap-2 font-black text-lg tracking-tight text-gray-900 hover:text-violet-700 transition-colors"
                >
                    <img src="/logo.svg" alt="logo" className="w-7 h-7" />
                    devContest
                </button>

                {/* Desktop links */}
                <div className="hidden md:flex items-center gap-6">{links()}</div>

                {/* Desktop actions */}
                <div className="hidden md:flex items-center gap-3">
                    <button
                        onClick={() => setIsDark(d => !d)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all"
                        title={isDark ? 'Светлая тема' : 'Тёмная тема'}
                    >
                        {isDark ? <SunIcon /> : <MoonIcon />}
                    </button>
                    {user.isAuth ? (
                        <>
                            <button
                                onClick={() => navigate(PROFILE_ROUTE)}
                                className="text-sm font-semibold text-gray-700 hover:text-violet-600 transition-colors flex items-center gap-1.5"
                            >
                                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-black">
                                    {user.user?.login?.[0]?.toUpperCase()}
                                </span>
                                {user.user?.login}
                            </button>
                            <button
                                onClick={logOut}
                                className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-all font-medium"
                            >
                                Выйти
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => navigate(LOGIN_ROUTE)}
                            className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                        >
                            Войти
                        </button>
                    )}
                </div>

                {/* Mobile hamburger */}
                <button
                    className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    onClick={() => setOpen(o => !o)}
                >
                    <div className={`w-5 h-0.5 bg-current transition-all duration-200 ${open ? 'rotate-45 translate-y-1.5' : ''}`} />
                    <div className={`w-5 h-0.5 bg-current my-1 transition-all duration-200 ${open ? 'opacity-0' : ''}`} />
                    <div className={`w-5 h-0.5 bg-current transition-all duration-200 ${open ? '-rotate-45 -translate-y-1.5' : ''}`} />
                </button>
            </div>

            {/* Mobile menu */}
            {open && (
                <div className="md:hidden border-t border-gray-100 bg-white animate-slide-down px-4 py-3 flex flex-col gap-3">
                    {links()}
                    <button
                        onClick={() => setIsDark(d => !d)}
                        className="flex items-center gap-2 text-sm text-gray-600 text-left"
                    >
                        {isDark ? <SunIcon /> : <MoonIcon />}
                        {isDark ? 'Светлая тема' : 'Тёмная тема'}
                    </button>
                    {user.isAuth ? (
                        <>
                            <button
                                onClick={() => { navigate(PROFILE_ROUTE); setOpen(false); }}
                                className="text-sm text-gray-600 text-left"
                            >
                                {user.user?.login}
                            </button>
                            <button onClick={logOut} className="text-sm text-red-500 text-left">Выйти</button>
                        </>
                    ) : (
                        <button
                            onClick={() => { navigate(LOGIN_ROUTE); setOpen(false); }}
                            className="text-sm text-violet-600 font-semibold text-left"
                        >
                            Войти
                        </button>
                    )}
                </div>
            )}
        </nav>
    );
});

export default NavBar;
