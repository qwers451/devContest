import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../services/apiService", () => ({
  fetchData: vi.fn(),
  sendData: vi.fn(),
  GATEWAY_URL: "http://gw.test:8080",
  CONTEST_API_URL: "http://localhost:8002",
}));

import * as api from "../services/apiService";
import ChatStore, {
  PING_INTERVAL_MS,
  TYPING_TIMEOUT_MS,
  CLOSE_UNAUTHORIZED,
} from "../store/ChatStore";
import {
  buildWsUrl,
  formatDateSeparator,
  formatListTime,
} from "../utils/chatUtils";
import type { ChatMessage, Conversation } from "../types";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  // — помощники теста —
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const ME = 1;
const OTHER = 2;

const conv = (id: number, over: Partial<Conversation> = {}): Conversation => ({
  id,
  contest_id: 10 + id,
  customer_id: ME,
  executor_id: OTHER,
  created_at: "2026-01-01T10:00:00Z",
  last_message_at: "2026-01-01T10:00:00Z",
  contest_title: `Конкурс ${id}`,
  contest_number: 100 + id,
  other_user_id: OTHER,
  other_user_login: "executor1",
  last_message: null,
  unread_count: 0,
  ...over,
});

const msg = (id: number, convId: number, sender: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: convId,
  sender_id: sender,
  text: `m${id}`,
  created_at: "2026-01-01T10:00:00Z",
  read_at: null,
  ...over,
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let store: ChatStore;
const lastSocket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

// Подключает стор: два диалога, сокет открыт.
async function connected(convs: Conversation[] = [conv(1), conv(2)]) {
  vi.mocked(api.fetchData).mockImplementation(async (url: string) => {
    if (url === "/chat/conversations") return convs.map((c) => ({ ...c })) as never;
    return [] as never;
  });
  store.connect(ME);
  lastSocket().open();
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("token", "jwt-token");
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(api.sendData).mockResolvedValue({} as never);
  store = new ChatStore();
});

