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
  ChatMessage,
  Conversation as ChatConversation,
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
    winner: { submission_id: 21, executor_id: 2, selected_at: iso(-4) },
    prize_distribution: [60, 25, 15],
    awards: [
      { place: 1, submission_id: 21, executor_id: 2, amount: 186000, net_amount: 167400 },
      { place: 2, submission_id: 22, executor_id: 3, amount: 77500, net_amount: 69750 },
      { place: 3, submission_id: 23, executor_id: 5, amount: 46500, net_amount: 41850 },
    ],
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
    winner: { submission_id: 24, executor_id: 2, selected_at: iso(-12) },
    prize_distribution: [100],
    awards: [{ place: 1, submission_id: 24, executor_id: 2, amount: 140000, net_amount: 126000 }],
  },
  {
    id: 7,
    number: 1036,
    title: "Прототип личного кабинета застройщика",
    annotation: "Кликабельный прототип с планировками, графиком платежей и чатом с менеджером.",
    prizepool: 120000,
    ends_at: iso(-40),
    status: "finished",
    type_id: 3,
    customer_id: 4,
    current_stage_id: null,
    stages: [],
    created_at: iso(-95),
    updated_at: iso(-40),
    winner: { submission_id: 26, executor_id: 3, selected_at: iso(-40) },
    prize_distribution: [100],
    awards: [{ place: 1, submission_id: 26, executor_id: 3, amount: 120000, net_amount: 108000 }],
  },
  {
    id: 8,
    number: 1035,
    title: "Мобильный клиент для службы доставки",
    annotation: "Трекинг курьера на карте, пуш-уведомления, оплата картой.",
    prizepool: 200000,
    ends_at: iso(-75),
    status: "finished",
    type_id: 2,
    customer_id: 1,
    current_stage_id: null,
    stages: [],
    created_at: iso(-130),
    updated_at: iso(-75),
    winner: { submission_id: 28, executor_id: 5, selected_at: iso(-75) },
    prize_distribution: [100],
    awards: [{ place: 1, submission_id: 28, executor_id: 5, amount: 200000, net_amount: 180000 }],
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
    avg_score: 9.2,
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
    avg_score: 7.6,
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
    avg_score: 8.2,
    created_at: iso(-3),
    updated_at: iso(-1),
    executor_login: "m_zaytsev",
    contest_title: "Мобильное приложение для сети пекарен",
  },
  // Решения по завершённым конкурсам: питают рейтинг и портфолио исполнителей.
  ...(
    [
      [21, 4, 2, 3, 94, 9.4, -30, "Витрина на Next.js с фасетным поиском", ["preview.png", "src.zip"]],
      [22, 4, 3, 1, 88, 8.6, -29, "Каталог на 40 тысяч позиций с кешем", ["src.zip"]],
      [23, 4, 5, 1, 79, 8.0, -28, "Витрина с офлайн-режимом", ["src.zip"]],
      [24, 5, 2, 3, 90, 9.0, -40, "Дашборд звонков на React и ECharts", ["preview.png", "src.zip"]],
      [25, 5, 3, 1, 72, 7.0, -39, "Аналитика колл-центра: отчёты и выгрузки", ["src.zip"]],
      [26, 7, 3, 3, 91, 9.2, -70, "Кликабельный прототип кабинета застройщика", ["preview.png"]],
      [27, 7, 5, 1, 68, 6.5, -69, "Прототип с планировками и графиком платежей", ["prototype.pdf"]],
      [28, 8, 5, 3, 85, 8.4, -100, "Клиент службы доставки на React Native", ["preview.png", "app.zip"]],
      [29, 8, 2, 1, 80, 7.8, -99, "Приложение курьерской службы с трекингом", ["app.zip"]],
    ] as [number, number, number, number, number, number, number, string, string[]][]
  ).map(([id, contestId, executorId, status, ai, avg, days, title, files]): Submission => ({
    id,
    number: 300 + id,
    contest_id: contestId,
    executor_id: executorId,
    title,
    annotation: "Решение по ТЗ конкурса, все обязательные пункты выполнены.",
    status,
    files,
    ai_score: ai,
    critical_issues: false,
    avg_score: avg,
    created_at: iso(days),
    updated_at: iso(days + 2),
    executor_login: users.find((u) => u.id === executorId)?.login,
    contest_title: contests.find((c) => c.id === contestId)?.title,
  })),
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

