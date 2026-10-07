/* Quiet toast confirmations, rendered by Toasts.svelte in the layout. */

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /* Walkthrough handle for the few toasts the suite has to pick out of a
     group (ADR: the walkthrough grips handles, never wording) - most
     toast() callers never pass this, since most toasts are only ever
     asserted on by their role. */
  kind?: string;
  /** Drawn at the top of the screen rather than above the bar: a failure
      raised while a sheet is open, which stays open, would otherwise land on
      the sheet's own buttons. Decided once, when the toast is made, so a
      toast never moves while it is up. */
  raised?: boolean;
}

let seq = 1;
export const toasts = $state<ToastItem[]>([]);

export function toast(
  message: string,
  opts: { actionLabel?: string; onAction?: () => void; duration?: number; kind?: string } = {}
) {
  const raised = opts.kind === 'failed' && typeof document !== 'undefined' && !!document.querySelector('[data-sheet-scrim]');
  const item: ToastItem = { id: seq++, message, actionLabel: opts.actionLabel, onAction: opts.onAction, kind: opts.kind, raised };
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