afterEach(() => {
  store.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Подключение", () => {
  it("открывает один сокет на ws://…/ws/chat?token= и грузит диалоги", async () => {
    await connected();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(lastSocket().url).toBe("ws://gw.test:8080/ws/chat?token=jwt-token");
    expect(store.connection).toBe("open");
    expect(store.conversations).toHaveLength(2);
    expect(store.conversationsLoaded).toBe(true);
  });

  it("повторный connect для того же пользователя не плодит сокеты", async () => {
    await connected();
    store.connect(ME);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("шлёт ping каждые 25 секунд", async () => {
    await connected();
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    const pings = lastSocket().sent.filter((s) => JSON.parse(s).type === "ping");
    expect(pings).toHaveLength(2);
  });

  it("после обрыва создаёт новый сокет с нарастающей задержкой и перезагружает диалоги", async () => {
    await connected();
    const first = lastSocket();
    first.drop(1006);
    expect(store.connection).toBe("closed");
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // второй обрыв подряд (без успешного open) — задержка уже 2 c
    lastSocket().drop(1006);
    vi.advanceTimersByTime(1500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(600);
    expect(FakeWebSocket.instances).toHaveLength(3);

    vi.mocked(api.fetchData).mockClear();
    lastSocket().open();
    await flush();
    expect(api.fetchData).toHaveBeenCalledWith("/chat/conversations", {}, { silent: true });
    expect(store.connection).toBe("open");
  });

  it("код 4401 (невалидный токен) не вызывает переподключения", async () => {
    await connected();
    lastSocket().drop(CLOSE_UNAUTHORIZED);
    vi.advanceTimersByTime(120000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.connection).toBe("unauthorized");
  });

  it("disconnect закрывает сокет, не переподключается и очищает состояние", async () => {
    await connected();
    const ws = lastSocket();
    store.disconnect();
    expect(ws.readyState).toBe(3);
    vi.advanceTimersByTime(120000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.conversations).toEqual([]);
    expect(store.unreadTotal).toBe(0);
    expect(store.connection).toBe("idle");
  });

  it("без токена сокет не создаётся", () => {
    localStorage.removeItem("token");
    store.connect(ME);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe("Входящие сообщения", () => {
  it("в открытую беседу: добавляется, непрочитанные не растут, отправляется /read", async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations" ? ([conv(1), conv(2)] as never) : ([msg(1, 1, ME)] as never),
    );
    await store.openConversation(1);
    vi.mocked(api.sendData).mockClear();

    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(2, 1, OTHER, { text: "привет" }) });
    await flush();

    expect(store.getMessages(1).map((m) => m.id)).toEqual([1, 2]);
    expect(store.conversations.find((c) => c.id === 1)!.unread_count).toBe(0);
    expect(store.unreadTotal).toBe(0);
    expect(api.sendData).toHaveBeenCalledWith("/chat/conversations/1/read", {});
    expect(store.conversations.find((c) => c.id === 1)!.last_message?.text).toBe("привет");
  });

  it("дубликат того же сообщения не добавляется дважды", async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations" ? ([conv(1)] as never) : ([] as never),
    );
    await store.openConversation(1);
    const ev = { type: "message", conversation_id: 1, message: msg(5, 1, OTHER) };
    lastSocket().receive(ev);
    lastSocket().receive(ev);
    expect(store.getMessages(1)).toHaveLength(1);
  });

  it("в закрытую беседу: растёт unread и беседа поднимается наверх списка", async () => {
    await connected([conv(1), conv(2), conv(3)]);
    expect(store.conversations.map((c) => c.id)).toEqual([1, 2, 3]);

    lastSocket().receive({ type: "message", conversation_id: 3, message: msg(9, 3, OTHER) });
    lastSocket().receive({ type: "message", conversation_id: 3, message: msg(10, 3, OTHER) });

    expect(store.conversations.map((c) => c.id)).toEqual([3, 1, 2]);
    expect(store.conversations[0].unread_count).toBe(2);
    expect(store.unreadTotal).toBe(2);
  });

  it("сообщение от меня (с другой вкладки) не увеличивает unread", async () => {
    await connected();
    lastSocket().receive({ type: "message", conversation_id: 2, message: msg(7, 2, ME) });
    expect(store.unreadTotal).toBe(0);
    expect(store.conversations[0].id).toBe(2);
  });

  it("сообщение для неизвестной беседы перезагружает список диалогов", async () => {
    await connected([conv(1)]);
    vi.mocked(api.fetchData).mockClear();
    vi.mocked(api.fetchData).mockResolvedValue([conv(1), conv(5, { unread_count: 1 })] as never);
    lastSocket().receive({ type: "message", conversation_id: 5, message: msg(1, 5, OTHER) });
    await flush();
    expect(store.conversations.map((c) => c.id)).toEqual([1, 5]);
    expect(store.unreadTotal).toBe(1);
  });

  it("если вкладка скрыта, сообщение в открытой беседе остаётся непрочитанным", async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations" ? ([conv(1)] as never) : ([] as never),
    );
    await store.openConversation(1);
    vi.mocked(api.sendData).mockClear();
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(4, 1, OTHER) });
    spy.mockRestore();
    expect(store.unreadTotal).toBe(1);
    expect(api.sendData).not.toHaveBeenCalled();
  });

  it("unreadTotal — сумма по всем беседам", async () => {
    await connected([conv(1, { unread_count: 3 }), conv(2, { unread_count: 4 }), conv(3)]);
    expect(store.unreadTotal).toBe(7);
  });
});

