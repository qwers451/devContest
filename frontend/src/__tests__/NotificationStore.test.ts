import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../services/apiService", () => ({
  fetchData: vi.fn(),
  sendData: vi.fn(),
  GATEWAY_URL: "http://gw.test:8080",
  CONTEST_API_URL: "http://localhost:8002",
}));

import * as api from "../services/apiService";
import NotificationStore, {
  diffNotifications,
  loadStored,
  MAX_ITEMS,
  POLL_INTERVAL_MS,
  type PollData,
  type Snapshot,
} from "../store/NotificationStore";
import ChatStore from "../store/ChatStore";
import { subscribeToasts } from "../utils/toast";
import { formatRelativeTime } from "../utils/notificationUtils";
import type { ChatMessage, Contest, Conversation, Submission } from "../types";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const H = 3600000;
const CUSTOMER = 1;
const EXECUTOR = 2;

const contest = (over: Record<string, unknown> = {}): Contest =>
  ({
    id: 10,
    number: 1042,
    title: "Лендинг",
    prizepool: 1000,
    ends_at: new Date(NOW + 72 * H).toISOString(),
    status: "active",
    customer_id: CUSTOMER,
    stages: [],
    created_at: "",
    updated_at: "",
    awards: [],
    winner: null,
    ...over,
  }) as unknown as Contest;

const sub = (over: Partial<Submission> = {}): Submission => ({
  id: 100,
  number: 318,
  contest_id: 10,
  executor_id: EXECUTOR,
  title: "Моё решение",
  status: 1,
  files: [],
  created_at: "",
  updated_at: "",
  executor_login: "kate_dev",
  ...over,
});

const data = (contests: Contest[], submissions: Submission[]): PollData => ({ contests, submissions });

/** Первый запуск + последующий опрос; возвращает уведомления второго шага. */
function second(role: string, uid: number, first: PollData, next: PollData, now = NOW) {
  const a = diffNotifications(role, uid, first, null, now);
  return { first: a, next: diffNotifications(role, uid, next, a.snapshot, now) };
}

