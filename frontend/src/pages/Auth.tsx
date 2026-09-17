import React, { useState, useContext } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LOGIN_ROUTE, REGISTRATION_ROUTE } from '../utils/consts.js';
import { sendData } from '../services/apiService.js';
import { Context } from '../context';
import { observer } from 'mobx-react-lite';

const Auth = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isLogin = location.pathname === LOGIN_ROUTE;
    const { user } = useContext(Context);

    const [email, setEmail] = useState('');
    const [loginInput, setLoginInput] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [role, setRole] = useState('executor');
    const [error, setError] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);

        try {
            let endpoint = isLogin ? '/auth/login' : '/auth/register';
            const data = { login: loginInput, password: passwordInput };

            if (!isLogin) {
                data.email = email;
                data.role = role;
            }

            const response = await sendData(endpoint, data);
            localStorage.setItem('token', response.access_token);
            user.setUser(response.user);
            user.setIsAuth(true);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Что-то пошло не так');
        }
    };

    const inputCls = 'lin-input';

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
            <div className="animate-fade-in lin-panel w-full max-w-[360px] p-6">
                <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-[13px] font-semibold text-white">C</span>
                    <span className="text-[15px] font-semibold tracking-tight text-gray-100">devContest</span>
                </div>

                <h2 className="mb-1 text-center text-[17px] font-semibold tracking-tight text-gray-100">
                    {isLogin ? 'Добро пожаловать!' : 'Создать аккаунт'}
                </h2>
                <p className="mb-5 text-center text-[13px] text-gray-400">
                    {isLogin ? 'Войдите в свой аккаунт' : 'Заполните форму для регистрации'}
                </p>

                {error && (
                    <div className="mb-4 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-[13px] text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    {!isLogin && (
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className={inputCls}
                        />
                    )}
                    <input
                        type="text"
                        placeholder="Логин"
                        value={loginInput}
                        onChange={e => setLoginInput(e.target.value)}
                        required
                        className={inputCls}
                    />
                    <input
                        type="password"
                        placeholder="Пароль"
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        required
                        className={inputCls}
                    />
                    {!isLogin && (
                        <select
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            required
                            className={inputCls}
                        >
                            <option value="executor">Фрилансер</option>
                            <option value="customer">Организатор</option>
                        </select>
                    )}

                    <button
                        type="submit"
                        className="lin-btn lin-btn-primary mt-1 w-full"
                    >
                        {isLogin ? 'Войти' : 'Зарегистрироваться'}
                    </button>
                </form>

                <p className="mt-5 text-center text-[13px] text-gray-500">
                    {isLogin ? (
                        <>
                            Нет аккаунта?{' '}
                            <NavLink to={REGISTRATION_ROUTE} className="text-violet-600 dark:text-violet-400 font-semibold hover:text-violet-700 dark:hover:text-violet-300">
                                Зарегистрируйтесь!
                            </NavLink>
                        </>
                    ) : (
                        <>
                            Уже есть аккаунт?{' '}
                            <NavLink to={LOGIN_ROUTE} className="text-violet-600 dark:text-violet-400 font-semibold hover:text-violet-700 dark:hover:text-violet-300">
                                Войдите!
                            </NavLink>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
};

export default observer(Auth);