// ── Чат ─────────────────────────────────────────────────────────────────────
// Текущий демо-пользователь — users[0] (заказчик orbit_studio, id 1).
const minutesAgo = (m: number) => new Date(now - m * 60000).toISOString();

const chatMessages: ChatMessage[] = [
  { id: 1, conversation_id: 1, sender_id: 2, text: "Здравствуйте! Посмотрела ТЗ, есть пара вопросов по макетам.", created_at: iso(-1), read_at: iso(-1) },
  { id: 2, conversation_id: 1, sender_id: 1, text: "Добрый день! Слушаю, что именно вас интересует?", created_at: iso(-1), read_at: iso(-1) },
  { id: 3, conversation_id: 1, sender_id: 2, text: "Нужны ли адаптивные версии для планшетов или достаточно десктопа и мобильных?", created_at: minutesAgo(190), read_at: minutesAgo(180) },
  { id: 4, conversation_id: 1, sender_id: 1, text: "Планшеты тоже нужны, но в приоритете десктоп и телефон.", created_at: minutesAgo(170), read_at: minutesAgo(160) },
  { id: 5, conversation_id: 1, sender_id: 2, text: "Поняла, отправлю решение до дедлайна. Спасибо!", created_at: minutesAgo(25), read_at: null },
  { id: 6, conversation_id: 2, sender_id: 1, text: "Николай, ваше решение выглядит интересно. Сможете добавить тёмную тему?", created_at: minutesAgo(300), read_at: minutesAgo(290) },
  { id: 7, conversation_id: 2, sender_id: 3, text: "Да, конечно. Добавлю в течение пары дней.", created_at: minutesAgo(280), read_at: minutesAgo(270) },
];

const chatConversation = (id: number, contestIdx: number, otherId: number): ChatConversation => {
  const c = contests[contestIdx];
  const other = users.find((u) => u.id === otherId)!;
  const msgs = chatMessages.filter((m) => m.conversation_id === id);
  const last = msgs[msgs.length - 1];
  return {
    id,
    contest_id: c.id,
    customer_id: 1,
    executor_id: otherId,
    created_at: iso(-3),
    last_message_at: last?.created_at ?? null,
    contest_title: c.title,
    contest_number: c.number,
    other_user_id: otherId,
    other_user_login: other.login,
    last_message: last
      ? { id: last.id, sender_id: last.sender_id, text: last.text.slice(0, 120), created_at: last.created_at }
      : null,
    unread_count: msgs.filter((m) => m.sender_id !== 1 && !m.read_at).length,
  };
};

const chatConversationSpecs: [number, number, number][] = [
  [1, 0, 2],
  [2, 1, 3],
];

/** Маршруты /chat/*; undefined — не чат-запрос. */
function chatRoute(path: string, method: string, body: unknown): unknown {
  if (!path.startsWith("/chat")) return undefined;
  if (path === "/chat/conversations" && method === "post") {
    const { contest_id } = (body ?? {}) as { contest_id?: number };
    const idx = Math.max(0, contests.findIndex((c) => c.id === contest_id));
    const spec = chatConversationSpecs.find((s) => s[1] === idx) ?? chatConversationSpecs[0];
    return chatConversation(...spec);
  }
  if (path === "/chat/conversations") {
    return chatConversationSpecs
      .map((s) => chatConversation(...s))
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  }
  if (path === "/chat/unread-count") {
    return {
      unread_count: chatConversationSpecs.reduce((n, s) => n + chatConversation(...s).unread_count, 0),
    };
  }
  let m = path.match(/^\/chat\/conversations\/(\d+)\/messages$/);
  if (m) {
    const id = Number(m[1]);
    if (method === "post") {
      const { text } = (body ?? {}) as { text?: string };
      const msg: ChatMessage = {
        id: chatMessages.reduce((mx, x) => Math.max(mx, x.id), 0) + 1,
        conversation_id: id,
        sender_id: 1,
        text: String(text ?? "").trim(),
        created_at: new Date().toISOString(),
        read_at: null,
      };
      chatMessages.push(msg);
      return msg;
    }
    return chatMessages.filter((x) => x.conversation_id === id);
  }
  m = path.match(/^\/chat\/conversations\/(\d+)\/read$/);
  if (m) {
    let marked = 0;
    chatMessages.forEach((x) => {
      if (x.conversation_id === Number(m![1]) && x.sender_id !== 1 && !x.read_at) {
        x.read_at = new Date().toISOString();
        marked += 1;
      }
    });
    return { marked };
  }
  return [];
}