describe("diffNotifications — заказчик", () => {
  it("первый запуск молчит, даже если решения уже есть", () => {
    const r = diffNotifications("customer", CUSTOMER, data([contest()], [sub(), sub({ id: 101, number: 319 })]), null, NOW);
    expect(r.drafts).toEqual([]);
    expect(r.snapshot.subs).toEqual([100, 101]);
  });

  it("новое решение на моём конкурсе даёт ровно одно уведомление", () => {
    const { next } = second("customer", CUSTOMER, data([contest()], [sub()]), data([contest()], [sub(), sub({ id: 101, number: 319, title: "Другое" })]));
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].type).toBe("submission");
    expect(next.drafts[0].title).toContain("Лендинг");
    expect(next.drafts[0].body).toContain("kate_dev");
    expect(next.drafts[0].link).toBe("/solution/319");
  });

  it("те же данные при повторном опросе не создают дубликатов", () => {
    const d1 = data([contest()], [sub()]);
    const d2 = data([contest()], [sub(), sub({ id: 101, number: 319 })]);
    const a = diffNotifications("customer", CUSTOMER, d1, null, NOW);
    const b = diffNotifications("customer", CUSTOMER, d2, a.snapshot, NOW);
    const c = diffNotifications("customer", CUSTOMER, d2, b.snapshot, NOW);
    expect(b.drafts).toHaveLength(1);
    expect(c.drafts).toHaveLength(0);
  });

  it("дедлайн в ближайшие 24 ч срабатывает один раз, а не при каждом опросе", () => {
    const soon = contest({ ends_at: new Date(NOW + 5 * H + 1000).toISOString() });
    const a = diffNotifications("customer", CUSTOMER, data([contest()], []), null, NOW);
    const b = diffNotifications("customer", CUSTOMER, data([soon], []), a.snapshot, NOW);
    const c = diffNotifications("customer", CUSTOMER, data([soon], []), b.snapshot, NOW + 30000);
    expect(b.drafts).toHaveLength(1);
    expect(b.drafts[0].type).toBe("deadline");
    expect(b.drafts[0].title).toContain("через 6 ч");
    expect(b.drafts[0].title).toContain("выберите победителя");
    expect(c.drafts).toHaveLength(0);
  });

  it("первый запуск: дедлайн через 10 ч уведомляет один раз, существующие решения — молча", () => {
    const soon = contest({ ends_at: new Date(NOW + 10 * H).toISOString() });
    const d = data([soon], [sub(), sub({ id: 101, number: 319 })]);
    const a = diffNotifications("customer", CUSTOMER, d, null, NOW);
    expect(a.drafts.map((x) => x.type)).toEqual(["deadline"]);
    const b = diffNotifications("customer", CUSTOMER, d, a.snapshot, NOW + 30000);
    expect(b.drafts).toHaveLength(0);
  });

  it("первый запуск: просроченный конкурс без победителя уведомляет один раз", () => {
    const past = contest({ ends_at: new Date(NOW - H).toISOString() });
    const a = diffNotifications("customer", CUSTOMER, data([past], []), null, NOW);
    expect(a.drafts.map((x) => x.type)).toEqual(["expired"]);
    expect(diffNotifications("customer", CUSTOMER, data([past], []), a.snapshot, NOW).drafts).toHaveLength(0);
  });

  it("дедлайн дальше 24 ч не уведомляет", () => {
    const far = contest({ ends_at: new Date(NOW + 30 * H).toISOString() });
    const { next } = second("customer", CUSTOMER, data([far], []), data([far], []));
    expect(next.drafts).toHaveLength(0);
  });

  it("срок истёк и победителя нет — «Срок приёма работ истёк», один раз", () => {
    const past = contest({ ends_at: new Date(NOW - H).toISOString() });
    const a = diffNotifications("customer", CUSTOMER, data([contest()], []), null, NOW);
    const b = diffNotifications("customer", CUSTOMER, data([past], []), a.snapshot, NOW);
    const c = diffNotifications("customer", CUSTOMER, data([past], []), b.snapshot, NOW + 1000);
    expect(b.drafts.map((d) => d.type)).toEqual(["expired"]);
    expect(b.drafts[0].title).toBe("Срок приёма работ по «Лендинг» истёк");
    expect(c.drafts).toHaveLength(0);
  });

  it("срок истёк, но победитель выбран или конкурс завершён — молчим", () => {
    const withWinner = contest({ ends_at: new Date(NOW - H).toISOString(), winner: { submission_id: 100, executor_id: EXECUTOR } });
    const finished = contest({ ends_at: new Date(NOW - H).toISOString(), status: "finished" });
    const snap: Snapshot = { subs: [], statuses: {}, finished: [], fired: [] };
    expect(diffNotifications("customer", CUSTOMER, data([withWinner], []), snap, NOW).drafts).toHaveLength(0);
    expect(diffNotifications("customer", CUSTOMER, data([finished], []), snap, NOW).drafts).toHaveLength(0);
  });

  it("чужие конкурсы заказчика не затрагивают", () => {
    const foreign = contest({ customer_id: 99, ends_at: new Date(NOW + 3 * H).toISOString() });
    const snap: Snapshot = { subs: [], statuses: {}, finished: [], fired: [] };
    expect(diffNotifications("customer", CUSTOMER, data([foreign], []), snap, NOW).drafts).toHaveLength(0);
  });
});

