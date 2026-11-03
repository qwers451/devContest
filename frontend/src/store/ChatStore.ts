import { makeAutoObservable, runInAction } from "mobx";
import { fetchData, sendData, GATEWAY_URL, CONTEST_API_URL } from "../services/apiService";
import { DEMO } from "../services/demoData";
import { buildWsUrl } from "../utils/chatUtils";
import type { ChatMessage, Conversation } from "../types";

export const PAGE_SIZE = 50;
export const PING_INTERVAL_MS = 25000;
export const TYPING_TIMEOUT_MS = 4000;
export const TYPING_SEND_THROTTLE_MS = 2500;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
export const CLOSE_UNAUTHORIZED = 4401;

export type ChatConnection = "idle" | "connecting" | "open" | "closed" | "unauthorized";

interface ChatEvent {
  type: string;
  conversation_id?: number;
  message?: ChatMessage;
  reader_id?: number;
  user_id?: number;
}

const DEMO_REPLIES = [
  "Спасибо, посмотрю и отвечу в ближайшее время.",
  "Принято! Давайте уточним детали по ТЗ.",
  "Хорошо, договорились.",
];

export default class ChatStore {
  conversations: Conversation[] = [];
  messages: Record<number, ChatMessage[]> = {};
  hasMore: Record<number, boolean> = {};
  typing: Record<number, boolean> = {};
  loadingMessages: Record<number, boolean> = {};
  activeConversationId: number | null = null;
  conversationsLoaded = false;
  connection: ChatConnection = "idle";

  private socket: WebSocket | null = null;
  private userId: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private typingTimers: Record<number, ReturnType<typeof setTimeout>> = {};
  private lastTypingSent = 0;
  private attempts = 0;
  private manualClose = false;
  private tempSeq = 0;
  private demoReplyIdx = 0;

  constructor() {
    makeAutoObservable(
      this,
      {
        socket: false,
        pingTimer: false,
        reconnectTimer: false,
        typingTimers: false,
      } as never,
      { autoBind: true },
    );
  }

  // ── Производные значения ───────────────────────────────────────────────────

  get unreadTotal(): number {
    return this.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  }

  get activeConversation(): Conversation | null {
    return this.conversations.find((c) => c.id === this.activeConversationId) ?? null;
  }

  getMessages(conversationId: number): ChatMessage[] {
    return this.messages[conversationId] ?? [];
  }

  isTyping(conversationId: number): boolean {
    return !!this.typing[conversationId];
  }

  // ── Подключение ────────────────────────────────────────────────────────────

  /** Открывает единственный WebSocket пользователя (в демо-режиме — только загрузка диалогов). */
  connect(userId: number): void {
    if (this.userId === userId && (this.socket || this.connection === "open")) return;
    this.disconnect();
    this.userId = userId;
    this.manualClose = false;
    if (DEMO) {
      this.connection = "open";
      void this.fetchConversations();
      return;
    }
    this.openSocket();
  }