describe("Прочтение и печать", () => {
  it("событие read помечает только мои непрочитанные сообщения", async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations"
        ? ([conv(1)] as never)
        : ([msg(1, 1, ME), msg(2, 1, OTHER), msg(3, 1, ME, { read_at: "2026-01-01T10:05:00Z" })] as never),
    );
    await store.openConversation(1);
    lastSocket().receive({ type: "read", conversation_id: 1, reader_id: OTHER });
    const [a, b, c] = store.getMessages(1);
    expect(a.read_at).toBeTruthy();
    expect(b.read_at).toBeNull();
    expect(c.read_at).toBe("2026-01-01T10:05:00Z");
  });

  it("read для другой беседы не трогает сообщения", async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations" ? ([conv(1), conv(2)] as never) : ([msg(1, 1, ME)] as never),
    );
    await store.openConversation(1);
    lastSocket().receive({ type: "read", conversation_id: 2, reader_id: OTHER });
    expect(store.getMessages(1)[0].read_at).toBeNull();
  });

  it("typing включает индикатор и сам гаснет по таймауту", async () => {
    await connected();
    lastSocket().receive({ type: "typing", conversation_id: 1, user_id: OTHER });
    expect(store.isTyping(1)).toBe(true);
    vi.advanceTimersByTime(TYPING_TIMEOUT_MS - 100);
    expect(store.isTyping(1)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(store.isTyping(1)).toBe(false);
  });

  it("повторный typing продлевает индикатор", async () => {
    await connected();
    lastSocket().receive({ type: "typing", conversation_id: 1 });
    vi.advanceTimersByTime(TYPING_TIMEOUT_MS - 500);
    lastSocket().receive({ type: "typing", conversation_id: 1 });
    vi.advanceTimersByTime(TYPING_TIMEOUT_MS - 500);
    expect(store.isTyping(1)).toBe(true);
  });

  it("пришедшее сообщение сбрасывает «печатает…»", async () => {
    await connected();
    lastSocket().receive({ type: "typing", conversation_id: 1 });
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(1, 1, OTHER) });
    expect(store.isTyping(1)).toBe(false);
  });

  it("sendTyping шлёт кадр в сокет, но не чаще чем раз в пару секунд", async () => {
    await connected();
    store.sendTyping(1);
    store.sendTyping(1);
    const typing = lastSocket().sent.filter((s) => JSON.parse(s).type === "typing");
    expect(typing).toHaveLength(1);
    expect(JSON.parse(typing[0])).toEqual({ type: "typing", conversation_id: 1 });
  });

  it("markRead сбрасывает счётчик и вызывает API только при непрочитанных", async () => {
    await connected([conv(1, { unread_count: 2 }), conv(2)]);
    await store.markRead(1);
    await store.markRead(2);
    expect(store.unreadTotal).toBe(0);
    expect(api.sendData).toHaveBeenCalledTimes(1);
    expect(api.sendData).toHaveBeenCalledWith("/chat/conversations/1/read", {});
  });
});

