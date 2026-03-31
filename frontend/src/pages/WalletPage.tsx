import React, { useContext, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { Context } from "../context";

const STATUS_LABELS = {
  pending: {
    label: "В обработке",
    cls: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  },
  held: {
    label: "Оплачено",
    cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  },
  released: {
    label: "Завершён",
    cls: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  },
  failed: {
    label: "Ошибка",
    cls: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  },
  refunded: {
    label: "Возвращено",
    cls: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
  },
};

const TX_LABELS = {
  topup: { label: "Пополнение", cls: "text-emerald-600" },
  contest_payment: { label: "Оплата конкурса", cls: "text-red-500" },
  income: { label: "Выигрыш", cls: "text-violet-600" },
  withdrawal: { label: "Вывод", cls: "text-red-500" },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_LABELS[status] || STATUS_LABELS.pending;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
};

const LoadingBlock = () => (
  <div className="flex justify-center py-10">
    <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
  </div>
);

const EmptyBlock = ({ text }) => (
  <div className="text-center py-10 text-gray-400">{text}</div>
);

const AlertBlock = ({ tone = "success", text, className = "mb-3" }) => {
  if (!text) {
    return null;
  }

  const toneClass =
    tone === "error"
      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
      : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400";

  return (
    <div
      className={`${className} px-4 py-3 rounded-xl border text-sm ${toneClass}`}
    >
      {text}
    </div>
  );
};

const BalanceTab = ({
  balance,
  transactionsCount,
  isExecutor,
  formatMoney,
}) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          Доступно
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatMoney(balance)}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          Транзакций
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {transactionsCount}
        </div>
      </div>
    </div>
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 p-4 text-sm text-blue-700 dark:text-blue-300">
      <strong>Как работает кошелёк:</strong>
      <ul className="mt-1 space-y-0.5 list-disc list-inside text-blue-600 dark:text-blue-400">
        <li>Пополните баланс и используйте его для оплаты конкурсов</li>
        {isExecutor && (
          <li>Выигрыш за конкурсы начисляется сюда автоматически</li>
        )}
        <li>Выведите средства на карту в любой момент</li>
      </ul>
    </div>
  </div>
);

