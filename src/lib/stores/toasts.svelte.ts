/* Quiet toast confirmations, rendered by Toasts.svelte in the layout. */

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

let seq = 1;
export const toasts = $state<ToastItem[]>([]);

export function toast(message: string, opts: { actionLabel?: string; onAction?: () => void; duration?: number } = {}) {
  const item: ToastItem = { id: seq++, message, actionLabel: opts.actionLabel, onAction: opts.onAction };
  toasts.push(item);
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === item.id);
    if (i >= 0) toasts.splice(i, 1);
  }, opts.duration ?? 4000);
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
