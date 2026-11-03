import { makeAutoObservable, runInAction } from "mobx";
import { fetchData } from "../services/apiService";
import { DEMO } from "../services/demoData";
import { showToast } from "../utils/toast";
import type ChatStore from "./ChatStore";
import type { IncomingMessageInfo } from "./ChatStore";
import type { ChatMessage, Contest, Submission } from "../types";

export const POLL_INTERVAL_MS = 30000;
export const MAX_ITEMS = 50;
export const DEADLINE_WINDOW_HOURS = 24;
const MAX_FIRED = 300;

export type NotificationType =
  | "submission"
  | "status"
  | "win"
  | "finished"
  | "deadline"
  | "expired"
  | "message";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Маршрут, куда ведёт уведомление. */
  link: string;
  createdAt: number;
  read: boolean;
}

/** Снимок увиденных данных: по нему находим, что изменилось с прошлого опроса. */
export interface Snapshot {
  subs: number[];
  statuses: Record<string, number>;
  finished: number[];
  fired: string[];
}

export interface PollData {
  contests: Contest[];
  submissions: Submission[];
}

export type Draft = Omit<AppNotification, "id" | "createdAt" | "read"> & { key: string };

export const STATUS_LABELS: Record<number, string> = {
  1: "Новое",
  2: "Просмотрено",
  3: "Победитель",
  4: "Необходимы правки",
  5: "Правки внесены",
};

interface AwardLike {
  place: number;
  submission_id: number;
  executor_id: number;
  amount?: number;
  net_amount?: number | null;
}
type ContestExt = Contest & {
  awards?: AwardLike[];
  winner?: { submission_id: number; executor_id: number } | null;
};

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

export function emptySnapshot(): Snapshot {
  return { subs: [], statuses: {}, finished: [], fired: [] };
}

function hoursLeft(endsAt: string, now: number): number | null {
  const t = Date.parse(endsAt);
  if (Number.isNaN(t)) return null;
  return (t - now) / 3600000;
}

/**
 * Чистая функция сравнения: по свежим данным и прошлому снимку возвращает новые уведомления
 * и обновлённый снимок. При `prev === null` (первый запуск) снимок строится молча.
 */
