/* The one way a screen deletes something other than an entry (functional
   audit ticket 46): the deletion runs undoably (undoableDelete.ts), and a
   toast says it worked and offers Undo for UNDO_WINDOW_MS (undoWindow.ts).
   Floating, announced, and it never takes focus, like every toast. */

import { m } from '$lib/paraglide/messages';
import { journal } from '$lib/data/live/journal.svelte';
import type { Journal } from '$lib/data/journal/journal';
import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
import { overlayIsOpen } from '$lib/components/overlayLock';
import { dismissToast, toast } from './toasts.svelte';
import { openUndoWindow, type UndoWindow } from './undoWindow';

/** Runs `remove` so that it can be taken back. Rejects, deleting nothing,
    when the deletion fails. */
export function undoable(remove: (journal: Journal) => Promise<unknown>): Promise<UndoableDelete> {
  return journal.undoable(remove);
}

export function isUndoable(value: unknown): value is UndoableDelete {
  return typeof value === 'object' && value !== null && 'undo' in value && 'finish' in value;
}

/** Says the deletion worked, and keeps Undo up for the window. The window
    is held while a sheet is open, since the toast's button is inert behind
    one until it closes (overlayLock.ts). */
export function offerUndo(deletion: UndoableDelete, message: string): void {
  let id = 0;
  const window = openUndoWindow(deletion, { held: overlayIsOpen, onClose: () => dismissToast(id) });
  id = toast(message, {
    kind: 'record-deleted',
    actionLabel: m.delete_undo(),
    duration: null,
    onAction: () => void putBack(window),
    onExpire: () => void window.close()
  });
}

async function putBack(window: UndoWindow): Promise<void> {
  try {
    if (await window.undo()) toast(m.delete_undone(), { kind: 'saved' });
  } catch (error) {
    console.error(error);
    toast(m.delete_undo_failed(), { kind: 'failed' });
  }
}
