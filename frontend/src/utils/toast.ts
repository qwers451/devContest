/** Минимальная шина тостов: любой код может вызвать showToast, а <Toaster /> их отображает. */
export interface ToastInput {
  title: string;
  body?: string;
  /** Маршрут, на который ведёт клик по тосту. */
  link?: string;
  kind?: "info" | "success" | "warning";
}

export interface ToastItem extends ToastInput {
  id: number;
}

type ToastListener = (toast: ToastItem) => void;

const listeners = new Set<ToastListener>();
let seq = 0;

export function showToast(input: ToastInput): void {
  const toast: ToastItem = { ...input, id: ++seq };
  listeners.forEach((l) => l(toast));
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
