import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BsBell, BsCheckCircle, BsExclamationTriangle, BsX } from "react-icons/bs";
import { subscribeToasts, type ToastItem } from "../utils/toast";

export const TOAST_DURATION_MS = 5000;
const MAX_VISIBLE = 4;

const KIND_STYLE = {
  info: { icon: BsBell, color: "text-violet-400" },
  success: { icon: BsCheckCircle, color: "text-emerald-400" },
  warning: { icon: BsExclamationTriangle, color: "text-amber-400" },
} as const;

/** Всплывающие уведомления: снизу справа (на телефоне — на всю ширину), скрываются через 5 с. */
export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const navigate = useNavigate();

  const dismiss = (id: number) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((list) => list.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const unsubscribe = subscribeToasts((toast) => {
      setToasts((list) => [...list, toast].slice(-MAX_VISIBLE));
      timers.current[toast.id] = setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS);
    });
    const active = timers.current;
    return () => {
      unsubscribe();
      Object.values(active).forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-3 sm:inset-x-auto sm:right-0 sm:w-[380px] sm:p-4"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const style = KIND_STYLE[t.kind ?? "info"];
        const Icon = style.icon;
        return (
          <div
            key={t.id}
            role="status"
            className="ui-toast pointer-events-auto flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-2xl"
          >
            <button
              onClick={() => {
                dismiss(t.id);
                if (t.link) navigate(t.link);
              }}
              className={`flex min-w-0 flex-1 items-start gap-3 text-left focus:outline-none ${t.link ? "cursor-pointer" : "cursor-default"}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${style.color}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-snug text-gray-100">{t.title}</span>
                {t.body && <span className="mt-0.5 block text-[12px] leading-snug text-gray-400">{t.body}</span>}
              </span>
            </button>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:text-gray-200 focus:outline-none"
              aria-label="Закрыть"
            >
              <BsX className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
