/* The one way a screen deletes something other than an entry (functional
   audit ticket 46): the deletion runs undoably (undoableDelete.ts), and a
   toast says it worked and offers Undo for UNDO_WINDOW_MS. Floating,
   announced, and it never takes focus, like every toast. */

import { m } from '$lib/paraglide/messages';
import { journal } from '$lib/data/live/journal.svelte';
import type { Journal } from '$lib/data/journal/journal';
import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
import { toast } from './toasts.svelte';
import { openUndoWindow, UNDO_WINDOW_MS, type UndoWindow } from './undoWindow';

/** Runs `remove` so that it can be taken back. Rejects, deleting nothing,
    when the deletion fails. */
export function undoable(remove: (journal: Journal) => Promise<unknown>): Promise<UndoableDelete> {
  return journal.undoable(remove);
}

export function isUndoable(value: unknown): value is UndoableDelete {
  return typeof value === 'object' && value !== null && 'undo' in value && 'finish' in value;
}

/** Says the deletion worked, and keeps Undo up for the window. */
export function offerUndo(deletion: UndoableDelete, message: string): void {
  const window = openUndoWindow(deletion);
  toast(message, {
    kind: 'record-deleted',
    actionLabel: m.delete_undo(),
    duration: UNDO_WINDOW_MS,
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