export function diffNotifications(
  role: string,
  userId: number,
  data: PollData,
  prev: Snapshot | null,
  now: number = Date.now(),
): { drafts: Draft[]; snapshot: Snapshot } {
  const silent = prev === null;
  const snap: Snapshot = prev
    ? { subs: [...prev.subs], statuses: { ...prev.statuses }, finished: [...prev.finished], fired: [...prev.fired] }
    : emptySnapshot();
  const subs = new Set(snap.subs);
  const finished = new Set(snap.finished);
  const fired = new Set(snap.fired);
  const drafts: Draft[] = [];
  const push = (d: Draft) => {
    if (!silent) drafts.push(d);
  };
  const isCustomer = role === "customer";
  const isExecutor = role === "executor";
  const contests = data.contests as ContestExt[];
  const contestById = new Map<number, ContestExt>(contests.map((c) => [c.id, c]));
  const hasWinner = (c: ContestExt) => !!c.winner || (c.awards?.length ?? 0) > 0;
  const mySubs = isExecutor ? data.submissions.filter((s) => s.executor_id === userId) : [];

  if (isExecutor) {
    const winsThisPoll = new Set<number>();
    const myContestIds = new Set(mySubs.map((s) => s.contest_id));
    for (const c of contests) {
      if (c.status !== "finished") continue;
      const isNew = !finished.has(c.id);
      finished.add(c.id);
      if (!isNew || !myContestIds.has(c.id)) continue;
      const mine = (c.awards ?? []).filter((a) => a.executor_id === userId);
      const wonAsWinner = mine.length === 0 && c.winner?.executor_id === userId;
      if (mine.length || wonAsWinner) {
        winsThisPoll.add(c.id);
        const best = mine.length ? mine.reduce((a, b) => (a.place <= b.place ? a : b)) : null;
        const place = best?.place ?? 1;
        const payout = best ? (best.net_amount ?? best.amount) : undefined;
        push({
          key: `win:${c.id}`,
          type: "win",
          title: place === 1 ? `Вы победили в конкурсе «${c.title}»!` : `Вы заняли ${place} место в «${c.title}»`,
          body: payout ? `Награда: ${rub(payout)}. Поздравляем!` : "Поздравляем с призовым местом!",
          link: `/contest/${c.number}`,
        });
      } else {
        push({
          key: `finished:${c.id}`,
          type: "finished",
          title: `Конкурс «${c.title}» завершён`,
          body: "Заказчик подвёл итоги — посмотрите результаты.",
          link: `/contest/${c.number}`,
        });
      }
    }

    for (const s of mySubs) {
      const old = snap.statuses[String(s.id)];
      if (old !== undefined && old !== s.status && !(s.status === 3 && winsThisPoll.has(s.contest_id))) {
        push({
          key: `status:${s.id}:${s.status}`,
          type: "status",
          title: "Статус решения изменён",
          body: `«${s.title}»: ${STATUS_LABELS[s.status] ?? `статус ${s.status}`}`,
          link: `/solution/${s.number}`,
        });
      }
      snap.statuses[String(s.id)] = s.status;
    }
  }

  if (isCustomer) {
    for (const s of data.submissions) {
      if (subs.has(s.id)) continue;
      subs.add(s.id);
      const c = contestById.get(s.contest_id);
      push({
        key: `sub:${s.id}`,
        type: "submission",
        title: `Новое решение в «${c?.title ?? s.contest_title ?? "конкурсе"}»`,
        body: `${s.executor_login ?? "Исполнитель"} отправил работу «${s.title}»`,
        link: `/solution/${s.number}`,
      });
    }
  }

  // Дедлайны зависят от времени, а не от изменений данных, поэтому создаются и на первом запуске (один раз на конкурс).
  // Дедлайны: свои конкурсы заказчика / конкурсы, куда исполнитель подал решение.
  const relevant = isCustomer
    ? contests.filter((c) => c.customer_id === userId)
    : isExecutor
      ? contests.filter((c) => mySubs.some((s) => s.contest_id === c.id))
      : [];
  for (const c of relevant) {
    if (c.status !== "active") continue;
    const h = hoursLeft(c.ends_at, now);
    if (h === null) continue;
    if (h > 0 && h <= DEADLINE_WINDOW_HOURS) {
      const key = `soon:${c.id}:${c.ends_at}`;
      if (fired.has(key)) continue;
      fired.add(key);
      const n = Math.max(1, Math.ceil(h));
      drafts.push({
        key,
        type: "deadline",
        title: `Конкурс «${c.title}» завершается через ${n} ч${isCustomer ? " — выберите победителя" : ""}`,
        body: isCustomer
          ? "Просмотрите присланные решения и выберите победителя."
          : "Успейте обновить решение до окончания приёма работ.",
        link: isCustomer ? `/contest/${c.number}/solutions` : `/contest/${c.number}`,
      });
    } else if (h <= 0 && isCustomer && !hasWinner(c)) {
      const key = `expired:${c.id}:${c.ends_at}`;
      if (fired.has(key)) continue;
      fired.add(key);
      drafts.push({
        key,
        type: "expired",
        title: `Срок приёма работ по «${c.title}» истёк`,
        body: "Победитель ещё не выбран — откройте решения и подведите итоги.",
        link: `/contest/${c.number}/solutions`,
      });
    }
  }

  snap.subs = [...subs];
  snap.finished = [...finished];
  snap.fired = [...fired].slice(-MAX_FIRED);
  return { drafts, snapshot: snap };
}

// ── Хранилище ────────────────────────────────────────────────────────────────

interface Stored {
  items: AppNotification[];
  snapshot: Snapshot | null;
}

const storageKey = (userId: number) => `notifications:${userId}`;

