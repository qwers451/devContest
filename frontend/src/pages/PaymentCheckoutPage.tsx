import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from '../context';

const STATUS_LABELS = {
    pending:  { label: 'Ожидание оплаты', cls: 'bg-yellow-100 text-yellow-700' },
    held:     { label: 'Оплачено',        cls: 'bg-emerald-100 text-emerald-700' },
    released: { label: 'Выплачено',       cls: 'bg-violet-100 text-violet-700' },
    failed:   { label: 'Ошибка оплаты',   cls: 'bg-red-100 text-red-600' },
};

const PaymentCheckoutPage = () => {
    const { payment, contest } = useContext(Context);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const contestId = Number(searchParams.get('contest_id'));
    const amount    = Number(searchParams.get('amount'));

    // payment method selection: null = not chosen, 'card' = YooKassa, 'balance' = wallet
    const [method, setMethod]           = useState(null);
    const [status, setStatus]           = useState('pending');
    const [redirectUrl, setRedirectUrl] = useState(null);
    const [activating, setActivating]   = useState(false);
    const [error, setError]             = useState(null);
    const [contestNum, setContestNum]   = useState(null);
    const [balanceLoaded, setBalanceLoaded] = useState(false);
    const pollRef   = useRef(null);
    const pollCount = useRef(0);

    // Load balance to decide which options to show
    useEffect(() => {
        if (!contestId || !amount) return;
        payment.fetchBalance().then(() => setBalanceLoaded(true));
        return () => clearInterval(pollRef.current);
    }, [contestId, amount]);

    // Poll status every 3s after YooKassa redirect, give up after 20 attempts (~60 sec)
    useEffect(() => {
        if (method !== 'card' || status === 'held' || status === 'failed') return;

        pollRef.current = setInterval(async () => {
            pollCount.current += 1;
            if (pollCount.current > 20) {
                clearInterval(pollRef.current);
                setStatus('failed');
                setError('Платёж не подтверждён за 60 секунд. Возможно, вы закрыли страницу оплаты. Попробуйте ещё раз.');
                return;
            }

            const data = await payment.fetchPaymentStatus(contestId);
            if (data) {
                setStatus(data.status);
                if (data.status === 'held') {
                    clearInterval(pollRef.current);
                    await handleActivate();
                } else if (data.status === 'failed') {
                    clearInterval(pollRef.current);
                }
            }
        }, 3000);

        return () => clearInterval(pollRef.current);
    }, [method, status, contestId]);

    const handleActivate = async () => {
        setActivating(true);
        try {
            const activated = await payment.activateContest(contestId);
            if (activated) {
                const c = await contest.fetchOneContest(contestId);
                if (c) {
                    setContestNum(c.number);
                    setTimeout(() => navigate(`/contests/${c.number}`), 2000);
                }
            }
        } finally {
            setActivating(false);
        }
    };

    const handlePayByCard = async () => {
        setMethod('card');
        setError(null);
        try {
            const data = await payment.initPayment(contestId, amount);
            setRedirectUrl(data.redirect_url);
            setStatus(data.status);
            if (data.status === 'held') {
                await handleActivate();
            } else if (data.redirect_url) {
                window.location.href = data.redirect_url;
            }
        } catch (e) {
            setError(e.response?.data?.detail || 'Не удалось создать платёж');
            setMethod(null);
        }
    };

    const handlePayByBalance = async () => {
        setMethod('balance');
        setError(null);
        try {
            const data = await payment.payContestFromBalance(contestId, amount);
            setStatus(data.status);
            if (data.status === 'held') {
                await handleActivate();
            }
        } catch (e) {
            setError(e.response?.data?.detail || 'Ошибка оплаты с баланса');
            setMethod(null);
        }
    };

    const hasBalance = payment.balance >= amount;
    const cfg = STATUS_LABELS[status] || STATUS_LABELS.pending;

    if (!contestId || !amount) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">Некорректные параметры оплаты.</p>
                    <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm">
                        На главную
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 w-full max-w-md animate-fade-in">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Оплата призового фонда</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Конкурс #{contestId}</p>

                {/* Amount */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6 text-center">
                    <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{amount.toLocaleString('ru-RU')} ₽</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">будет заморожено в эскроу до выбора победителя</div>
                </div>

                {error && (
                    <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Method not chosen yet */}
                {method === null && balanceLoaded && (
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Выберите способ оплаты:</p>

                        {/* Pay from balance */}
                        <button
                            onClick={handlePayByBalance}
                            disabled={!hasBalance}
                            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-semibold transition-all ${
                                hasBalance
                                    ? 'border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-base">💼</span>
                                Списать с баланса
                            </span>
                            <span className={`text-xs font-mono ${hasBalance ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'}`}>
                                {Number(payment.balance).toLocaleString('ru-RU')} ₽
                                {!hasBalance && ' — недостаточно'}
                            </span>
                        </button>

                        {/* Pay by card */}
                        <button
                            onClick={handlePayByCard}
                            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-base">💳</span>
                                Оплатить картой через ЮКасса
                            </span>
                        </button>

                        <button
                            onClick={() => navigate('/')}
                            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
                        >
                            Отмена
                        </button>
                    </div>
                )}

                {/* Loading balance */}
                {method === null && !balanceLoaded && (
                    <div className="flex justify-center py-8">
                        <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                    </div>
                )}

                {/* In progress */}
                {method !== null && (
                    <div className="space-y-4">
                        <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${cfg.cls}`}>
                                {status === 'pending' && (
                                    <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                )}
                                {cfg.label}
                            </span>
                        </div>

                        {status === 'held' && (
                            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm text-center">
                                Платёж подтверждён! {activating ? 'Активируем конкурс…' : 'Конкурс активирован.'}
                                {contestNum && <span> Переход через 2 сек…</span>}
                            </div>
                        )}

                        {method === 'card' && redirectUrl && status === 'pending' && (
                            <div className="space-y-2">
                                <a
                                    href={redirectUrl}
                                    className="block w-full text-center px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
                                >
                                    Перейти к оплате на ЮКасса
                                </a>
                                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                                    Страница обновится автоматически после оплаты.<br />
                                    Тест: <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-1 rounded">5555555555554477</code> — успех,{' '}
                                    <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-1 rounded">5555555555554444</code> — отказ
                                </p>
                            </div>
                        )}

                        {status === 'held' && contestNum && (
                            <button
                                onClick={() => navigate(`/contests/${contestNum}`)}
                                className="block w-full text-center px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
                            >
                                Перейти к конкурсу
                            </button>
                        )}

                        {status === 'failed' && (
                            <button
                                onClick={() => { setMethod(null); setStatus('pending'); setError(null); }}
                                className="block w-full text-center px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors"
                            >
                                Попробовать снова
                            </button>
                        )}

                        <button
                            onClick={() => navigate('/')}
                            className="block w-full text-center px-5 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold text-sm transition-colors"
                        >
                            На главную
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default observer(PaymentCheckoutPage);
