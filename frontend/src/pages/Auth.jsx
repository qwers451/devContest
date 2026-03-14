import React, { useState, useContext } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LOGIN_ROUTE, REGISTRATION_ROUTE } from '../utils/consts.js';
import { sendData } from '../services/apiService.js';
import { Context } from '../main.jsx';
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

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white';

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-fade-in">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center text-base font-black">C</span>
                    <span className="font-bold text-xl text-violet-700">devContest</span>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                    {isLogin ? 'Добро пожаловать!' : 'Создать аккаунт'}
                </h2>
                <p className="text-sm text-gray-500 text-center mb-6">
                    {isLogin ? 'Войдите в свой аккаунт' : 'Заполните форму для регистрации'}
                </p>

                {error && (
                    <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
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
                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors shadow-sm mt-1"
                    >
                        {isLogin ? 'Войти' : 'Зарегистрироваться'}
                    </button>
                </form>

                <p className="text-sm text-gray-500 text-center mt-5">
                    {isLogin ? (
                        <>
                            Нет аккаунта?{' '}
                            <NavLink to={REGISTRATION_ROUTE} className="text-violet-600 font-semibold hover:text-violet-700">
                                Зарегистрируйтесь!
                            </NavLink>
                        </>
                    ) : (
                        <>
                            Уже есть аккаунт?{' '}
                            <NavLink to={LOGIN_ROUTE} className="text-violet-600 font-semibold hover:text-violet-700">
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