describe("Отправка сообщений", () => {
  beforeEach(async () => {
    await connected();
    vi.mocked(api.fetchData).mockImplementation(async (url: string) =>
      url === "/chat/conversations" ? ([conv(1), conv(2)] as never) : ([] as never),
    );
    await store.openConversation(1);
  });

  it("оптимистичное сообщение появляется сразу и заменяется серверным", async () => {
    let resolve!: (m: ChatMessage) => void;
    vi.mocked(api.sendData).mockReturnValueOnce(new Promise<ChatMessage>((r) => (resolve = r)) as never);

    const p = store.sendMessage(1, "  Привет  ");
    const [temp] = store.getMessages(1);
    expect(temp.status).toBe("sending");
    expect(temp.text).toBe("Привет");
    expect(temp.id).toBeLessThan(0);

    resolve(msg(42, 1, ME, { text: "Привет" }));
    await p;
    const list = store.getMessages(1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(42);
    expect(list[0].status).toBeUndefined();
    expect(api.sendData).toHaveBeenCalledWith("/chat/conversations/1/messages", { text: "Привет" });
    expect(store.conversations[0].last_message?.text).toBe("Привет");
  });

  it("если сообщение по WS пришло раньше ответа REST, дубль не создаётся", async () => {
    let resolve!: (m: ChatMessage) => void;
    vi.mocked(api.sendData).mockReturnValueOnce(new Promise<ChatMessage>((r) => (resolve = r)) as never);
    const p = store.sendMessage(1, "Привет");
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(42, 1, ME, { text: "Привет" }) });
    resolve(msg(42, 1, ME, { text: "Привет" }));
    await p;
    expect(store.getMessages(1).map((m) => m.id)).toEqual([42]);
  });

  it("WS раньше REST: оптимистичное сообщение заменяется сразу, дубля нет ни в какой момент", async () => {
    let resolve!: (m: ChatMessage) => void;
    vi.mocked(api.sendData).mockReturnValueOnce(new Promise<ChatMessage>((r) => (resolve = r)) as never);
    const p = store.sendMessage(1, "Привет");
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(42, 1, ME, { text: "Привет" }) });

    // REST ещё не ответил: в треде ровно одно сообщение, уже серверное
    expect(store.getMessages(1)).toHaveLength(1);
    expect(store.getMessages(1)[0].id).toBe(42);
    expect(store.getMessages(1)[0].status).toBeUndefined();
    expect(store.unreadTotal).toBe(0);

    resolve(msg(42, 1, ME, { text: "Привет" }));
    await p;
    expect(store.getMessages(1)).toHaveLength(1);
    expect(store.getMessages(1)[0].id).toBe(42);
    expect(store.getMessages(1)[0].status).toBeUndefined();
    expect(store.conversations[0].last_message?.id).toBe(42);
    expect(store.unreadTotal).toBe(0);
  });

  it("REST раньше WS: затем пришедшее по WS сообщение не дублируется", async () => {
    vi.mocked(api.sendData).mockResolvedValueOnce(msg(43, 1, ME, { text: "Эй" }) as never);
    await store.sendMessage(1, "Эй");
    expect(store.getMessages(1).map((m) => m.id)).toEqual([43]);
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(43, 1, ME, { text: "Эй" }) });
    expect(store.getMessages(1)).toHaveLength(1);
    expect(store.getMessages(1)[0].status).toBeUndefined();
    expect(store.unreadTotal).toBe(0);
  });

  it("WS-сообщение с другим текстом не подменяет чужое оптимистичное", async () => {
    vi.mocked(api.sendData).mockReturnValueOnce(new Promise(() => {}) as never);
    void store.sendMessage(1, "Первое");
    lastSocket().receive({ type: "message", conversation_id: 1, message: msg(50, 1, ME, { text: "Другое" }) });
    expect(store.getMessages(1)).toHaveLength(2);
  });

  it("пустое и состоящее из пробелов сообщение не отправляется", async () => {
    vi.mocked(api.sendData).mockClear();
    await store.sendMessage(1, "   \n ");
    expect(store.getMessages(1)).toHaveLength(0);
    expect(api.sendData).not.toHaveBeenCalled();
  });

  it("при ошибке сообщение помечается error, повтор отправляет его и убирает ошибку", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.sendData).mockRejectedValueOnce(new Error("network"));
    await store.sendMessage(1, "Не дошло");
    const [failed] = store.getMessages(1);
    expect(failed.status).toBe("error");

    vi.mocked(api.sendData).mockResolvedValueOnce(msg(50, 1, ME, { text: "Не дошло" }) as never);
    await store.retryMessage(1, failed.id);
    const list = store.getMessages(1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(50);
    expect(list[0].status).toBeUndefined();
  });

  it("повтор не работает для сообщения без ошибки", async () => {
    vi.mocked(api.sendData).mockResolvedValueOnce(msg(60, 1, ME) as never);
    await store.sendMessage(1, "ok");
    vi.mocked(api.sendData).mockClear();
    await store.retryMessage(1, 60);
    expect(api.sendData).not.toHaveBeenCalled();
  });
});

