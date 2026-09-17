/**
 * Демо-режим для скриншотов и презентаций.
 *
 * Включается переменной окружения VITE_DEMO=1. Когда флаг выключен —
 * файл ни на что не влияет: адаптер не подставляется, запросы идут
 * в реальные сервисы. Логика страниц и сторов не меняется, подменяется
 * только транспорт: axios отвечает заранее заготовленными данными.
 */
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from "axios";

import type {
  Contest,
  ContestStage,
  ContestType,
  EvaluationResult,
  Review,
  Statistics,
  Submission,
  User,
  WalletTransaction,
} from "../types";

export const DEMO = import.meta.env.VITE_DEMO === "1";

const now = Date.now();
const DAY = 86400000;
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();

const users: User[] = [
  { id: 1, login: "orbit_studio", email: "hi@orbit.studio", role: "customer", status: 1, created_at: iso(-320) },
  { id: 2, login: "kate_dev", email: "kate@mail.dev", role: "executor", status: 1, created_at: iso(-260) },
  { id: 3, login: "n_frolov", email: "frolov@mail.dev", role: "executor", status: 1, created_at: iso(-190) },
  { id: 4, login: "sd_labs", email: "team@sdlabs.io", role: "customer", status: 1, created_at: iso(-150) },
  { id: 5, login: "m_zaytsev", email: "zaytsev@mail.dev", role: "executor", status: 1, created_at: iso(-95) },
  { id: 6, login: "admin", email: "admin@devcontest.app", role: "admin", status: 1, created_at: iso(-400) },
];

const contestTypes: ContestType[] = [
  { id: 1, name: "Веб-разработка" },
  { id: 2, name: "Мобильная разработка" },
  { id: 3, name: "Дизайн интерфейсов" },
  { id: 4, name: "Аналитика данных" },
];

const stages: ContestStage[] = [
  { id: 1, name: "Приём заявок", description: "Участники присылают решения и сопроводительные материалы.", deadline: iso(4), order: 1, prize_amount: 0 },
  { id: 2, name: "Автоматическая проверка", description: "Сервис оценки сверяет решение с требованиями ТЗ.", deadline: iso(7), order: 2, prize_amount: 30000 },
  { id: 3, name: "Финальное ревью", description: "Заказчик выбирает победителя и подтверждает выплату.", deadline: iso(12), order: 3, prize_amount: 90000 },
];

const contests: Contest[] = [
  {
    id: 1,
    number: 1042,
    title: "Личный кабинет для страхового брокера",
    annotation: "Кабинет с полисами, выплатами и уведомлениями. Дизайн-система на стороне заказчика.",
    description: "Требуется собрать личный кабинет на React с авторизацией по SMS, списком полисов и историей выплат.",
    tz_text: "1. Авторизация по номеру телефона\n2. Список полисов с фильтрами\n3. История выплат\n4. Адаптив от 360px",
    prizepool: 180000,
    ends_at: iso(12),
    status: "active",
    type_id: 1,
    customer_id: 1,
    current_stage_id: 2,
    stages,
    created_at: iso(-14),
    updated_at: iso(-2),
  },
  {
    id: 2,
    number: 1041,
    title: "Мобильное приложение для сети пекарен",
    annotation: "Заказ и предоплата, карта точек, программа лояльности.",
    description: "Приложение под iOS и Android на React Native.",
    prizepool: 240000,
    ends_at: iso(6),
    status: "active",
    type_id: 2,
    customer_id: 4,
    current_stage_id: 1,
    stages: [],
    created_at: iso(-9),
    updated_at: iso(-1),
  },
  {
    id: 3,
    number: 1040,
    title: "Редизайн дашборда логистики",
    annotation: "Плотные таблицы, статусы рейсов, тёмная тема по умолчанию.",
    prizepool: 95000,
    ends_at: iso(2),
    status: "active",
    type_id: 3,
    customer_id: 1,
    current_stage_id: 3,
    stages: [],
    created_at: iso(-21),
    updated_at: iso(-3),
  },
  {
    id: 4,
    number: 1039,
    title: "Витрина маркетплейса стройматериалов",
    annotation: "Каталог на 40 тысяч позиций, фасетный поиск, корзина.",
    prizepool: 310000,
    ends_at: iso(-4),
    status: "finished",
    type_id: 1,
    customer_id: 4,
    current_stage_id: null,
    stages: [],
    created_at: iso(-60),
    updated_at: iso(-4),
  },
  {
    id: 5,
    number: 1038,
    title: "Панель аналитики для колл-центра",
    annotation: "Отчёты по звонкам, выгрузки, роли операторов и супервайзеров.",
    prizepool: 140000,
    ends_at: iso(-12),
    status: "finished",
    type_id: 4,
    customer_id: 1,
    current_stage_id: null,
    stages: [],
    created_at: iso(-80),
    updated_at: iso(-12),
  },
  {
    id: 6,
    number: 1037,
    title: "Лендинг образовательной платформы",
    annotation: "Одностраничник с тарифами и формой записи. Черновик, ТЗ дорабатывается.",
    prizepool: 60000,
    ends_at: iso(20),
    status: "draft",
    type_id: 3,
    customer_id: 1,
    current_stage_id: null,
    stages: [],
    created_at: iso(-3),
    updated_at: iso(-1),
  },
];