  /** Закрывает сокет и сбрасывает всё состояние (выход из аккаунта). */
  disconnect(): void {
    this.manualClose = true;
    this.clearTimers();
    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* уже закрыт */
      }
    }
    Object.values(this.typingTimers).forEach(clearTimeout);
    this.typingTimers = {};
    this.attempts = 0;
    this.userId = null;
    this.conversations = [];
    this.messages = {};
    this.hasMore = {};
    this.typing = {};
    this.loadingMessages = {};
    this.activeConversationId = null;
    this.conversationsLoaded = false;
    this.connection = "idle";
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  private openSocket(): void {
    const token = localStorage.getItem("token");
    if (!token) return;
    this.connection = "connecting";
    const url = buildWsUrl(GATEWAY_URL || CONTEST_API_URL || "", token);
    const ws = new WebSocket(url);
    this.socket = ws;

    ws.onopen = () => {
      if (this.socket !== ws) return;
      runInAction(() => {
        this.connection = "open";
      });
      this.attempts = 0;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
      // После (пере)подключения подтягиваем то, что могли пропустить.
      void this.fetchConversations();
      const active = this.activeConversationId;
      if (active !== null && this.messages[active]) void this.refreshMessages(active);
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.socket !== ws) return;
      try {
        this.handleEvent(JSON.parse(String(ev.data)) as ChatEvent);
      } catch {
        /* невалидный кадр */
      }
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.manualClose) return;
      if (ev.code === CLOSE_UNAUTHORIZED) {
        runInAction(() => {
          this.connection = "unauthorized";
        });
        return;
      }
      runInAction(() => {
        this.connection = "closed";
      });
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* за ошибкой всегда следует close — переподключаемся там */
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) this.openSocket();
    }, delay);
  }

  // ── Входящие события ───────────────────────────────────────────────────────

  handleEvent(ev: ChatEvent): void {
    switch (ev.type) {
      case "message":
        if (ev.message) this.onIncomingMessage(ev.message);
        break;
      case "read":
        if (ev.conversation_id !== undefined) this.onRead(ev.conversation_id);
        break;
      case "typing":
        if (ev.conversation_id !== undefined) this.onTyping(ev.conversation_id);
        break;
      default:
        break;
    }
  }

  private isTabVisible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  private onIncomingMessage(msg: ChatMessage): void {
    const convId = msg.conversation_id;
    const mine = msg.sender_id === this.userId;
    const conv = this.conversations.find((c) => c.id === convId);

    if (!conv) {
      // Новая беседа, которой у нас ещё нет.
      void this.fetchConversations();
      return;
    }

    const list = this.messages[convId];
    if (list && !list.some((m) => m.id === msg.id)) {
      // Своё сообщение пришло по WS раньше ответа REST — заменяем оптимистичное, а не дублируем.
      const pendingIdx = mine
        ? list.findIndex((m) => m.status === "sending" && m.text === msg.text)
        : -1;
      if (pendingIdx >= 0) list[pendingIdx] = msg;
      else list.push(msg);
    }

    conv.last_message = {
      id: msg.id,
      sender_id: msg.sender_id,
      text: msg.text.slice(0, 120),
      created_at: msg.created_at,
    };
    conv.last_message_at = msg.created_at;

    if (!mine) {
      this.clearTyping(convId);
      const isOpen = this.activeConversationId === convId;
      if (isOpen && this.isTabVisible()) {
        // Беседа открыта и видна — сразу отмечаем прочитанной, бейдж не растёт.
        void this.postRead(convId);
      } else {
        conv.unread_count += 1;
      }
    }

    // Беседа с новым сообщением поднимается наверх списка.
    const idx = this.conversations.findIndex((c) => c.id === convId);
    if (idx > 0) {
      const [moved] = this.conversations.splice(idx, 1);
      this.conversations.unshift(moved);
    }
  }

  private onRead(convId: number): void {
    const stamp = new Date().toISOString();
    (this.messages[convId] ?? []).forEach((m) => {
      if (m.sender_id === this.userId && !m.read_at && !m.status) m.read_at = stamp;
    });
  }

  private onTyping(convId: number): void {
    this.typing[convId] = true;
    if (this.typingTimers[convId]) clearTimeout(this.typingTimers[convId]);
    this.typingTimers[convId] = setTimeout(() => this.clearTyping(convId), TYPING_TIMEOUT_MS);
  }

  private clearTyping(convId: number): void {
    if (this.typingTimers[convId]) clearTimeout(this.typingTimers[convId]);
    delete this.typingTimers[convId];
    this.typing[convId] = false;
  }

  /** Сообщает собеседнику, что мы печатаем (не чаще раза в пару секунд). */
  sendTyping(convId: number): void {
    const ws = this.socket;
    const t = Date.now();
    if (!ws || ws.readyState !== 1 || t - this.lastTypingSent < TYPING_SEND_THROTTLE_MS) return;
    this.lastTypingSent = t;
    ws.send(JSON.stringify({ type: "typing", conversation_id: convId }));
  }

  // ── REST ───────────────────────────────────────────────────────────────────

  async fetchConversations(): Promise<void> {
    try {
      const list = await fetchData<Conversation[]>("/chat/conversations", {}, { silent: true });
      runInAction(() => {
        this.conversations = list;
        this.conversationsLoaded = true;
      });
      // Открытая беседа уже на экране — сразу отмечаем её прочитанной.
      const active = this.activeConversationId;
      if (active !== null && this.isTabVisible()) void this.markRead(active);
    } catch (e) {
      console.error("Ошибка загрузки диалогов:", e);
      runInAction(() => {
        this.conversationsLoaded = true;
      });
    }
  }

  async loadMessages(convId: number): Promise<void> {
    if (this.loadingMessages[convId]) return;
    this.loadingMessages[convId] = true;
    try {
      const list = await fetchData<ChatMessage[]>(
        `/chat/conversations/${convId}/messages`,
        { limit: PAGE_SIZE },
        { silent: true },
      );
      runInAction(() => {
        const pending = (this.messages[convId] ?? []).filter((m) => m.status);
        this.messages[convId] = [...list, ...pending];
        this.hasMore[convId] = list.length >= PAGE_SIZE;
      });
    } catch (e) {
      console.error("Ошибка загрузки сообщений:", e);
    } finally {
      runInAction(() => {
        this.loadingMessages[convId] = false;
      });
    }
  }

  /** Подтягивает свежие сообщения после переподключения. */
  private async refreshMessages(convId: number): Promise<void> {
    try {
      const list = await fetchData<ChatMessage[]>(
        `/chat/conversations/${convId}/messages`,
        { limit: PAGE_SIZE },
        { silent: true },
      );
      runInAction(() => {
        const current = this.messages[convId] ?? [];
        const known = new Set(current.map((m) => m.id));
        const fresh = list.filter((m) => !known.has(m.id));
        const byId = new Map(list.map((m) => [m.id, m]));
        current.forEach((m) => {
          const s = byId.get(m.id);
          if (s) m.read_at = s.read_at;
        });
        if (fresh.length) {
          const pending = current.filter((m) => m.status);
          this.messages[convId] = [...current.filter((m) => !m.status), ...fresh, ...pending];
        }
      });
    } catch {
      /* не критично */
    }
  }

  /** Подгружает более старые сообщения; возвращает количество добавленных. */
  async loadOlder(convId: number): Promise<number> {
    const current = this.messages[convId] ?? [];
    if (!this.hasMore[convId] || this.loadingMessages[convId]) return 0;
    const first = current.find((m) => m.id > 0);
    if (!first) return 0;
    this.loadingMessages[convId] = true;
    try {
      const older = await fetchData<ChatMessage[]>(
        `/chat/conversations/${convId}/messages`,
        { limit: PAGE_SIZE, before_id: first.id },
        { silent: true },
      );
      runInAction(() => {
        const known = new Set((this.messages[convId] ?? []).map((m) => m.id));
        const add = older.filter((m) => !known.has(m.id));
        this.messages[convId] = [...add, ...(this.messages[convId] ?? [])];
        this.hasMore[convId] = older.length >= PAGE_SIZE;
      });
      return older.length;
    } catch (e) {
      console.error("Ошибка загрузки истории:", e);
      return 0;
    } finally {
      runInAction(() => {
        this.loadingMessages[convId] = false;
      });
    }
  }

  /** Делает беседу активной, грузит историю и помечает прочитанной. */
  async openConversation(convId: number): Promise<void> {
    this.activeConversationId = convId;
    if (!this.messages[convId]) await this.loadMessages(convId);
    if (this.activeConversationId === convId && this.isTabVisible()) await this.markRead(convId);
  }

  closeConversation(): void {
    this.activeConversationId = null;
  }

  async markRead(convId: number): Promise<void> {
    const conv = this.conversations.find((c) => c.id === convId);
    if (!conv || conv.unread_count === 0) return;
    conv.unread_count = 0;
    await this.postRead(convId);
  }

  private async postRead(convId: number): Promise<void> {
    try {
      await sendData(`/chat/conversations/${convId}/read`, {});
    } catch (e) {
      console.error("Не удалось отметить диалог прочитанным:", e);
    }
  }

  /** Находит или создаёт беседу по конкурсу (и исполнителю — для заказчика). */
  async openWith(contestId: number, executorId?: number): Promise<Conversation> {
    const body: { contest_id: number; executor_id?: number } = { contest_id: contestId };
    if (executorId !== undefined) body.executor_id = executorId;
    const conv = await sendData<Conversation>("/chat/conversations", body);
    runInAction(() => {
      if (!this.conversations.some((c) => c.id === conv.id)) this.conversations.unshift(conv);
    });
    return conv;
  }

  // ── Отправка ───────────────────────────────────────────────────────────────

  async sendMessage(convId: number, rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) return;
    const temp: ChatMessage = {
      id: -(++this.tempSeq),
      conversation_id: convId,
      sender_id: this.userId ?? 0,
      text,
      created_at: new Date().toISOString(),
      read_at: null,
      status: "sending",
    };
    if (!this.messages[convId]) this.messages[convId] = [];
    this.messages[convId].push(temp);
    await this.deliver(convId, temp.id);
  }

  async retryMessage(convId: number, tempId: number): Promise<void> {
    const msg = (this.messages[convId] ?? []).find((m) => m.id === tempId);
    if (!msg || msg.status !== "error") return;
    msg.status = "sending";
    await this.deliver(convId, tempId);
  }

  private async deliver(convId: number, tempId: number): Promise<void> {
    const temp = (this.messages[convId] ?? []).find((m) => m.id === tempId);
    if (!temp) return;
    try {
      const saved = await sendData<ChatMessage>(`/chat/conversations/${convId}/messages`, {
        text: temp.text,
      });
      runInAction(() => {
        const list = this.messages[convId] ?? [];
        const idx = list.findIndex((m) => m.id === tempId);
        const dup = list.some((m) => m.id === saved.id);
        if (idx >= 0) {
          if (dup) list.splice(idx, 1);
          else list[idx] = saved;
        }
        const conv = this.conversations.find((c) => c.id === convId);
        if (conv) {
          conv.last_message = {
            id: saved.id,
            sender_id: saved.sender_id,
            text: saved.text.slice(0, 120),
            created_at: saved.created_at,
          };
          conv.last_message_at = saved.created_at;
          const ci = this.conversations.indexOf(conv);
          if (ci > 0) {
            this.conversations.splice(ci, 1);
            this.conversations.unshift(conv);
          }
        }
      });
      if (DEMO) this.scheduleDemoReply(convId);
    } catch (e) {
      console.error("Ошибка отправки сообщения:", e);
      runInAction(() => {
        const m = (this.messages[convId] ?? []).find((x) => x.id === tempId);
        if (m) m.status = "error";
      });
    }
  }

  /** Демо: собеседник «печатает» и через ~1.5 с отвечает заготовленной репликой. */
  private scheduleDemoReply(convId: number): void {
    const conv = this.conversations.find((c) => c.id === convId);
    if (!conv) return;
    const otherId = conv.other_user_id ?? 0;
    setTimeout(() => this.onTyping(convId), 300);
    setTimeout(() => {
      const list = this.messages[convId] ?? [];
      const maxId = list.reduce((mx, m) => Math.max(mx, m.id), 0);
      const text = DEMO_REPLIES[this.demoReplyIdx++ % DEMO_REPLIES.length];
      this.handleEvent({
        type: "message",
        conversation_id: convId,
        message: {
          id: maxId + 1,
          conversation_id: convId,
          sender_id: otherId,
          text,
          created_at: new Date().toISOString(),
          read_at: null,
        },
      });
      this.handleEvent({ type: "read", conversation_id: convId });
    }, 1500);
  }
}
