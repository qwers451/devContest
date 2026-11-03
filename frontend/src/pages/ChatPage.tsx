import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router-dom";
import { Context } from "../context";
import { MESSAGES_ROUTE } from "../utils/consts.js";
import {
  dayKey,
  formatDateSeparator,
  formatListTime,
  formatMessageTime,
} from "../utils/chatUtils";
import type { ChatMessage, Conversation } from "../types";

const MAX_LEN = 4000;

const Avatar = ({ login, size = 36 }: { login?: string | null; size?: number }) => (
  <span
    style={{ width: size, height: size }}
    className="flex flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-[13px] font-semibold text-white"
  >
    {(login ?? "?")[0]?.toUpperCase()}
  </span>
);

const ConversationItem = observer(
  ({ conv, active, myId, onClick }: {
    conv: Conversation;
    active: boolean;
    myId: number | null;
    onClick: () => void;
  }) => {
    const { chat } = useContext(Context);
    const last = conv.last_message;
    const typing = chat.isTyping(conv.id);
    const stamp = last?.created_at ?? conv.last_message_at ?? conv.created_at;
    return (
      <button
        onClick={onClick}
        className={`flex w-full items-start gap-3 border-b border-gray-800 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:bg-gray-800 ${
          active ? "bg-gray-800" : "hover:bg-gray-800/60"
        }`}
      >
        <Avatar login={conv.other_user_login} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-gray-100">
              {conv.other_user_login}
            </span>
            {last && (
              <span className="flex-shrink-0 text-[11px] text-gray-500">
                {formatListTime(stamp)}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-violet-400">
            {conv.contest_title ?? "Конкурс"}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={`truncate text-[12px] ${
                typing ? "text-violet-400" : conv.unread_count ? "text-gray-200" : "text-gray-500"
              }`}
            >
              {typing
                ? "печатает…"
                : last
                  ? `${last.sender_id === myId ? "Вы: " : ""}${last.text}`
                  : "Сообщений пока нет"}
            </span>
            {conv.unread_count > 0 && (
              <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold text-white">
                {conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  },
);

const Bubble = observer(
  ({ msg, mine, onRetry }: { msg: ChatMessage; mine: boolean; onRetry: () => void }) => (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[70%] ${
          mine
            ? `rounded-br-md bg-violet-600 text-white ${msg.status ? "opacity-70" : ""}`
            : "rounded-bl-md border border-gray-700 bg-gray-800 text-gray-100"
        } ${msg.status === "error" ? "ring-1 ring-red-500" : ""}`}
      >
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{msg.text}</p>
        <div
          className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${
            mine ? "text-violet-200" : "text-gray-500"
          }`}
        >
          {msg.status === "error" ? (
            <>
              <span className="text-red-200">Не отправлено</span>
              <button
                onClick={onRetry}
                className="font-semibold underline underline-offset-2 hover:text-white"
              >
                Повторить
              </button>
            </>
          ) : msg.status === "sending" ? (
            <span>отправляется…</span>
          ) : (
            <>
              <span>{formatMessageTime(msg.created_at)}</span>
              {mine && (
                <span title={msg.read_at ? "Прочитано" : "Доставлено"}>
                  {msg.read_at ? "✓✓ прочитано" : "✓"}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  ),
);

const Thread = observer(({ conv, myId }: { conv: Conversation; myId: number | null }) => {
  const { chat } = useContext(Context);
  const navigate = useNavigate();
  const convId = conv.id;
  const messages = chat.getMessages(convId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const olderRef = useRef<number | null>(null);
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const firstId = messages[0]?.id;
  const lastMsg = messages[messages.length - 1];
  const lastKey = lastMsg ? `${lastMsg.id}:${lastMsg.status ?? ""}` : "";
  const typing = chat.isTyping(convId);

  // Смена беседы — сбрасываем автопрокрутку и черновик.
  useEffect(() => {
    stickRef.current = true;
    olderRef.current = null;
    setText("");
  }, [convId]);

  // Пришли старые сообщения — сохраняем позицию, иначе — вниз при новых.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (olderRef.current !== null) {
      el.scrollTop = el.scrollHeight - olderRef.current;
      olderRef.current = null;
      return;
    }
    if (stickRef.current || lastMsg?.sender_id === myId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [firstId, lastKey, typing, convId]);

  // Беседа видна снова — отмечаем прочитанной.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void chat.markRead(convId);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [chat, convId]);

  // Автоподгонка высоты textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text, convId]);

  const onScroll = async () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && chat.hasMore[convId] && !chat.loadingMessages[convId]) {
      olderRef.current = el.scrollHeight;
      const added = await chat.loadOlder(convId);
      if (!added) olderRef.current = null;
    }
  };

  const canSend = text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    const value = text;
    setText("");
    stickRef.current = true;
    void chat.sendMessage(convId, value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const loading = !chat.messages[convId] && chat.loadingMessages[convId];
  const items: React.ReactNode[] = [];
  let prevDay = "";
  let prevSender: number | null = null;
  messages.forEach((m) => {
    const dk = dayKey(m.created_at);
    if (dk !== prevDay) {
      items.push(
        <div key={`d-${dk}-${m.id}`} className="flex justify-center py-2">
          <span className="rounded-full bg-gray-800 px-3 py-0.5 text-[11px] text-gray-400">
            {formatDateSeparator(m.created_at)}
          </span>
        </div>,
      );
      prevDay = dk;
      prevSender = null;
    }
    items.push(
      <div key={m.id} className={prevSender === m.sender_id ? "mt-0.5" : "mt-2"}>
        <Bubble msg={m} mine={m.sender_id === myId} onRetry={() => chat.retryMessage(convId, m.id)} />
      </div>,
    );
    prevSender = m.sender_id;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-gray-700 px-3 py-3 sm:px-4">
        <button
          onClick={() => navigate(MESSAGES_ROUTE)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-gray-100 md:hidden"
          aria-label="Назад к диалогам"
        >
          ←
        </button>
        <Avatar login={conv.other_user_login} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-gray-100">
            {conv.other_user_login}
          </div>
          <button
            onClick={() => conv.contest_number && navigate(`/contest/${conv.contest_number}`)}
            className="max-w-full truncate text-left text-[12px] text-violet-400 hover:underline"
          >
            {conv.contest_title ?? "Конкурс"}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5"
      >
        {chat.hasMore[convId] && (
          <div className="py-2 text-center text-[11px] text-gray-500">
            {chat.loadingMessages[convId] ? "Загрузка…" : "Прокрутите вверх, чтобы загрузить ещё"}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-500">
            Сообщений пока нет. Напишите первым!
          </div>
        ) : (
          items
        )}
        {typing && (
          <div className="mt-2 flex justify-start">
            <span className="rounded-2xl rounded-bl-md border border-gray-700 bg-gray-800 px-3.5 py-2 text-[12px] italic text-gray-400">
              печатает…
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 bg-gray-900 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            maxLength={MAX_LEN}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) chat.sendTyping(convId);
            }}
            onKeyDown={onKeyDown}
            placeholder="Введите сообщение…"
            className="max-h-[140px] min-h-[40px] flex-1 resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-[13px] text-gray-100 placeholder-gray-500 focus:border-violet-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={!canSend}
            className="h-10 rounded-md bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Отправить
          </button>
        </div>
        <p className="mt-1.5 hidden text-[10px] text-gray-600 sm:block">
          Enter — отправить, Shift+Enter — новая строка
        </p>
      </div>
    </div>
  );
});

const ChatPage = observer(() => {
  const { chat, user } = useContext(Context);
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const myId = user.getCurrentUserId();
  const activeId = conversationId ? Number(conversationId) : null;
  const active = activeId !== null ? chat.conversations.find((c) => c.id === activeId) : undefined;

  useEffect(() => {
    if (chat.connection === "idle" && myId !== null) chat.connect(myId);
  }, [chat, myId, chat.connection]);

  useEffect(() => {
    if (activeId !== null && active) {
      void chat.openConversation(activeId);
    } else {
      chat.closeConversation();
    }
    return () => chat.closeConversation();
  }, [chat, activeId, !!active]);

  return (
    <div className="mx-auto h-[calc(100dvh-3rem)] max-w-[1400px] px-0 py-0 sm:px-5 sm:py-4">
      <div className="flex h-full overflow-hidden border-gray-700 bg-gray-900 sm:rounded-lg sm:border">
        <aside
          className={`${activeId !== null ? "hidden md:flex" : "flex"} w-full flex-shrink-0 flex-col border-r border-gray-700 md:w-80 lg:w-96`}
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <h1 className="text-[15px] font-semibold text-gray-100">Сообщения</h1>
            {chat.unreadTotal > 0 && (
              <span className="text-[11px] text-gray-400">Новых: {chat.unreadTotal}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!chat.conversationsLoaded ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
              </div>
            ) : chat.conversations.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[14px] font-medium text-gray-300">
                  Пока нет диалогов. Напишите заказчику со страницы конкурса или исполнителю со
                  страницы решения.
                </p>
                <p className="mt-2 text-[12px] text-gray-500">
                  Исполнитель: откройте конкурс и нажмите «Задать вопрос заказчику». Заказчик:
                  откройте решение и нажмите «Написать исполнителю».
                </p>
              </div>
            ) : (
              chat.conversations.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  myId={myId}
                  active={c.id === activeId}
                  onClick={() => navigate(`${MESSAGES_ROUTE}/${c.id}`)}
                />
              ))
            )}
          </div>
        </aside>

        <section className={`${activeId !== null ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {active ? (
            <Thread conv={active} myId={myId} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              {activeId !== null && chat.conversationsLoaded ? (
                <>
                  <p className="text-[14px] text-gray-300">Диалог не найден</p>
                  <button
                    onClick={() => navigate(MESSAGES_ROUTE)}
                    className="text-[13px] text-violet-400 hover:underline"
                  >
                    К списку диалогов
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[14px] text-gray-300">Выберите диалог</p>
                  <p className="text-[12px] text-gray-500">
                    Откройте беседу слева, чтобы прочитать переписку и ответить.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});

export default ChatPage;