describe("diffNotifications — исполнитель", () => {
  it("смена статуса даёт уведомление с человеческим названием статуса", () => {
    const { next } = second("executor", EXECUTOR, data([contest()], [sub({ status: 1 })]), data([contest()], [sub({ status: 4 })]));
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].type).toBe("status");
    expect(next.drafts[0].body).toBe("«Моё решение»: Необходимы правки");
    expect(next.drafts[0].link).toBe("/solution/318");
  });

  it("тот же статус при повторном опросе — тишина; первый запуск — тишина", () => {
    const d = data([contest()], [sub({ status: 2 })]);
    const a = diffNotifications("executor", EXECUTOR, d, null, NOW);
    const b = diffNotifications("executor", EXECUTOR, d, a.snapshot, NOW);
    expect(a.drafts).toHaveLength(0);
    expect(b.drafts).toHaveLength(0);
  });

  it("моё новое решение само по себе не считается сменой статуса", () => {
    const a = diffNotifications("executor", EXECUTOR, data([contest()], []), null, NOW);
    const b = diffNotifications("executor", EXECUTOR, data([contest()], [sub()]), a.snapshot, NOW);
    expect(b.drafts).toHaveLength(0);
  });

  it("победа: место 1 в awards — «Вы победили», статус «Победитель» не дублируется", () => {
    const before = data([contest()], [sub({ status: 2 })]);
    const after = data(
      [contest({ status: "finished", awards: [{ place: 1, submission_id: 100, executor_id: EXECUTOR, amount: 1000, net_amount: 900 }] })],
      [sub({ status: 3 })],
    );
    const { next } = second("executor", EXECUTOR, before, after);
    expect(next.drafts.map((d) => d.type)).toEqual(["win"]);
    expect(next.drafts[0].title).toBe("Вы победили в конкурсе «Лендинг»!");
    expect(next.drafts[0].body).toContain("900");
    expect(next.drafts[0].link).toBe("/contest/1042");
  });

  it("призовое место ниже первого — «Вы заняли N место»", () => {
    const before = data([contest()], [sub({ status: 2 })]);
    const after = data(
      [
        contest({
          status: "finished",
          awards: [
            { place: 1, submission_id: 555, executor_id: 77, amount: 600 },
            { place: 2, submission_id: 100, executor_id: EXECUTOR, amount: 400, net_amount: 360 },
          ],
        }),
      ],
      [sub({ status: 2 })],
    );
    const { next } = second("executor", EXECUTOR, before, after);
    expect(next.drafts).toHaveLength(1);
    expect(next.drafts[0].type).toBe("win");
    expect(next.drafts[0].title).toBe("Вы заняли 2 место в «Лендинг»");
  });

  it("победитель определяется и по полю winner, если awards пусты", () => {
    const before = data([contest()], [sub()]);
    const after = data([contest({ status: "finished", winner: { submission_id: 100, executor_id: EXECUTOR } })], [sub()]);
    expect(second("executor", EXECUTOR, before, after).next.drafts[0].type).toBe("win");
  });

  it("конкурс завершён, а я не призёр — «Конкурс завершён», один раз", () => {
    const before = data([contest()], [sub()]);
    const after = data([contest({ status: "finished", awards: [{ place: 1, submission_id: 555, executor_id: 77, amount: 1000 }] })], [sub()]);
    const a = diffNotifications("executor", EXECUTOR, before, null, NOW);
    const b = diffNotifications("executor", EXECUTOR, after, a.snapshot, NOW);
    const c = diffNotifications("executor", EXECUTOR, after, b.snapshot, NOW);
    expect(b.drafts.map((d) => d.type)).toEqual(["finished"]);
    expect(c.drafts).toHaveLength(0);
  });

  it("конкурс, который уже был завершён на первом запуске, не порождает уведомлений", () => {
    const fin = data([contest({ status: "finished", awards: [{ place: 1, submission_id: 100, executor_id: EXECUTOR, amount: 1 }] })], [sub({ status: 3 })]);
    const { first, next } = second("executor", EXECUTOR, fin, fin);
    expect(first.drafts).toHaveLength(0);
    expect(next.drafts).toHaveLength(0);
  });

  it("дедлайн конкурса, куда я подал решение: один раз, и только для моих конкурсов", () => {
    const soon = contest({ ends_at: new Date(NOW + 10 * H).toISOString() });
    const other = contest({ id: 11, number: 1, ends_at: new Date(NOW + 2 * H).toISOString() });
    const d = data([soon, other], [sub()]);
    const a = diffNotifications("executor", EXECUTOR, data([contest(), other], [sub()]), null, NOW);
    const b = diffNotifications("executor", EXECUTOR, d, a.snapshot, NOW);
    const c = diffNotifications("executor", EXECUTOR, d, b.snapshot, NOW);
    expect(b.drafts).toHaveLength(1);
    expect(b.drafts[0].title).toContain("завершается через 10 ч");
    expect(b.drafts[0].title).not.toContain("выберите победителя");
    expect(c.drafts).toHaveLength(0);
  });
});