const submissions: Submission[] = [
  {
    id: 11,
    number: 318,
    contest_id: 1,
    executor_id: 2,
    title: "Кабинет на React 19 и TanStack Query",
    annotation: "Авторизация по SMS, фильтры полисов, история выплат с выгрузкой.",
    description: "Реализованы все пункты ТЗ. Покрытие тестами 78 процентов.",
    status: 2,
    files: ["solution.zip", "readme.md"],
    ai_score: 92,
    critical_issues: false,
    avg_score: 4.6,
    created_at: iso(-5),
    updated_at: iso(-1),
    executor_login: "kate_dev",
    contest_title: "Личный кабинет для страхового брокера",
  },
  {
    id: 12,
    number: 317,
    contest_id: 1,
    executor_id: 3,
    title: "Кабинет с серверным рендерингом",
    annotation: "Next.js, серверные компоненты, кеш на уровне маршрутов.",
    status: 1,
    files: ["app.zip"],
    ai_score: 74,
    critical_issues: true,
    avg_score: 3.8,
    created_at: iso(-4),
    updated_at: iso(-2),
    executor_login: "n_frolov",
    contest_title: "Личный кабинет для страхового брокера",
  },
  {
    id: 13,
    number: 316,
    contest_id: 2,
    executor_id: 5,
    title: "Пекарни: приложение на React Native",
    annotation: "Заказ, оплата, карта точек и накопительные баллы.",
    status: 1,
    files: ["build.zip"],
    ai_score: 81,
    critical_issues: false,
    avg_score: 4.1,
    created_at: iso(-3),
    updated_at: iso(-1),
    executor_login: "m_zaytsev",
    contest_title: "Мобильное приложение для сети пекарен",
  },
];

const evaluation: EvaluationResult = {
  submission_id: 11,
  contest_id: 1,
  compliance_score: 92,
  passed_requirements: [
    "Авторизация по номеру телефона",
    "Список полисов с фильтрами",
    "История выплат",
  ],
  failed_requirements: ["Адаптив от 360px"],
  requirements_detail: [
    { text: "Авторизация по номеру телефона", score: 100, comment: "Отправка кода и повторный запрос через 60 секунд.", is_critical: true },
    { text: "Список полисов с фильтрами", score: 95, comment: "Фильтры по статусу и датам, пагинация серверная.", is_critical: true },
    { text: "История выплат", score: 90, comment: "Таблица с выгрузкой в CSV, нет фильтра по сумме.", is_critical: false },
    { text: "Адаптив от 360px", score: 65, comment: "На 360px таблица выплат уезжает по горизонтали.", is_critical: false },
  ],
  critical_issues: false,
  created_at: iso(-1),
};

const reviews: Review[] = [
  { id: 1, submission_id: 11, number: 1, score: 5, commentary: "Чистый код и понятная структура. Тесты на ключевые сценарии на месте.", created_at: iso(-1) },
  { id: 2, submission_id: 11, number: 2, score: 4, commentary: "На узких экранах таблица выплат требует доработки.", created_at: iso(-1) },
];