function isSnapshot(x: unknown): x is Snapshot {
  const s = x as Snapshot | null;
  return (
    !!s &&
    Array.isArray(s.subs) &&
    Array.isArray(s.finished) &&
    Array.isArray(s.fired) &&
    typeof s.statuses === "object" &&
    s.statuses !== null
  );
}

function isItem(x: unknown): x is AppNotification {
  const i = x as AppNotification | null;
  return !!i && typeof i.id === "string" && typeof i.title === "string" && typeof i.link === "string" && typeof i.createdAt === "number";
}

export function loadStored(userId: number): Stored {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { items: [], snapshot: null };
    const data = JSON.parse(raw) as { items?: unknown; snapshot?: unknown } | null;
    const list = Array.isArray(data?.items) ? (data.items as unknown[]) : [];
    const items = list.filter(isItem).map((i) => ({ ...i, body: i.body ?? "", read: !!i.read }));
    return { items: items.slice(0, MAX_ITEMS), snapshot: isSnapshot(data?.snapshot) ? data.snapshot : null };
  } catch {
    return { items: [], snapshot: null };
  }
}

const demoSeed = (now: number): AppNotification[] => [
  {
    id: "demo:win",
    type: "win",
    title: "Вы заняли 2 место в «Лендинг для IT-конференции»",
    body: "Награда: 45 000 ₽. Поздравляем!",
    link: "/",
    createdAt: now - 25 * 60000,
    read: false,
  },
  {
    id: "demo:sub",
    type: "submission",
    title: "Новое решение в «Личный кабинет для страхового брокера»",
    body: "kate_dev отправил работу «Кабинет на React 19 и TanStack Query»",
    link: "/solution/318",
    createdAt: now - 2 * 3600000,
    read: false,
  },
  {
    id: "demo:deadline",
    type: "deadline",
    title: "Конкурс «Мобильное приложение для сети пекарен» завершается через 20 ч",
    body: "Просмотрите присланные решения и выберите победителя.",
    link: "/",
    createdAt: now - 5 * 3600000,
    read: true,
  },
];

export default class NotificationStore {
  items: AppNotification[] = [];

  private userId: number | null = null;
  private role: string | null = null;
  private snapshot: Snapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeChat: (() => void) | null = null;
  private polling = false;
  private listening = false;

  constructor() {
    makeAutoObservable(
      this,
      {
        userId: false,
        role: false,
        snapshot: false,
        timer: false,
        unsubscribeChat: false,
        polling: false,
        listening: false,
      } as never,
      { autoBind: true },
    );
  }

  get unreadCount(): number {
    return this.items.filter((i) => !i.read).length;
  }

  // ── Жизненный цикл ─────────────────────────────────────────────────────────