/** Таблица маршрутов: первое совпадение отдаёт ответ. */
const routes: [RegExp, (match: RegExpMatchArray) => unknown][] = [
  [/^\/contests$/, () => ({ items: contests, total: contests.length, page: 1, pages: 1 })],
  [/^\/contests\/number\/(\d+)$/, (m) => contests.find((c) => c.number === Number(m[1])) ?? contests[0]],
  [
    /^\/contests\/(\d+)\/awards$/,
    (m) => {
      const c = contests.find((x) => x.id === Number(m[1]));
      return (c?.awards ?? []).map((a) => {
        const sub = submissions.find((x) => x.id === a.submission_id);
        return {
          ...a,
          submission_number: sub?.number ?? null,
          submission_title: sub?.title ?? null,
          executor_login: users.find((u) => u.id === a.executor_id)?.login ?? null,
          commission: a.net_amount != null ? Math.round((a.amount - a.net_amount) * 100) / 100 : null,
        };
      });
    },
  ],
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
  [/^\/payments\/commission$/, () => ({ percent: 10 })],
  [/^\/wallet\/balance$/, () => ({ balance: 285000, currency: "RUB" })],
  [/^\/wallet\/transactions$/, () => transactions],
  [/^\/wallet$/, () => ({ balance: 285000, currency: "RUB" })],
  [
    /^\/payments\/statistics$/,
    () => ({
      summary: [
        { label: "Платежей", value: 6 },
        { label: "Сумма платежей", value: 775000 },
        { label: "Операций кошелька", value: 14 },
        { label: "Сумма выплат", value: 697500 },
        { label: "Возвратов", value: 0 },
        { label: "Комиссия платформы", value: 77500 },
      ],
      chart: { labels: ["released"], datasets: [{ label: "Сумма", data: [775000] }] },
    }),
  ],
  [/^\/(payments\/)?statistics(\/contests)?$/, () => statistics],
  [/^\/auth\/(login|register)$/, () => ({ access_token: "demo-token", user: users[0] })],
];

/** Списки с серверными фильтрами, которые нужны рейтингу и профилям. */
function filteredList(path: string, params: Record<string, unknown> | undefined): unknown {
  if (path === "/submissions") {
    const executorId = params?.executor_id != null ? Number(params.executor_id) : null;
    const contestId = params?.contest_id != null ? Number(params.contest_id) : null;
    return submissions.filter(
      (s) => (executorId === null || s.executor_id === executorId) && (contestId === null || s.contest_id === contestId),
    );
  }
  if (path === "/contests" && params?.customer_id != null) {
    const items = contests.filter((c) => c.customer_id === Number(params.customer_id));
    return { items, total: items.length, page: 1, pages: 1 };
  }
  return undefined;
}

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
  const path = (config.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  let body: unknown = config.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      /* не JSON */
    }
  }
  const method = (config.method ?? "get").toLowerCase();
  const data =
    chatRoute(path, method, body) ??
    (method === "get" ? filteredList(path, config.params as Record<string, unknown> | undefined) : undefined) ??
    resolve(config.url ?? "/");
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