const transactions: WalletTransaction[] = [
  { id: 1, type: "topup", amount: 300000, description: "Пополнение через СБП", created_at: iso(-16) },
  { id: 2, type: "contest_payment", amount: -180000, description: "Эскроу по конкурсу 1042", created_at: iso(-14) },
  { id: 3, type: "income", amount: 95000, description: "Выплата за конкурс 1040", created_at: iso(-6) },
  { id: 4, type: "withdrawal", amount: -50000, description: "Вывод на карту 4417", created_at: iso(-2) },
  { id: 5, type: "topup", amount: 120000, description: "Пополнение через СБП", created_at: iso(-1) },
];

const statistics: Statistics = {
  x_labels: ["Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь"],
  datasets: [
    { label: "Конкурсы", data: [4, 7, 6, 11, 9, 14] },
    { label: "Решения", data: [12, 19, 17, 28, 24, 36] },
  ],
};

/** Таблица маршрутов: первое совпадение отдаёт ответ. */
const routes: [RegExp, (match: RegExpMatchArray) => unknown][] = [
  [/^\/contests$/, () => ({ items: contests, total: contests.length, page: 1, pages: 1 })],
  [/^\/contests\/number\/(\d+)$/, (m) => contests.find((c) => c.number === Number(m[1])) ?? contests[0]],
  [/^\/contests\/(\d+)\/stages$/, () => stages],
  [/^\/contests\/(\d+)\/files$/, () => ["tz.pdf", "brandbook.zip"]],
  [/^\/contests\/(\d+)$/, (m) => contests.find((c) => c.id === Number(m[1])) ?? contests[0]],
  [/^\/contest-types$/, () => contestTypes],
  [/^\/contest-templates$/, () => []],
  [/^\/users\/profile$/, () => users[0]],
  [/^\/users\/(\d+)$/, (m) => users.find((u) => u.id === Number(m[1])) ?? users[0]],
  [/^\/users$/, () => users],
  [/^\/submissions\/number\/(\d+)$/, (m) => submissions.find((s) => s.number === Number(m[1])) ?? submissions[0]],
  [/^\/submissions\/(\d+)\/reviews$/, () => reviews],
  [/^\/submissions\/(\d+)\/status-log$/, () => []],
  [/^\/submissions\/(\d+)\/files$/, () => ["solution.zip", "readme.md"]],
  [/^\/submissions$/, () => submissions],
  [
    /^\/evaluation\/requirements\/(\d+)$/,
    (m) => ({
      contest_id: Number(m[1]),
      requirements: evaluation.requirements_detail.map((r) => ({ text: r.text, is_critical: r.is_critical })),
      cached_at: iso(-1),
    }),
  ],
  [
    /^\/evaluation\/contest\/(\d+)\/stats$/,
    (m) => ({ contest_id: Number(m[1]), evaluated_count: 2, avg_score: 83, critical_issues_count: 1 }),
  ],
  [/^\/evaluation\/(\d+)$/, () => evaluation],
  [/^\/wallet\/balance$/, () => ({ balance: 285000, currency: "RUB" })],
  [/^\/wallet\/transactions$/, () => transactions],
  [/^\/wallet$/, () => ({ balance: 285000, currency: "RUB" })],
  [/^\/(payments\/)?statistics(\/contests)?$/, () => statistics],
  [/^\/auth\/(login|register)$/, () => ({ access_token: "demo-token", user: users[0] })],
];

function resolve(url: string): unknown {
  const path = url.split("?")[0].replace(/\/+$/, "") || "/";
  for (const [pattern, handler] of routes) {
    const match = path.match(pattern);
    if (match) return handler(match);
  }
  // Неизвестный маршрут отдаёт пустой список, чтобы экран не падал.
  return [];
}

export const demoAdapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
  const data = resolve(config.url ?? "/");
  // Небольшая задержка, чтобы состояния загрузки выглядели естественно.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  } as AxiosResponse;
};