const TransactionsTab = ({
  topupRefundSuccess,
  topupRefundError,
  loading,
  transactions,
  getTransactionConfig,
  refundedTopupIds,
  topupRefundingId,
  onRefund,
  formatMoney,
}) => {
  if (loading) {
    return <LoadingBlock />;
  }

  return (
    <div>
      <AlertBlock text={topupRefundSuccess} />
      <AlertBlock tone="error" text={topupRefundError} />
      {transactions.length === 0 ? (
        <EmptyBlock text="Операций пока нет" />
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const txConfig = getTransactionConfig(tx);
            const isCredit = tx.amount > 0;
            const canRefund =
              tx.tx_type === "topup" &&
              isCredit &&
              tx.reference_id &&
              !refundedTopupIds.has(tx.reference_id);

            return (
              <div
                key={tx.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {txConfig.label}
                  </div>
                  {tx.description && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                      {tx.description}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(tx.created_at).toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div
                    className={`text-base font-bold ${isCredit ? "text-emerald-600" : "text-red-500"}`}
                  >
                    {isCredit ? "+" : ""}
                    {formatMoney(tx.amount)}
                  </div>
                  {canRefund && (
                    <button
                      onClick={() => onRefund(tx.reference_id)}
                      disabled={topupRefundingId === tx.reference_id}
                      className="text-xs px-2.5 py-0.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                    >
                      {topupRefundingId === tx.reference_id
                        ? "Возврат…"
                        : "Вернуть"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PaymentHistoryTab = ({
  refundSuccess,
  refundError,
  loading,
  history,
  getContestTitle,
  refundingId,
  onRefund,
  formatMoney,
}) => {
  if (loading) {
    return <LoadingBlock />;
  }

  return (
    <div>
      <AlertBlock text={refundSuccess} className="mb-4" />
      <AlertBlock tone="error" text={refundError} className="mb-4" />
      {history.length === 0 ? (
        <EmptyBlock text="Платежей пока нет" />
      ) : (
        <div className="space-y-3">
          {history.map((paymentItem) => {
            const isFinished = paymentItem.status === "released";
            const isRefunded = paymentItem.status === "refunded";
            return (
              <div
                key={paymentItem.id}
                className={`rounded-2xl border p-4 flex items-center justify-between ${isFinished ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700" : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700"}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    {isFinished && (
                      <span
                        className="text-gray-400 dark:text-gray-500"
                        title="Конкурс завершён"
                      >
                        🔒
                      </span>
                    )}
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {getContestTitle(paymentItem.contest_id)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {new Date(paymentItem.created_at).toLocaleDateString(
                      "ru-RU",
                      {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </div>
                  {isFinished && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Средства выплачены исполнителю — возврат невозможен
                    </div>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <StatusBadge status={paymentItem.status} />
                  <span
                    className={`text-base font-bold ${isFinished || isRefunded ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}
                  >
                    {formatMoney(paymentItem.amount)}
                  </span>
                  {paymentItem.status === "held" && (
                    <button
                      onClick={() => onRefund(paymentItem.contest_id)}
                      disabled={refundingId === paymentItem.contest_id}
                      className="text-xs px-3 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                    >
                      {refundingId === paymentItem.contest_id
                        ? "Возврат…"
                        : "Вернуть"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const WithdrawTab = ({
  balance,
  withdrawSuccess,
  withdrawError,
  onSubmit,
  withdrawForm,
  setWithdrawForm,
  inputCls,
  withdrawing,
  formatMoney,
}) => (
  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
    <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
      Вывести средства
    </h2>
    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
      Баланс:{" "}
      <strong className="dark:text-gray-300">{formatMoney(balance)}</strong>
    </p>

    <AlertBlock text={withdrawSuccess} className="mb-4" />
    <AlertBlock tone="error" text={withdrawError} className="mb-4" />

    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Сумма вывода (₽)
        </label>
        <input
          type="number"
          required
          min="1"
          placeholder="Например: 1000"
          value={withdrawForm.amount}
          onChange={(e) =>
            setWithdrawForm((form) => ({ ...form, amount: e.target.value }))
          }
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Способ вывода
        </label>
        <div className="flex gap-3">
          {[
            { value: "yoo_money", label: "ЮMoney" },
            { value: "bank_card", label: "Банковская карта" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setWithdrawForm((form) => ({ ...form, payout_type: opt.value }))
              }
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                withdrawForm.payout_type === opt.value
                  ? "border-violet-600 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                  : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {withdrawForm.payout_type === "yoo_money" && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Номер кошелька ЮMoney
          </label>
          <input
            type="text"
            placeholder="Например: 41001234567890"
            value={withdrawForm.yoo_money_account}
            onChange={(e) =>
              setWithdrawForm((form) => ({
                ...form,
                yoo_money_account: e.target.value,
              }))
            }
            className={inputCls}
            maxLength={20}
          />
        </div>
      )}

      {withdrawForm.payout_type === "bank_card" && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Номер банковской карты
          </label>
          <input
            type="text"
            placeholder="Номер карты"
            value={withdrawForm.card_number}
            onChange={(e) =>
              setWithdrawForm((form) => ({
                ...form,
                card_number: e.target.value,
              }))
            }
            className={inputCls}
            maxLength={19}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Выплаты на карту доступны после верификации в ЮKassa.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={withdrawing || balance <= 0}
        className="w-full px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
      >
        {withdrawing ? "Отправка…" : "Вывести средства"}
      </button>
    </form>
  </div>
);

const PayoutsTab = ({ loading, payouts, formatMoney }) => {
  if (loading) {
    return <LoadingBlock />;
  }

  return payouts.length === 0 ? (
    <EmptyBlock text="Выплат пока нет" />
  ) : (
    <div className="space-y-3">
      {payouts.map((payout) => (
        <div
          key={payout.id}
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center justify-between"
        >
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {payout.contest_id
                ? `Конкурс #${payout.contest_id}`
                : "Вывод с кошелька"}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {payout.recipient_account
                ? `Карта ****${payout.recipient_account.slice(-4)}`
                : "Реквизиты не указаны"}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(payout.created_at).toLocaleDateString("ru-RU")}
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <StatusBadge status={payout.status} />
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">
              {formatMoney(payout.amount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const WalletPage = () => {
  const { payment, user, contest } = useContext(Context);
  const [searchParams, setSearchParams] = useSearchParams();

  const isExecutor = user.user?.role === "executor";
  const isCustomer =
    user.user?.role === "customer" || user.user?.role === "admin";

  const returningFromYK = searchParams.get("wallet_topup") === "1";
  const returnPaymentId = searchParams.get("payment_id")
    ? Number(searchParams.get("payment_id"))
    : Number(sessionStorage.getItem("wallet_topup_payment_id") || "0");

  const [tab, setTab] = useState("balance");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [topupSuccess, setTopupSuccess] = useState("");
  const [topupPollStatus, setTopupPollStatus] = useState(
    returningFromYK ? "polling" : null,
  );
  const pollRef = useRef(null);
  const pollCount = useRef(0);

  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    payout_type: "yoo_money",
    card_number: "",
    yoo_money_account: "",
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");

  const [refundingId, setRefundingId] = useState(null);
  const [refundError, setRefundError] = useState("");
  const [refundSuccess, setRefundSuccess] = useState("");
  const [contestTitles, setContestTitles] = useState<
    Record<number, string | false>
  >({});
  const fetchingTitleIds = useRef<Set<number>>(new Set());

  const [topupRefundingId, setTopupRefundingId] = useState(null);
  const [topupRefundError, setTopupRefundError] = useState("");
  const [topupRefundSuccess, setTopupRefundSuccess] = useState("");
  const balanceLabel = Number(payment.balance).toLocaleString("ru-RU");
  const refundedTopupIds = new Set(
    payment.walletTransactions
      .filter((tx) => tx.tx_type === "withdrawal" && tx.reference_id)
      .map((tx) => tx.reference_id),
  );

  const formatMoney = (amount) => `${Number(amount).toLocaleString("ru-RU")} ₽`;
  const clearWalletTopupCallback = () => {
    sessionStorage.removeItem("wallet_topup_payment_id");
    setSearchParams({});
  };
  const refreshWalletData = () =>
    Promise.all([payment.fetchBalance(), payment.fetchWalletTransactions()]);
  const getContestTitle = (contestId) =>
    contestTitles[contestId] ? (
      <span title={`Конкурс #${contestId}`}>{contestTitles[contestId]}</span>
    ) : (
      `Конкурс #${contestId}`
    );
  const getTransactionConfig = (tx) => {
    const isRefundEntry =
      tx.tx_type === "withdrawal" &&
      tx.reference_id &&
      tx.description?.includes("Возврат");
    if (isRefundEntry) return { label: "Возврат", cls: "text-gray-500" };
    return TX_LABELS[tx.tx_type] || TX_LABELS.topup;
  };

  useEffect(() => {
    if (!returningFromYK || !returnPaymentId) return;

    const poll = async () => {
      pollCount.current += 1;
      if (pollCount.current > 30) {
        clearInterval(pollRef.current);
        setTopupPollStatus("failed");
        setTopupError(
          "Платёж не подтверждён за 60 секунд. Возможно, вы закрыли страницу оплаты. Попробуйте ещё раз.",
        );
        clearWalletTopupCallback();
        return;
      }

      const data = await payment.fetchWalletPaymentStatus(returnPaymentId);
      if (!data) return;
      if (data.status === "held") {
        clearInterval(pollRef.current);
        setTopupPollStatus("success");
        setTopupSuccess(`Кошелёк пополнен на ${formatMoney(data.amount)}`);
        await refreshWalletData();
        clearWalletTopupCallback();
      } else if (data.status === "failed") {
        clearInterval(pollRef.current);
        setTopupPollStatus("failed");
        setTopupError("Платёж отклонён YooKassa. Попробуйте ещё раз.");
        clearWalletTopupCallback();
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

  useEffect(() => {
    const ids = payment.history.map((p) => p.contest_id).filter(Boolean);
    if (!ids.length) return;
    const missing = ids.filter(
      (id) =>
        contestTitles[id] === undefined && !fetchingTitleIds.current.has(id),
    );
    if (!missing.length) return;
    missing.forEach((id) => fetchingTitleIds.current.add(id));
    Promise.all(
      missing.map((id) =>
        contest
          .fetchOneContestById(id)
          .then((c) => [id, c?.title ?? false])
          .catch(() => [id, false]),
      ),
    ).then((entries) => {
      setContestTitles((prev) => {
        const next = { ...prev };
        entries.forEach(([id, title]) => {
          next[id] = title;
        });
        return next;
      });
    });
  }, [payment.history]);

  const handleTopup = async (e) => {
    e.preventDefault();
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) {
      setTopupError("Введите сумму больше нуля");
      return;
    }
    setTopupError("");
    setTopupSuccess("");
    setTopupLoading(true);
    try {
      const res = await payment.topupWallet(amount);
      if (res.redirect_url) {
        sessionStorage.setItem(
          "wallet_topup_payment_id",
          String(res.payment_id),
        );
        window.location.href = res.redirect_url;
      } else {
        setTopupSuccess(`Кошелёк пополнен на ${formatMoney(amount)}`);
        setTopupAmount("");
        await payment.fetchWalletTransactions();
      }
    } catch {
      setTopupError(payment.error || "Ошибка пополнения");
    } finally {
      setTopupLoading(false);
    }
  };

  const handleTopupRefund = async (paymentId) => {
    if (!window.confirm("Вернуть пополнение? Сумма будет списана с баланса."))
      return;
    setTopupRefundingId(paymentId);
    setTopupRefundError("");
    setTopupRefundSuccess("");
    try {
      await payment.refundWalletTopup(paymentId);
      setTopupRefundSuccess("Возврат пополнения выполнен");
      await refreshWalletData();
    } catch {
      setTopupRefundError(payment.error || "Ошибка при возврате");
    } finally {
      setTopupRefundingId(null);
    }
  };

  const handleRefund = async (contest_id) => {
    if (!window.confirm("Вернуть средства за этот конкурс?")) return;
    setRefundingId(contest_id);
    setRefundError("");
    setRefundSuccess("");
    try {
      await payment.refundPayment(contest_id);
      setRefundSuccess("Возврат выполнен успешно");
      await Promise.all([refreshWalletData(), payment.fetchHistory()]);
    } catch {
      setRefundError(payment.error || "Ошибка при возврате");
    } finally {
      setRefundingId(null);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) {
      setWithdrawError("Введите сумму больше нуля");
      return;
    }
    setWithdrawError("");
    setWithdrawSuccess("");
    setWithdrawing(true);
    try {
      await payment.withdrawFromWallet(
        amount,
        withdrawForm.card_number || null,
        withdrawForm.payout_type,
        withdrawForm.yoo_money_account || null,
      );
      setWithdrawSuccess(`Заявка на вывод ${formatMoney(amount)} отправлена!`);
      setWithdrawForm({ amount: "", payout_type: "yoo_money", card_number: "", yoo_money_account: "" });
      await payment.fetchWalletTransactions();
    } catch {
      setWithdrawError(payment.error || "Ошибка при выводе средств");
    } finally {
      setWithdrawing(false);
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-800 dark:text-gray-100 text-sm bg-white dark:bg-gray-700 transition-all";

  const tabs = [
    { key: "balance", label: "Баланс" },
    { key: "withdraw", label: "Вывести" },
    { key: "transactions", label: "Транзакции" },
    ...(isCustomer ? [{ key: "history", label: "Платежи" }] : []),
    { key: "payouts", label: "Выплаты" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Кошелёк
        </h1>

        <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-80 mb-1">
            Текущий баланс
          </div>
          <div className="text-4xl font-black tracking-tight mb-4">
            {balanceLabel} <span className="text-2xl opacity-70">₽</span>
          </div>
          <form onSubmit={handleTopup} className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Сумма пополнения"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="flex-1 px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            <button
              type="submit"
              disabled={topupLoading}
              className="px-5 py-2 rounded-xl bg-white text-violet-700 font-semibold text-sm hover:bg-violet-50 transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {topupLoading ? "…" : "Пополнить"}
            </button>
          </form>
          {topupPollStatus === "polling" && (
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

        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-violet-600 text-violet-700 dark:text-violet-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "balance" && (
          <BalanceTab
            balance={payment.balance}
            transactionsCount={payment.walletTransactions.length}
            isExecutor={isExecutor}
            formatMoney={formatMoney}
          />
        )}

        {tab === "transactions" && (
          <TransactionsTab
            topupRefundSuccess={topupRefundSuccess}
            topupRefundError={topupRefundError}
            loading={payment.loading}
            transactions={payment.walletTransactions}
            getTransactionConfig={getTransactionConfig}
            refundedTopupIds={refundedTopupIds}
            topupRefundingId={topupRefundingId}
            onRefund={handleTopupRefund}
            formatMoney={formatMoney}
          />
        )}

        {tab === "history" && (
          <PaymentHistoryTab
            refundSuccess={refundSuccess}
            refundError={refundError}
            loading={payment.loading}
            history={payment.history}
            getContestTitle={getContestTitle}
            refundingId={refundingId}
            onRefund={handleRefund}
            formatMoney={formatMoney}
          />
        )}

        {tab === "withdraw" && (
          <WithdrawTab
            balance={payment.balance}
            withdrawSuccess={withdrawSuccess}
            withdrawError={withdrawError}
            onSubmit={handleWithdraw}
            withdrawForm={withdrawForm}
            setWithdrawForm={setWithdrawForm}
            inputCls={inputCls}
            withdrawing={withdrawing}
            formatMoney={formatMoney}
          />
        )}

        {tab === "payouts" && (
          <PayoutsTab
            loading={payment.loading}
            payouts={payment.withdrawals}
            formatMoney={formatMoney}
          />
        )}
      </div>
    </div>
  );
};

export default observer(WalletPage);
