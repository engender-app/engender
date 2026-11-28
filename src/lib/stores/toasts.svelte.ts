/* Quiet toast confirmations, rendered by Toasts.svelte in the layout. */

import { announce } from './announcer.svelte';
import { forgetOnLock } from '../lock/forget-content';

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
  /** Called when its own timer runs out or a lock clears it, not when a
      caller dismisses it. An undo toast closes its window here on a lock. */
  onExpire?: () => void;
}

let seq = 1;
export const toasts = $state<ToastItem[]>([]);
export const toastLifetime = $state({ generation: 0 });
const pending = new Map<number, ReturnType<typeof setTimeout>>();

/** Shows a toast and returns its id. `duration` null keeps it up until the
    caller dismisses it (an undo toast, whose window owns the clock). */
export function toast(
  message: string,
  opts: { actionLabel?: string; onAction?: () => void; onExpire?: () => void; duration?: number | null; kind?: string } = {}
): number {
  const raised = opts.kind === 'failed' && typeof document !== 'undefined' && !!document.querySelector('[data-sheet-scrim]');
  const item: ToastItem = {
    id: seq++,
    message,
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
    onExpire: opts.onExpire,
    kind: opts.kind,
    raised
  };
  toasts.push(item);
  announce(message, opts.kind === 'failed');
  if (opts.duration !== null) {
    pending.set(item.id, setTimeout(() => {
      item.onExpire?.();
      dismissToast(item.id);
    }, opts.duration ?? 4000));
  }
  return item.id;
}

export function dismissToast(id: number) {
  clearTimeout(pending.get(id));
  pending.delete(id);
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

/** Concealment also retires outgoing toast DOM and its old action bindings. */
export function clearToasts(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  for (const item of toasts) {
    item.onAction = undefined;
    item.onExpire?.();
  }
  toasts.splice(0);
  toastLifetime.generation++;
}
forgetOnLock(clearToasts);