describe("История и открытие беседы", () => {
  it("loadOlder подгружает сообщения до самого раннего id и ставит их в начало", async () => {
    await connected([conv(1)]);
    const page = Array.from({ length: 50 }, (_, i) => msg(100 + i, 1, OTHER));
    vi.mocked(api.fetchData).mockImplementation(async (url: string, params?: Record<string, unknown>) => {
      if (url === "/chat/conversations") return [conv(1)] as never;
      if (params?.before_id) return [msg(98, 1, OTHER), msg(99, 1, OTHER)] as never;
      return page as never;
    });
    await store.openConversation(1);
    expect(store.hasMore[1]).toBe(true);

    const added = await store.loadOlder(1);
    expect(added).toBe(2);
    expect(store.getMessages(1)[0].id).toBe(98);
    expect(store.getMessages(1)).toHaveLength(52);
    expect(store.hasMore[1]).toBe(false);
    expect(vi.mocked(api.fetchData)).toHaveBeenCalledWith(
      "/chat/conversations/1/messages",
      { limit: 50, before_id: 100 },
      { silent: true },
    );
    expect(await store.loadOlder(1)).toBe(0);
  });

  it("openWith создаёт беседу и добавляет её в начало списка", async () => {
    await connected([conv(1)]);
    vi.mocked(api.sendData).mockResolvedValueOnce(conv(7) as never);
    const c = await store.openWith(17, 2);
    expect(c.id).toBe(7);
    expect(api.sendData).toHaveBeenCalledWith("/chat/conversations", { contest_id: 17, executor_id: 2 });
    expect(store.conversations[0].id).toBe(7);
  });

  it("openWith без executor_id (исполнитель) шлёт только contest_id и не дублирует беседу", async () => {
    await connected([conv(1)]);
    vi.mocked(api.sendData).mockResolvedValueOnce(conv(1) as never);
    await store.openWith(11);
    expect(api.sendData).toHaveBeenCalledWith("/chat/conversations", { contest_id: 11 });
    expect(store.conversations).toHaveLength(1);
  });
});

describe("Хелперы дат и URL", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);

  it("«Сегодня» / «Вчера» / dd.mm.yyyy", () => {
    expect(formatDateSeparator(new Date(2026, 5, 15, 0, 5).toISOString(), now)).toBe("Сегодня");
    expect(formatDateSeparator(new Date(2026, 5, 14, 23, 59).toISOString(), now)).toBe("Вчера");
    expect(formatDateSeparator(new Date(2026, 5, 13, 10, 0).toISOString(), now)).toBe("13.06.2026");
    expect(formatDateSeparator(new Date(2025, 0, 3, 10, 0).toISOString(), now)).toBe("03.01.2025");
  });

  it("«Вчера» работает на границе месяца", () => {
    const first = new Date(2026, 6, 1, 9, 0);
    expect(formatDateSeparator(new Date(2026, 5, 30, 22, 0).toISOString(), first)).toBe("Вчера");
  });

  it("в списке диалогов сегодняшнее сообщение показывается временем", () => {
    expect(formatListTime(new Date(2026, 5, 15, 9, 7).toISOString(), now)).toBe("09:07");
    expect(formatListTime(new Date(2026, 5, 14, 9, 7).toISOString(), now)).toBe("Вчера");
  });

  it("buildWsUrl: http→ws, https→wss, токен кодируется", () => {
    expect(buildWsUrl("http://localhost:8080", "a.b")).toBe("ws://localhost:8080/ws/chat?token=a.b");
    expect(buildWsUrl("https://api.example.com/", "t")).toBe("wss://api.example.com/ws/chat?token=t");
    expect(buildWsUrl("", "x y", "https://site.test")).toBe("wss://site.test/ws/chat?token=x%20y");
  });
});
