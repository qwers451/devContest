import React, { useContext, useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { observer } from "mobx-react-lite";
import { Context } from "../../context";
import { fetchData } from "../../services/apiService";
import { Chart } from "chart.js";
import {
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

type StatisticsTab = "contest" | "payment" | "evaluation";

interface SummaryItem {
  label: string;
  value: number;
}

interface ChartDataset {
  label: string;
  data: number[];
}

interface StatisticsResponse {
  summary: SummaryItem[];
  chart: {
    labels: string[];
    datasets: ChartDataset[];
  };
}

interface ContestFilters {
  groupBy: string;
  metric: string;
  status: string;
  typeId: string;
  dateFrom: string;
  dateTo: string;
}

interface PaymentFilters {
  scope: string;
  groupBy: string;
  metric: string;
  paymentStatus: string;
  txType: string;
  payoutStatus: string;
  dateFrom: string;
  dateTo: string;
}

interface EvaluationFilters {
  groupBy: string;
  metric: string;
  contestId: string;
  criticalOnly: boolean;
  dateFrom: string;
  dateTo: string;
}

const contestDefaults: ContestFilters = {
  groupBy: "type",
  metric: "count",
  status: "",
  typeId: "",
  dateFrom: "",
  dateTo: "",
};

const paymentDefaults: PaymentFilters = {
  scope: "payments",
  groupBy: "status",
  metric: "amount",
  paymentStatus: "",
  txType: "",
  payoutStatus: "",
  dateFrom: "",
  dateTo: "",
};

const evaluationDefaults: EvaluationFilters = {
  groupBy: "score_band",
  metric: "count",
  contestId: "",
  criticalOnly: false,
  dateFrom: "",
  dateTo: "",
};

const tabButtonCls =
  "px-4 py-2 rounded-xl text-sm font-semibold transition-colors";
const inputCls =
  "px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200";

const formatSummaryValue = (label: string, value: number) => {
  if (label.includes("Сумма")) {
    return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
  }
  if (label.includes("балл")) {
    return `${value.toFixed(1)}%`;
  }
  return Number.isInteger(value)
    ? value.toLocaleString("ru-RU")
    : value.toFixed(1);
};

const StatisticsPanel = observer(() => {
  const { contest } = useContext(Context);
  const [activeTab, setActiveTab] = useState<StatisticsTab>("contest");
  const [contestFilters, setContestFilters] =
    useState<ContestFilters>(contestDefaults);
  const [paymentFilters, setPaymentFilters] =
    useState<PaymentFilters>(paymentDefaults);
  const [evaluationFilters, setEvaluationFilters] =
    useState<EvaluationFilters>(evaluationDefaults);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!contest.types.length) {
      void contest.fetchTypes();
    }
  }, [contest]);

  const loadStatistics = async (
    tab: StatisticsTab,
    overrides?: Partial<ContestFilters & PaymentFilters & EvaluationFilters>,
  ) => {
    setLoading(true);
    setError("");
    try {
      if (tab === "contest") {
        const filters = { ...contestFilters, ...overrides };
        const data = await fetchData<StatisticsResponse>("/statistics/contests", {
          group_by: filters.groupBy,
          metric: filters.metric,
          status: filters.status || undefined,
          type_id: filters.typeId || undefined,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
        });
        setStatistics(data);
      } else if (tab === "payment") {
        const filters = { ...paymentFilters, ...overrides };
        const data = await fetchData<StatisticsResponse>("/payments/statistics", {
          scope: filters.scope,
          group_by: filters.groupBy,
          metric: filters.metric,
          payment_status: filters.paymentStatus || undefined,
          tx_type: filters.txType || undefined,
          payout_status: filters.payoutStatus || undefined,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
        });
        setStatistics(data);
      } else {
        const filters = { ...evaluationFilters, ...overrides };
        const data = await fetchData<StatisticsResponse>(
          "/evaluation/statistics",
          {
            group_by: filters.groupBy,
            metric: filters.metric,
            contest_id: filters.contestId || undefined,
            critical_only: filters.criticalOnly || undefined,
            date_from: filters.dateFrom || undefined,
            date_to: filters.dateTo || undefined,
          },
        );
        setStatistics(data);
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError("Не удалось загрузить статистику");
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatistics(activeTab);
  }, [activeTab]);

  const chartData = useMemo(() => {
    if (!statistics) {
      return null;
    }
    const colors = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
    return {
      labels: statistics.chart.labels,
      datasets: statistics.chart.datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: colors[index % colors.length],
      })),
    };
  }, [statistics]);

  const handleApply = () => {
    void loadStatistics(activeTab);
  };

  const handleReset = () => {
    if (activeTab === "contest") {
      setContestFilters(contestDefaults);
      void loadStatistics("contest", contestDefaults);
      return;
    }
    if (activeTab === "payment") {
      setPaymentFilters(paymentDefaults);
      void loadStatistics("payment", paymentDefaults);
      return;
    }
    setEvaluationFilters(evaluationDefaults);
    void loadStatistics("evaluation", evaluationDefaults);
  };

  const renderContestFilters = () => (
    <>
      <select
        value={contestFilters.groupBy}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, groupBy: e.target.value }))
        }
        className={inputCls}
      >
        <option value="type">Группировка: тип</option>
        <option value="status">Группировка: статус</option>
        <option value="created_month">Группировка: месяц создания</option>
        <option value="end_month">Группировка: месяц окончания</option>
        <option value="prizepool">Группировка: диапазон призов</option>
      </select>
      <select
        value={contestFilters.metric}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, metric: e.target.value }))
        }
        className={inputCls}
      >
        <option value="count">Метрика: количество</option>
        <option value="prize_sum">Метрика: сумма призов</option>
      </select>
      <select
        value={contestFilters.status}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, status: e.target.value }))
        }
        className={inputCls}
      >
        <option value="">Все статусы</option>
        {Object.entries(contest.status).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={contestFilters.typeId}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, typeId: e.target.value }))
        }
        className={inputCls}
      >
        <option value="">Все типы</option>
        {contest.types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={contestFilters.dateFrom}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
        }
        className={inputCls}
      />
      <input
        type="date"
        value={contestFilters.dateTo}
        onChange={(e) =>
          setContestFilters((prev) => ({ ...prev, dateTo: e.target.value }))
        }
        className={inputCls}
      />
    </>
  );

  const renderPaymentFilters = () => (
    <>
      <select
        value={paymentFilters.scope}
        onChange={(e) =>
          setPaymentFilters((prev) => ({
            ...prev,
            scope: e.target.value,
            groupBy: e.target.value === "wallet" ? "type" : "status",
          }))
        }
        className={inputCls}
      >
        <option value="payments">Срез: платежи</option>
        <option value="wallet">Срез: кошелёк</option>
        <option value="payouts">Срез: выплаты</option>
      </select>
      <select
        value={paymentFilters.groupBy}
        onChange={(e) =>
          setPaymentFilters((prev) => ({ ...prev, groupBy: e.target.value }))
        }
        className={inputCls}
      >
        <option value={paymentFilters.scope === "wallet" ? "type" : "status"}>
          Группировка: {paymentFilters.scope === "wallet" ? "тип" : "статус"}
        </option>
        <option value="month">Группировка: месяц</option>
      </select>
      <select
        value={paymentFilters.metric}
        onChange={(e) =>
          setPaymentFilters((prev) => ({ ...prev, metric: e.target.value }))
        }
        className={inputCls}
      >
        <option value="amount">Метрика: сумма</option>
        <option value="count">Метрика: количество</option>
      </select>
      {paymentFilters.scope === "payments" && (
        <select
          value={paymentFilters.paymentStatus}
          onChange={(e) =>
            setPaymentFilters((prev) => ({
              ...prev,
              paymentStatus: e.target.value,
            }))
          }
          className={inputCls}
        >
          <option value="">Все статусы платежей</option>
          <option value="pending">pending</option>
          <option value="held">held</option>
          <option value="released">released</option>
          <option value="refunded">refunded</option>
          <option value="failed">failed</option>
        </select>
      )}
      {paymentFilters.scope === "wallet" && (
        <select
          value={paymentFilters.txType}
          onChange={(e) =>
            setPaymentFilters((prev) => ({ ...prev, txType: e.target.value }))
          }
          className={inputCls}
        >
          <option value="">Все типы операций</option>
          <option value="topup">Пополнение</option>
          <option value="contest_payment">Оплата конкурса</option>
          <option value="income">Доход</option>
          <option value="withdrawal">Вывод</option>
        </select>
      )}
      {paymentFilters.scope === "payouts" && (
        <select
          value={paymentFilters.payoutStatus}
          onChange={(e) =>
            setPaymentFilters((prev) => ({
              ...prev,
              payoutStatus: e.target.value,
            }))
          }
          className={inputCls}
        >
          <option value="">Все статусы выплат</option>
          <option value="pending">pending</option>
          <option value="held">held</option>
          <option value="released">released</option>
          <option value="refunded">refunded</option>
          <option value="failed">failed</option>
        </select>
      )}
      <input
        type="date"
        value={paymentFilters.dateFrom}
        onChange={(e) =>
          setPaymentFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
        }
        className={inputCls}
      />
      <input
        type="date"
        value={paymentFilters.dateTo}
        onChange={(e) =>
          setPaymentFilters((prev) => ({ ...prev, dateTo: e.target.value }))
        }
        className={inputCls}
      />
    </>
  );

  const renderEvaluationFilters = () => (
    <>
      <select
        value={evaluationFilters.groupBy}
        onChange={(e) =>
          setEvaluationFilters((prev) => ({
            ...prev,
            groupBy: e.target.value,
          }))
        }
        className={inputCls}
      >
        <option value="score_band">Группировка: диапазон баллов</option>
        <option value="contest">Группировка: конкурс</option>
        <option value="month">Группировка: месяц</option>
      </select>
      <select
        value={evaluationFilters.metric}
        onChange={(e) =>
          setEvaluationFilters((prev) => ({
            ...prev,
            metric: e.target.value,
          }))
        }
        className={inputCls}
      >
        <option value="count">Метрика: количество</option>
        <option value="avg_score">Метрика: средний балл</option>
        <option value="critical_count">Метрика: критические нарушения</option>
      </select>
      <input
        type="number"
        min="1"
        placeholder="ID конкурса"
        value={evaluationFilters.contestId}
        onChange={(e) =>
          setEvaluationFilters((prev) => ({
            ...prev,
            contestId: e.target.value,
          }))
        }
        className={inputCls}
      />
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={evaluationFilters.criticalOnly}
          onChange={(e) =>
            setEvaluationFilters((prev) => ({
              ...prev,
              criticalOnly: e.target.checked,
            }))
          }
        />
        Только с критическими нарушениями
      </label>
      <input
        type="date"
        value={evaluationFilters.dateFrom}
        onChange={(e) =>
          setEvaluationFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
        }
        className={inputCls}
      />
      <input
        type="date"
        value={evaluationFilters.dateTo}
        onChange={(e) =>
          setEvaluationFilters((prev) => ({ ...prev, dateTo: e.target.value }))
        }
        className={inputCls}
      />
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-xl font-bold text-violet-700 dark:text-violet-400">
          Статистика
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "contest", label: "Конкурсы" },
            { key: "payment", label: "Платежи" },
            { key: "evaluation", label: "Оценки" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as StatisticsTab)}
              className={`${tabButtonCls} ${
                activeTab === tab.key
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === "contest" && renderContestFilters()}
          {activeTab === "payment" && renderPaymentFilters()}
          {activeTab === "evaluation" && renderEvaluationFilters()}
          <button
            onClick={handleApply}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
          >
            Применить
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm transition-colors"
          >
            Сбросить
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {statistics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
          {statistics.summary.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
            >
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                {item.label}
              </div>
              <div className="text-xl font-black text-gray-900 dark:text-gray-100">
                {formatSummaryValue(item.label, item.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm">Загрузка...</div>
      ) : chartData && chartData.labels.length > 0 ? (
        <Bar
          data={chartData}
          options={{
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: true } },
          }}
        />
      ) : (
        <p className="text-gray-400 text-sm">Данных для графика пока нет</p>
      )}
    </div>
  );
});

export default StatisticsPanel;
