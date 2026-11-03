import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import { DEMO } from "../services/demoData";
import type { Contest } from "../types";
import UserAvatar from "./UserAvatar";
import UserLink from "./UserLink";
import {
  addComment,
  demoSeed,
  loadComments,
  saveComments,
  threadOf,
  type ContestComment,
} from "../utils/contestComments";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** «Вопросы и обсуждение»: ветка комментариев под конкурсом, ответ — один уровень. Хранится в localStorage. */
const ContestDiscussion = ({ contest, customerLogin }: { contest: Contest; customerLogin?: string }) => {
  const { user, chat } = useContext(Context)!;
  const navigate = useNavigate();
  const [list, setList] = useState<ContestComment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const me = user.user;
  const isOwner = !!me && me.id === contest.customer_id;

  useEffect(() => {
    let stored = loadComments(contest.id);
    if (!stored.length && DEMO) {
      stored = demoSeed(contest.customer_id, customerLogin || "customer1");
      saveComments(contest.id, stored);
    }
    setList(stored);
  }, [contest.id]);

  const post = (value: string, parentId: string | null) => {
    if (!me) return;
    const next = addComment(list, {
      parentId,
      authorId: me.id,
      authorLogin: me.login,
      isCustomer: me.id === contest.customer_id,
      text: value,
    });
    if (next === list) return;
    setList(next);
    saveComments(contest.id, next);
  };

  const writeTo = async (c: ContestComment) => {
    if (!c.authorId) return;
    try {
      const conv = await chat.openWith(contest.id, c.authorId);
      navigate(`/messages/${conv.id}`);
    } catch {
      /* чат недоступен — игнорируем, обсуждение работает и так */
    }
  };

  const bubble = (c: ContestComment, isReply: boolean) => (
    <div
      key={c.id}
      className={`rounded-md border px-3 py-2.5 ${
        c.isCustomer ? "border-violet-500/50 bg-violet-600/10" : "border-gray-700 bg-gray-800"
      } ${isReply ? "ml-5 sm:ml-8" : ""}`}
      data-testid={c.isCustomer ? "comment-customer" : "comment"}
    >
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <UserAvatar login={c.authorLogin} size={22} />
        <UserLink id={c.authorId} login={c.authorLogin} className="font-medium text-gray-200" />
        {c.isCustomer && (
          <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Заказчик</span>
        )}
        <span className="text-gray-500">{fmtTime(c.createdAt)}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-200">{c.text}</p>
      {me && (
        <div className="mt-1.5 flex gap-3 text-[12px]">
          <button
            onClick={() => {
              setReplyTo(replyTo === c.id ? null : c.id);
              setReplyText("");
            }}
            className="text-gray-400 hover:text-violet-400"
          >
            Ответить
          </button>
          {isOwner && !c.isCustomer && c.authorId && (
            <button onClick={() => writeTo(c)} className="text-gray-400 hover:text-violet-400">
              Написать
            </button>
          )}
        </div>
      )}
      {replyTo === c.id && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            post(replyText, c.parentId ?? c.id);
            setReplyTo(null);
            setReplyText("");
          }}
        >
          <input
            autoFocus
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Ваш ответ"
            maxLength={1000}
            className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <button
            type="submit"
            disabled={!replyText.trim()}
            className="rounded-md bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
          >
            Отправить
          </button>
        </form>
      )}
    </div>
  );

  const threads = threadOf(list);

  return (
    <section className="space-y-3" aria-label="Вопросы и обсуждение" data-testid="discussion">
      <h2 className="text-[14px] font-medium text-gray-200">Вопросы и обсуждение</h2>

      {threads.length === 0 && <p className="text-[13px] text-gray-500">Вопросов пока нет. Спросите первым.</p>}
      <div className="space-y-3">
        {threads.map(({ root, replies }) => (
          <div key={root.id} className="space-y-2">
            {bubble(root, false)}
            {replies.map((r) => bubble(r, true))}
          </div>
        ))}
      </div>

      {me ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            post(text, null);
            setText("");
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={isOwner ? "Напишите объявление или ответ участникам" : "Задайте вопрос заказчику"}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-md bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
            >
              Отправить
            </button>
          </div>
        </form>
      ) : (
        <p className="text-[13px] text-gray-500">Войдите, чтобы участвовать в обсуждении.</p>
      )}
    </section>
  );
};

export default observer(ContestDiscussion);
