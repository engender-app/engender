/* How long an undoable deletion stays undoable (functional audit ticket 46),
   rune-free so the Node tier can hold it to the clock. The toast that offers
   Undo is up for exactly this long and closes the window early when it is
   cleared (a lock), so the button and the window never disagree. */

import type { UndoableDelete } from '../data/journal/undoableDelete';

/** Ten seconds: long enough to reach a toast's button after reading it, short
    enough that a deletion is settled before most people move on. */
export const UNDO_WINDOW_MS = 10_000;

export interface UndoWindow {
  /** True when the deletion was put back; false when the window had already
      closed. Rejects when the rows could not go back, which closes it. */
  undo(): Promise<boolean>;
  /** Makes the deletion final now. Does nothing once it is. */
  close(): Promise<void>;
}

export function openUndoWindow(deletion: UndoableDelete, ms = UNDO_WINDOW_MS): UndoWindow {
  let open = true;
  const timer = setTimeout(() => void close(), ms);

  async function close() {
    if (!open) return;
    open = false;
    clearTimeout(timer);
    await deletion.finish();
  }

  return {
    async undo() {
      if (!open) return false;
      open = false;
      clearTimeout(timer);
      try {
        await deletion.undo();
        return true;
      } catch (error) {
        await deletion.finish();
        throw error;
      }
    },
    close
  };
}