  /** Запускается после входа: подгружает сохранённое, подписывается на чат, начинает опрос. */
  start(userId: number, role: string, chat?: ChatStore): void {
    if (this.userId === userId && this.role === role && this.timer) return;
    this.stop();
    this.userId = userId;
    this.role = role;
    const stored = loadStored(userId);
    this.items = stored.items;
    this.snapshot = stored.snapshot;
    if (DEMO && this.items.length === 0) {
      this.items = demoSeed(Date.now());
      this.persist();
    }
    if (chat) {
      this.unsubscribeChat = chat.onMessage((msg, info) => this.onChatMessage(msg, info));
    }
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", this.onFocus);
      this.listening = true;
    }
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribeChat?.();
    this.unsubscribeChat = null;
    if (this.listening && typeof window !== "undefined") window.removeEventListener("focus", this.onFocus);
    this.listening = false;
    this.userId = null;
    this.role = null;
    this.snapshot = null;
    this.items = [];
  }

  private onFocus(): void {
    void this.poll();
  }

  // ── Опрос ──────────────────────────────────────────────────────────────────

  async poll(): Promise<void> {
    const userId = this.userId;
    const role = this.role;
    if (userId === null || !role || this.polling) return;
    if (role !== "customer" && role !== "executor") return;
    this.polling = true;
    try {
      const data = await this.loadData(userId, role);
      if (this.userId !== userId) return;
      runInAction(() => this.applyPoll(data, role, userId));
    } catch {
      /* временная ошибка сети — попробуем в следующий раз */
    } finally {
      this.polling = false;
    }
  }

  private async loadData(userId: number, role: string): Promise<PollData> {
    const opts = { silent: true };
    if (role === "customer") {
      const res = await fetchData<{ items: Contest[] }>("/contests", { customer_id: userId, limit: 100 }, opts);
      const contests = res?.items ?? [];
      const active = contests.filter((c) => c.status === "active").slice(0, 30);
      const lists = await Promise.all(
        active.map((c) =>
          fetchData<Submission[]>("/submissions", { contest_id: c.id, limit: 100 }, opts).catch(() => [] as Submission[]),
        ),
      );
      return { contests, submissions: lists.flat() };
    }
    const subs = await fetchData<Submission[]>("/submissions", { executor_id: userId, limit: 100 }, opts);
    const mySubs = Array.isArray(subs) ? subs : [];
    if (mySubs.length === 0) return { contests: [], submissions: [] };
    const res = await fetchData<{ items: Contest[] }>("/contests", { limit: 100 }, opts);
    const byId = new Map((res?.items ?? []).map((c) => [c.id, c]));
    const missing = [...new Set(mySubs.map((s) => s.contest_id))].filter((id) => !byId.has(id)).slice(0, 20);
    const extra = await Promise.all(missing.map((id) => fetchData<Contest>(`/contests/${id}`, {}, opts).catch(() => null)));
    extra.forEach((c) => {
      if (c) byId.set(c.id, c);
    });
    return { contests: [...byId.values()], submissions: mySubs };
  }

  /** Применяет результат опроса (отдельно от сети — удобно тестировать). */
  applyPoll(data: PollData, role: string, userId: number, now: number = Date.now()): void {
    const { drafts, snapshot } = diffNotifications(role, userId, data, this.snapshot, now);
    this.snapshot = snapshot;
    drafts.forEach((d) => this.add(d, now));
    this.persist();
  }

  // ── Чат ────────────────────────────────────────────────────────────────────

  private onChatMessage(msg: ChatMessage, info: IncomingMessageInfo): void {
    if (info.viewing) return;
    const conv = info.conversation;
    const from = conv?.other_user_login ?? "собеседника";
    const text = msg.text.length > 100 ? `${msg.text.slice(0, 100)}…` : msg.text;
    this.add({
      key: `msg:${msg.id}`,
      type: "message",
      title: `Новое сообщение от ${from}`,
      body: conv?.contest_title ? `«${conv.contest_title}»: ${text}` : text,
      link: `/messages/${msg.conversation_id}`,
    });
  }

  // ── Действия ───────────────────────────────────────────────────────────────

  /** Добавляет уведомление (с дедупликацией по ключу) и показывает тост. */
  add(d: Draft, now: number = Date.now()): AppNotification | null {
    if (this.items.some((i) => i.id === d.key)) return null;
    const item: AppNotification = {
      id: d.key,
      type: d.type,
      title: d.title,
      body: d.body,
      link: d.link,
      createdAt: now,
      read: false,
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.persist();
    showToast({
      title: item.title,
      body: item.body,
      link: item.link,
      kind: item.type === "win" ? "success" : item.type === "deadline" || item.type === "expired" ? "warning" : "info",
    });
    return item;
  }

  markRead(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item && !item.read) {
      item.read = true;
      this.persist();
    }
  }

  markAllRead(): void {
    let changed = false;
    this.items.forEach((i) => {
      if (!i.read) {
        i.read = true;
        changed = true;
      }
    });
    if (changed) this.persist();
  }

  private persist(): void {
    if (this.userId === null) return;
    try {
      const payload: Stored = { items: this.items.map((i) => ({ ...i })), snapshot: this.snapshot };
      localStorage.setItem(storageKey(this.userId), JSON.stringify(payload));
    } catch {
      /* хранилище недоступно — работаем без сохранения */
    }
  }
}
