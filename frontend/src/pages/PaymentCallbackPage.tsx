import React, { useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";

/**
 * Return URL after YooKassa checkout.
 * Polls payment status until held/failed, then activates contest and redirects.
 */
const PaymentCallbackPage = () => {
  const { payment, contest } = useContext(Context);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const contestId = Number(searchParams.get("contest_id"));
  const isStub = searchParams.get("stub") === "1";

  const [status, setStatus] = useState("pending");
  const [message, setMessage] = useState("Проверяем статус платежа…");
  const [contestNum, setContestNum] = useState(null);
  const pollRef = useRef(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!contestId) {
      setStatus("failed");
      setMessage("Не указан contest_id. Обратитесь в поддержку.");
      return;
    }

    // Immediate check
    checkStatus();

    // Poll every 2 sec, give up after 30 attempts (~60 sec)
    pollRef.current = setInterval(checkStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [contestId]);

  const checkStatus = async () => {
    pollCount.current += 1;
    if (pollCount.current > 30) {
      clearInterval(pollRef.current);
      setStatus("failed");
      setMessage(
        "Платёж не подтверждён за 60 секунд. Возможно, вы закрыли страницу оплаты. Попробуйте ещё раз.",
      );
      return;
    }

    const data = await payment.fetchPaymentStatus(contestId);
    if (!data) return;

    setStatus(data.status);

    if (data.status === "held") {
      clearInterval(pollRef.current);
      setMessage("Платёж подтверждён! Активируем конкурс…");
      await activateAndRedirect();
    } else if (data.status === "failed") {
      clearInterval(pollRef.current);
      setMessage("Платёж отклонён. Попробуйте ещё раз.");
    }
  };

  const activateAndRedirect = async () => {
    const activated = await payment.activateContest(contestId);
    const c = await contest.fetchOneContest(contestId);
    if (c) {
      setContestNum(c.number);
      setMessage(`Конкурс активирован! Переход через 2 сек…`);
      setTimeout(() => navigate(`/contest/${c.number}`), 2000);
    } else {
      setMessage("Конкурс активирован. Перейдите на главную.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 w-full max-w-md text-center animate-fade-in">
        {status === "pending" && (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Обработка платежа
            </h2>
          </>
        )}

        {status === "held" && (
          <>
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-xl font-bold text-emerald-700 mb-2">
              Оплата успешна
            </h2>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="text-5xl mb-4">✕</div>
            <h2 className="text-xl font-bold text-red-600 mb-2">
              Платёж отклонён
            </h2>
          </>
        )}

        <p className="text-gray-500 text-sm mb-6">{message}</p>

        <div className="space-y-3">
          {status === "failed" && (
            <button
              onClick={() => navigate(-1)}
              className="block w-full text-center px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
            >
              Попробовать снова
            </button>
          )}
          {contestNum && (
            <button
              onClick={() => navigate(`/contest/${contestNum}`)}
              className="block w-full text-center px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
            >
              Перейти к конкурсу
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="block w-full text-center px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold text-sm transition-colors"
          >
            На главную
          </button>
        </div>
      </div>
    </div>
  );
};

export default observer(PaymentCallbackPage);
