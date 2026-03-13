import React, { useContext, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useSearchParams } from 'react-router-dom';
import { Context } from '../main.jsx';

const STATUS_LABELS = {
    pending:  { label: 'В обработке', cls: 'bg-yellow-100 text-yellow-700' },
    held:     { label: 'Оплачено',    cls: 'bg-emerald-100 text-emerald-700' },
    released: { label: 'Выполнено',   cls: 'bg-violet-100 text-violet-700' },
    failed:   { label: 'Ошибка',      cls: 'bg-red-100 text-red-600' },
};

const TX_LABELS = {
    topup:           { label: 'Пополнение',  cls: 'text-emerald-600' },
    contest_payment: { label: 'Оплата конкурса', cls: 'text-red-500' },
    income:          { label: 'Выигрыш',     cls: 'text-violet-600' },
    withdrawal:      { label: 'Вывод',       cls: 'text-red-500' },
};

const StatusBadge = ({ status }) => {
    const cfg = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

const WalletPage = () => {
    const { payment, user } = useContext(Context);
    const [searchParams, setSearchParams] = useSearchParams();

    const isExecutor = user.user?.role === 'executor';
    const isCustomer = user.user?.role === 'customer' || user.user?.role === 'admin';

    // Callback state: set when returning from YooKassa after wallet topup
    const returningFromYK = searchParams.get('wallet_topup') === '1';
    const returnPaymentId = searchParams.get('payment_id')
        ? Number(searchParams.get('payment_id'))
        : Number(sessionStorage.getItem('wallet_topup_payment_id') || '0');

    const [tab, setTab] = useState('balance');
    const [topupAmount, setTopupAmount] = useState('');
    const [topupLoading, setTopupLoading] = useState(false);
    const [topupError, setTopupError] = useState('');
    const [topupSuccess, setTopupSuccess] = useState('');
    const [topupPollStatus, setTopupPollStatus] = useState(returningFromYK ? 'polling' : null);
    const pollRef = useRef(null);

    const [withdrawForm, setWithdrawForm] = useState({ amount: '', card_number: '' });
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState('');
    const [withdrawSuccess, setWithdrawSuccess] = useState('');

    const [refundingId, setRefundingId] = useState(null);
    const [refundError, setRefundError] = useState('');
    const [refundSuccess, setRefundSuccess] = useState('');

    // Poll after YooKassa wallet topup callback
    useEffect(() => {
        if (!returningFromYK || !returnPaymentId) return;

        const poll = async () => {
            const data = await payment.fetchWalletPaymentStatus(returnPaymentId);
            if (!data) return;
            if (data.status === 'held') {
                clearInterval(pollRef.current);
                sessionStorage.removeItem('wallet_topup_payment_id');
                setTopupPollStatus('success');
                setTopupSuccess(`Кошелёк пополнен на ${Number(data.amount).toLocaleString('ru-RU')} ₽`);
                await payment.fetchBalance();
                await payment.fetchWalletTransactions();
                // Clean URL params
                setSearchParams({});
            } else if (data.status === 'failed') {
                clearInterval(pollRef.current);
                sessionStorage.removeItem('wallet_topup_payment_id');
                setTopupPollStatus('failed');
                setTopupError('Платёж отклонён YooKassa. Попробуйте ещё раз.');
                setSearchParams({});
            }
        };

        poll();
        pollRef.current = setInterval(poll, 2000);
        return () => clearInterval(pollRef.current);
    }, [returningFromYK, returnPaymentId]);

    useEffect(() => {
        payment.fetchBalance();
        payment.fetchWalletTransactions();
        if (isCustomer) payment.fetchHistory();
        payment.fetchWithdrawals();
    }, []);

    const handleTopup = async (e) => {
        e.preventDefault();
        const amount = Number(topupAmount);
        if (!amount || amount <= 0) {
            setTopupError('Введите сумму больше нуля');
            return;
        }
        setTopupError('');
        setTopupSuccess('');
        setTopupLoading(true);
        try {
            const res = await payment.topupWallet(amount);
            if (res.redirect_url) {
                // Real YooKassa: save payment_id, redirect
                sessionStorage.setItem('wallet_topup_payment_id', String(res.payment_id));
                window.location.href = res.redirect_url;
            } else {
                // Stub mode — already credited instantly
                setTopupSuccess(`Кошелёк пополнен на ${amount.toLocaleString('ru-RU')} ₽`);
                setTopupAmount('');
                await payment.fetchWalletTransactions();
            }
        } catch {
            setTopupError(payment.error || 'Ошибка пополнения');
        } finally {
            setTopupLoading(false);
        }
    };

    const handleRefund = async (contest_id) => {
        if (!window.confirm('Вернуть средства за этот конкурс?')) return;
        setRefundingId(contest_id);
        setRefundError('');
        setRefundSuccess('');
        try {
            await payment.refundPayment(contest_id);
            setRefundSuccess('Возврат выполнен успешно');
            await payment.fetchBalance();
            await payment.fetchWalletTransactions();
        } catch {
            setRefundError(payment.error || 'Ошибка при возврате');
        } finally {
            setRefundingId(null);
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const amount = Number(withdrawForm.amount);
        if (!amount || amount <= 0) {
            setWithdrawError('Введите сумму больше нуля');
            return;
        }
        setWithdrawError('');
        setWithdrawSuccess('');
        setWithdrawing(true);
        try {
            await payment.withdrawFromWallet(amount, withdrawForm.card_number || null);
            setWithdrawSuccess(`Заявка на вывод ${amount.toLocaleString('ru-RU')} ₽ отправлена!`);
            setWithdrawForm({ amount: '', card_number: '' });
            await payment.fetchWalletTransactions();
        } catch {
            setWithdrawError(payment.error || 'Ошибка при выводе средств');
        } finally {
            setWithdrawing(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 text-sm bg-white transition-all';

    const tabs = [
        { key: 'balance', label: 'Баланс' },
        { key: 'withdraw', label: 'Вывести' },
        { key: 'transactions', label: 'Транзакции' },
        ...(isCustomer ? [{ key: 'history', label: 'Платежи' }] : []),
        { key: 'payouts', label: 'Выплаты' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-3xl mx-auto px-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Кошелёк</h1>

                {/* Balance card */}
                <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 mb-6 text-white shadow-lg">
                    <div className="text-sm font-medium opacity-80 mb-1">Текущий баланс</div>
                    <div className="text-4xl font-black tracking-tight mb-4">
                        {Number(payment.balance).toLocaleString('ru-RU')} <span className="text-2xl opacity-70">₽</span>
                    </div>
                    <form onSubmit={handleTopup} className="flex gap-2">
                        <input
                            type="number"
                            min="1"
                            placeholder="Сумма пополнения"
                            value={topupAmount}
                            onChange={e => setTopupAmount(e.target.value)}
                            className="flex-1 px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                        <button
                            type="submit"
                            disabled={topupLoading}
                            className="px-5 py-2 rounded-xl bg-white text-violet-700 font-semibold text-sm hover:bg-violet-50 transition-colors disabled:opacity-60 whitespace-nowrap"
                        >
                            {topupLoading ? '…' : 'Пополнить'}
                        </button>
                    </form>
                    {topupPollStatus === 'polling' && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-white/90 bg-white/20 rounded-lg px-3 py-1.5">
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin flex-shrink-0" />
                            Проверяем статус платежа…
                        </div>
                    )}
                    {topupSuccess && (
                        <div className="mt-2 text-sm text-white/90 bg-white/20 rounded-lg px-3 py-1.5">
                            ✓ {topupSuccess}
                        </div>
                    )}
                    {topupError && (
                        <div className="mt-2 text-sm text-red-200 bg-red-500/30 rounded-lg px-3 py-1.5">
                            {topupError}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                                tab === t.key
                                    ? 'border-violet-600 text-violet-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Balance overview */}
                {tab === 'balance' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                                <div className="text-xs text-gray-400 mb-1">Доступно</div>
                                <div className="text-2xl font-bold text-gray-900">
                                    {Number(payment.balance).toLocaleString('ru-RU')} ₽
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                                <div className="text-xs text-gray-400 mb-1">Транзакций</div>
                                <div className="text-2xl font-bold text-gray-900">
                                    {payment.walletTransactions.length}
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4 text-sm text-blue-700">
                            <strong>Как работает кошелёк:</strong>
                            <ul className="mt-1 space-y-0.5 list-disc list-inside text-blue-600">
                                <li>Пополните баланс и используйте его для оплаты конкурсов</li>
                                {isExecutor && <li>Выигрыш за конкурсы начисляется сюда автоматически</li>}
                                <li>Выведите средства на карту в любой момент</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Wallet transactions */}
                {tab === 'transactions' && (
                    <div>
                        {payment.loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                            </div>
                        ) : payment.walletTransactions.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">Операций пока нет</div>
                        ) : (
                            <div className="space-y-2">
                                {payment.walletTransactions.map(tx => {
                                    const cfg = TX_LABELS[tx.tx_type] || TX_LABELS.topup;
                                    const isCredit = tx.amount > 0;
                                    return (
                                        <div key={tx.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-semibold text-gray-800">{cfg.label}</div>
                                                {tx.description && (
                                                    <div className="text-xs text-gray-400 mt-0.5">{tx.description}</div>
                                                )}
                                                <div className="text-xs text-gray-400">
                                                    {new Date(tx.created_at).toLocaleDateString('ru-RU', {
                                                        day: '2-digit', month: 'long', year: 'numeric',
                                                    })}
                                                </div>
                                            </div>
                                            <div className={`text-base font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {isCredit ? '+' : ''}{Number(tx.amount).toLocaleString('ru-RU')} ₽
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Contest payment history (customer) */}
                {tab === 'history' && (
                    <div>
                        {refundSuccess && (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                                {refundSuccess}
                            </div>
                        )}
                        {refundError && (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                                {refundError}
                            </div>
                        )}
                        {payment.loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                            </div>
                        ) : payment.history.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">Платежей пока нет</div>
                        ) : (
                            <div className="space-y-3">
                                {payment.history.map(p => (
                                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">
                                                Конкурс #{p.contest_id}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {new Date(p.created_at).toLocaleDateString('ru-RU', {
                                                    day: '2-digit', month: 'long', year: 'numeric',
                                                })}
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-2">
                                            <StatusBadge status={p.status} />
                                            <span className="text-base font-bold text-gray-900">
                                                {Number(p.amount).toLocaleString('ru-RU')} ₽
                                            </span>
                                            {p.status === 'held' && (
                                                <button
                                                    onClick={() => handleRefund(p.contest_id)}
                                                    disabled={refundingId === p.contest_id}
                                                    className="text-xs px-3 py-1 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                                                >
                                                    {refundingId === p.contest_id ? 'Возврат…' : 'Вернуть'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Withdraw from wallet (executor) */}
                {tab === 'withdraw' && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                        <h2 className="text-base font-bold text-gray-800 mb-1">Вывести средства</h2>
                        <p className="text-xs text-gray-400 mb-4">
                            Баланс: <strong>{Number(payment.balance).toLocaleString('ru-RU')} ₽</strong>
                        </p>

                        {withdrawSuccess && (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                                {withdrawSuccess}
                            </div>
                        )}
                        {withdrawError && (
                            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                                {withdrawError}
                            </div>
                        )}

                        <form onSubmit={handleWithdraw} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Сумма вывода (₽)
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    placeholder="Например: 1000"
                                    value={withdrawForm.amount}
                                    onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Номер банковской карты
                                </label>
                                <input
                                    type="text"
                                    placeholder="5555555555554477 (тестовая карта)"
                                    value={withdrawForm.card_number}
                                    onChange={e => setWithdrawForm(f => ({ ...f, card_number: e.target.value }))}
                                    className={inputCls}
                                    maxLength={16}
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    В тестовом режиме: <code className="bg-gray-100 px-1 rounded">5555555555554477</code>
                                </p>
                            </div>
                            <button
                                type="submit"
                                disabled={withdrawing || payment.balance <= 0}
                                className="w-full px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                            >
                                {withdrawing ? 'Отправка…' : 'Вывести средства'}
                            </button>
                        </form>

                        <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                            <strong>Тестовый режим YooKassa</strong><br />
                            Выплаты работают в тестовой среде. Средства списываются с вашего баланса.
                        </div>
                    </div>
                )}

                {/* Payout history (executor) */}
                {tab === 'payouts' && (
                    <div>
                        {payment.loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                            </div>
                        ) : payment.withdrawals.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">Выплат пока нет</div>
                        ) : (
                            <div className="space-y-3">
                                {payment.withdrawals.map(p => (
                                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">
                                                {p.contest_id ? `Конкурс #${p.contest_id}` : 'Вывод с кошелька'}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {p.recipient_account
                                                    ? `Карта ****${p.recipient_account.slice(-4)}`
                                                    : 'Реквизиты не указаны'}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {new Date(p.created_at).toLocaleDateString('ru-RU')}
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <StatusBadge status={p.status} />
                                            <span className="text-base font-bold text-gray-900">
                                                {Number(p.amount).toLocaleString('ru-RU')} ₽
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default observer(WalletPage);
