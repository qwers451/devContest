import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
  BsBell,
  BsChatDots,
  BsClock,
  BsExclamationCircle,
  BsFileEarmarkPlus,
  BsFlag,
  BsArrowRepeat,
  BsTrophy,
} from "react-icons/bs";
import type { IconType } from "react-icons";
import { Context } from "../context";
import type { NotificationType } from "../store/NotificationStore";
import { formatRelativeTime } from "../utils/notificationUtils";

export const NOTIFICATION_ICONS: Record<NotificationType, { icon: IconType; color: string }> = {
  submission: { icon: BsFileEarmarkPlus, color: "text-violet-400 bg-violet-500/15" },
  status: { icon: BsArrowRepeat, color: "text-sky-400 bg-sky-500/15" },
  win: { icon: BsTrophy, color: "text-emerald-400 bg-emerald-500/15" },
  finished: { icon: BsFlag, color: "text-gray-300 bg-gray-500/20" },
  deadline: { icon: BsClock, color: "text-amber-400 bg-amber-500/15" },
  expired: { icon: BsExclamationCircle, color: "text-red-400 bg-red-500/15" },
  message: { icon: BsChatDots, color: "text-violet-400 bg-violet-500/15" },
};

const NotificationBell = observer(() => {
  const { notifications } = useContext(Context);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику снаружи и Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    setTick((t) => t + 1);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = notifications.unreadCount;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 md:h-7 md:w-7"
        aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
        aria-expanded={open}
      >
        <BsBell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-gray-950">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className="animate-slide-down fixed inset-x-0 top-12 z-50 border-b border-gray-700 bg-gray-900 shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[380px] md:rounded-lg md:border"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-gray-100">Уведомления</h2>
            <button
              onClick={() => notifications.markAllRead()}
              disabled={unread === 0}
              className="text-[12px] font-medium text-violet-400 transition-colors hover:text-violet-300 focus:outline-none disabled:cursor-default disabled:text-gray-600"
            >
              Прочитать все
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto md:max-h-[420px]">
            {notifications.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BsBell className="h-6 w-6 text-gray-600" />
                <p className="text-[13px] text-gray-400">Пока нет уведомлений</p>
                <p className="text-[12px] text-gray-500">Здесь появятся новые решения, статусы и сообщения.</p>
              </div>
            ) : (
              <ul>
                {notifications.items.map((n) => {
                  const meta = NOTIFICATION_ICONS[n.type] ?? NOTIFICATION_ICONS.finished;
                  const Icon = meta.icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          notifications.markRead(n.id);
                          setOpen(false);
                          navigate(n.link);
                        }}
                        className={`flex w-full items-start gap-3 border-b border-gray-800 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-800/70 focus:outline-none focus-visible:bg-gray-800 ${
                          n.read ? "" : "bg-violet-500/5"
                        }`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${meta.color}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] leading-snug ${n.read ? "text-gray-300" : "font-semibold text-gray-100"}`}>
                            {n.title}
                          </span>
                          {n.body && <span className="mt-0.5 block text-[12px] leading-snug text-gray-400">{n.body}</span>}
                          <span className="mt-1 block text-[11px] text-gray-500">{formatRelativeTime(n.createdAt)}</span>
                        </span>
                        {!n.read && <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" aria-label="Не прочитано" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default NotificationBell;