// ── Стор ────────────────────────────────────────────────────────────────────

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 7,
  contest_id: 10,
  customer_id: CUSTOMER,
  executor_id: EXECUTOR,
  created_at: "",
  last_message_at: null,
  contest_title: "Лендинг",
  contest_number: 1042,
  other_user_id: 5,
  other_user_login: "kate_dev",
  last_message: null,
  unread_count: 0,
  ...over,
});

const chatMsg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 1,
  conversation_id: 7,
  sender_id: 5,
  text: "Привет!",
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
});

describe("NotificationStore", () => {
  let store: NotificationStore;
  let toasts: string[];
  let unsub: () => void;

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.fetchData).mockReset();
    store = new NotificationStore();
    toasts = [];
    unsub = subscribeToasts((t) => toasts.push(t.title));
  });
  afterEach(() => {
    store.stop();
    unsub();
    vi.useRealTimers();
  });

  const start = (uid = CUSTOMER, role = "customer") => {
    const chat = new ChatStore();
    store.start(uid, role, chat);
    return chat;
  };

  it("опрашивает API раз в 30 с и добавляет уведомление о новом решении, показывая тост", async () => {
    vi.useFakeTimers();
    let submissions: Submission[] = [sub()];
    vi.mocked(api.fetchData).mockImplementation(async (url: string) => {
      if (url === "/contests") return { items: [contest({ ends_at: new Date(Date.now() + 90 * 24 * H).toISOString() })] };
      if (url === "/submissions") return submissions;
      return [];
    });
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.items).toHaveLength(0); // первый запуск — молча
    submissions = [sub(), sub({ id: 101, number: 319 })];
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(store.items).toHaveLength(1);
    expect(store.unreadCount).toBe(1);
    expect(toasts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(store.items).toHaveLength(1);
    expect(toasts).toHaveLength(1);
  });

  it("ошибка сети при опросе не ломает стор", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("network"));
    start();
    await expect(store.poll()).resolves.toBeUndefined();
    expect(store.items).toHaveLength(0);
  });

  it("сообщение чата создаёт уведомление со ссылкой на беседу", () => {
    vi.mocked(api.fetchData).mockResolvedValue({ items: [] });
    const chat = start();
    chat.conversations = [conv()];
    chat.handleEvent({ type: "message", conversation_id: 7, message: chatMsg() });
    expect(store.items).toHaveLength(1);
    expect(store.items[0].type).toBe("message");
    expect(store.items[0].title).toBe("Новое сообщение от kate_dev");
    expect(store.items[0].link).toBe("/messages/7");
    // то же сообщение дважды не дублируется
    chat.handleEvent({ type: "message", conversation_id: 7, message: chatMsg() });
    expect(store.items).toHaveLength(1);
  });

  it("сообщение не уведомляет, если эта беседа сейчас открыта", () => {
    vi.mocked(api.fetchData).mockResolvedValue({ items: [] });
    const chat = start();
    chat.conversations = [conv()];
    chat.activeConversationId = 7;
    chat.handleEvent({ type: "message", conversation_id: 7, message: chatMsg() });
    expect(store.items).toHaveLength(0);
    // а в другой беседе — уведомляет
    chat.conversations.push(conv({ id: 8 }));
    chat.handleEvent({ type: "message", conversation_id: 8, message: chatMsg({ id: 2, conversation_id: 8 }) });
    expect(store.items).toHaveLength(1);
  });

  it("собственные сообщения не создают уведомлений", () => {
    vi.mocked(api.fetchData).mockResolvedValue({ items: [] });
    const chat = start(CUSTOMER);
    chat.connect(CUSTOMER); // запоминает userId; токена нет — сокет не открывается
    chat.conversations = [conv()];
    chat.handleEvent({ type: "message", conversation_id: 7, message: chatMsg({ sender_id: CUSTOMER }) });
    expect(store.items).toHaveLength(0);
  });

  it("markRead / markAllRead / unreadCount", () => {
    start();
    store.add({ key: "a", type: "status", title: "A", body: "", link: "/a" });
    store.add({ key: "b", type: "status", title: "B", body: "", link: "/b" });
    store.add({ key: "c", type: "status", title: "C", body: "", link: "/c" });
    expect(store.unreadCount).toBe(3);
    store.markRead("b");
    expect(store.unreadCount).toBe(2);
    store.markRead("b");
    expect(store.unreadCount).toBe(2);
    store.markAllRead();
    expect(store.unreadCount).toBe(0);
    expect(store.items).toHaveLength(3);
  });

  it("хранит не больше 50 уведомлений, новые сверху", () => {
    start();
    for (let i = 0; i < MAX_ITEMS + 10; i++) store.add({ key: `k${i}`, type: "status", title: `T${i}`, body: "", link: "/" });
    expect(store.items).toHaveLength(MAX_ITEMS);
    expect(store.items[0].title).toBe(`T${MAX_ITEMS + 9}`);
  });

  it("сохраняется и восстанавливается между сессиями, отдельно для каждого пользователя", () => {
    start(CUSTOMER);
    store.add({ key: "a", type: "win", title: "Победа", body: "x", link: "/c" });
    store.markRead("a");
    store.add({ key: "b", type: "status", title: "Статус", body: "", link: "/s" });
    store.stop();

    const again = new NotificationStore();
    again.start(CUSTOMER, "customer", new ChatStore());
    expect(again.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(again.items.find((i) => i.id === "a")?.read).toBe(true);
    expect(again.unreadCount).toBe(1);
    again.stop();

    const other = new NotificationStore();
    other.start(999, "customer", new ChatStore());
    expect(other.items).toHaveLength(0);
    other.stop();
  });

  it("снимок сохраняется: после перезапуска старые данные не порождают уведомлений", async () => {
    const submissions = [sub()];
    vi.mocked(api.fetchData).mockImplementation(async (url: string) => (url === "/contests" ? { items: [contest({ ends_at: new Date(Date.now() + 90 * 24 * H).toISOString() })] } : submissions));
    start();
    await store.poll();
    store.stop();
    const again = new NotificationStore();
    again.start(CUSTOMER, "customer", new ChatStore());
    await again.poll();
    expect(again.items).toHaveLength(0);
    again.stop();
  });

  it("битый localStorage не роняет приложение", () => {
    localStorage.setItem(`notifications:${CUSTOMER}`, "{not json");
    expect(loadStored(CUSTOMER)).toEqual({ items: [], snapshot: null });
    expect(() => start()).not.toThrow();
    expect(store.items).toEqual([]);
    store.stop();

    localStorage.setItem(`notifications:${CUSTOMER}`, JSON.stringify({ items: [{ junk: 1 }, null, 5], snapshot: "oops" }));
    expect(loadStored(CUSTOMER)).toEqual({ items: [], snapshot: null });
    localStorage.setItem(`notifications:${CUSTOMER}`, "null");
    expect(loadStored(CUSTOMER)).toEqual({ items: [], snapshot: null });
  });

  it("недоступный localStorage (ошибка записи) не мешает работе", () => {
    start();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => store.add({ key: "q", type: "status", title: "Q", body: "", link: "/" })).not.toThrow();
    expect(store.items).toHaveLength(1);
    spy.mockRestore();
  });

  it("stop очищает состояние и отписывается от чата", () => {
    vi.mocked(api.fetchData).mockResolvedValue({ items: [] });
    const chat = start();
    chat.conversations = [conv()];
    store.stop();
    chat.handleEvent({ type: "message", conversation_id: 7, message: chatMsg() });
    expect(store.items).toHaveLength(0);
  });
});

describe("formatRelativeTime", () => {
  it("человеческие интервалы", () => {
    expect(formatRelativeTime(NOW - 10000, NOW)).toBe("только что");
    expect(formatRelativeTime(NOW - 5 * 60000, NOW)).toBe("5 мин назад");
    expect(formatRelativeTime(NOW - 3 * H, NOW)).toBe("3 ч назад");
    expect(formatRelativeTime(NOW - 49 * H, NOW)).toBe("2 дн назад");
  });
});
