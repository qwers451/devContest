import React, { useContext, useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { observer } from "mobx-react-lite";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Context } from "../../context";
import { fetchData } from "../../services/apiService";
import type { User } from "../../types";
import {
  METRICS_PERIODS,
  computeMetrics,
  fmtDays,
  fmtInt,
  fmtMoney,
  fmtNumber1,
  fmtPercent,
  periodStart,
  type MetricsPeriod,
} from "../../utils/metrics";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface SummaryItem {
  label: string;
  value: number;
}

const cardCls = "rounded-lg border border-gray-700 bg-gray-900 p-4";
const chartOptions = (stepSize?: number) => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0, stepSize }, grid: { color: "rgba(107,114,128,0.2)" } },
    x: { grid: { display: false } },
  },
  plugins: { legend: { display: true, labels: { boxWidth: 12 } } },
});

const Card = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className={cardCls}>
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className="text-[18px] font-semibold text-gray-100 break-words">{value}</div>
    {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
  </div>
);

const PlatformMetrics = observer(() => {
  const { rating } = useContext(Context)!;
  const [period, setPeriod] = useState<MetricsPeriod>("30d");
  const [users, setUsers] = useState<Pick<User, "id" | "role" | "created_at">[]>([]);
  const [commission, setCommission] = useState<number | null>(null);
  const [prizePaid, setPrizePaid] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Конкурсы, решения и пользователи не зависят от периода: грузим один раз.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [list] = await Promise.all([
          fetchData<User[]>("/users"),
          rating.ensureContests(true),
          rating.ensureAllSubmissions(true),
        ]);
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Не удалось загрузить данные для метрик");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rating]);

  // Комиссия платформы приходит из платёжного сервиса и зависит от периода.
  useEffect(() => {
    let cancelled = false;
    const from = periodStart(period, Date.now());
    fetchData<{ summary?: SummaryItem[] }>(
      "/payments/statistics",
      {
        scope: "payments",
        group_by: "status",
        metric: "amount",
        date_from: from === null ? undefined : new Date(from).toISOString(),
      },
      { silent: true },
    )
      .then((res) => {
        const item = res?.summary?.find((s) => s.label === "Комиссия платформы");
        const prizes = res?.summary?.find((s) => s.label === "Выплачено призовых");
        if (!cancelled) {
          setCommission(item && Number.isFinite(item.value) ? item.value : null);
          setPrizePaid(prizes && Number.isFinite(prizes.value) ? prizes.value : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommission(null);
          setPrizePaid(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const contests = rating.contests;
  const submissions = Object.values(rating.submissionsByExecutor).flat();

  const m = useMemo(
    () => computeMetrics({ users, contests, submissions, commissionTotal: commission, prizePaidTotal: prizePaid, period }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, contests, rating.submissionsByExecutor, commission, prizePaid, period],
  );

  const monthsData = {
    labels: m.months.map((x) => x.label),
    datasets: [
      { label: "Создано", data: m.months.map((x) => x.created), backgroundColor: "#1d5fd1" },
      { label: "Завершено", data: m.months.map((x) => x.finished), backgroundColor: "#2f8a57" },
    ],
  };
  const distData = {
    labels: m.distribution.map((x) => x.label),
    datasets: [{ label: "Конкурсов", data: m.distribution.map((x) => x.count), backgroundColor: "#7f9ed8" }],
  };
  const hasMonths = m.months.some((x) => x.created > 0 || x.finished > 0);
  const hasDist = m.distribution.some((x) => x.count > 0);
  const empty = "text-gray-400 text-[13px] h-full flex items-center justify-center";

  return (
    <div className="mb-8" data-testid="platform-metrics">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-[15px] font-medium text-violet-700 dark:text-violet-400">Ключевые метрики</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {METRICS_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`px-4 py-2 rounded-md text-[13px] font-semibold transition-colors ${
                period === p.key ? "bg-violet-600 text-white" : "bg-gray-800 text-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}
      {loading ? (
        <div className="text-gray-400 text-[13px]">Загрузка...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
            <Card label="Активные конкурсы" value={fmtInt(m.activeContests)} hint="сейчас" />
            <Card
              label="Пользователи"
              value={fmtInt(m.usersTotal)}
              hint={`заказчики ${fmtInt(m.customers)} · исполнители ${fmtInt(m.executors)}`}
            />
            <Card label="Новые пользователи, 30 дней" value={fmtInt(m.newUsers30d)} />
            <Card label="Новые за выбранный период" value={fmtInt(m.newUsersPeriod)} />
            <Card label="Среднее время до завершения" value={fmtDays(m.avgCompletionDays)} hint="от публикации до выбора победителя" />
            <Card label="Среднее число заявок на конкурс" value={fmtNumber1(m.avgSubmissionsPerContest)} />
            <Card label="Средний призовой фонд" value={fmtMoney(m.avgPrizePool)} />
            <Card
              label="Доля успешных конкурсов"
              value={fmtPercent(m.successRate)}
              hint={m.successRate === null ? undefined : `с победителем ${m.successCount} · без ${m.failedCount}`}
            />
            <Card label="Комиссия платформы" value={fmtMoney(m.commissionTotal)} />
            <Card label="Выплачено призовых" value={fmtMoney(m.prizePaidOut)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={cardCls}>
              <div className="text-[13px] text-gray-300 mb-3">Конкурсы по месяцам: создано и завершено</div>
              <div className="h-60">
                {hasMonths ? <Bar data={monthsData} options={chartOptions()} /> : <p className={empty}>Данных пока нет</p>}
              </div>
            </div>
            <div className={cardCls}>
              <div className="text-[13px] text-gray-300 mb-3">Сколько решений приходит на конкурс</div>
              <div className="h-60">
                {hasDist ? <Bar data={distData} options={chartOptions()} /> : <p className={empty}>Данных пока нет</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default PlatformMetrics;
