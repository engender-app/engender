/* How long an undoable deletion stays undoable,
   rune-free so the Node tier can hold it to the clock. The window owns the
   clock: the toast that offers Undo has no timer of its own, goes when the
   window says it has closed, and closes the window early when it is cleared
   (a lock), so the button and the window never disagree.

   The window only runs while its Undo can be reached. A deletion made inside
   an open sheet (a photo in a session's editor, a waiting-list update) puts
   its toast over the scrim, where the button is inert until the sheet
   closes; `held` says so, and the window starts over, whole, once it is
   false again. */

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

/** How often a held window looks again. Short enough that the toast is
    counted from within a frame or two of the sheet's close being seen. */
const HELD_POLL_MS = 250;

export function openUndoWindow(
  deletion: UndoableDelete,
  options: { ms?: number; held?: () => boolean; onClose?: () => void } = {}
): UndoWindow {
  const { ms = UNDO_WINDOW_MS, held = () => false, onClose } = options;
  let open = true;
  let timer: ReturnType<typeof setTimeout>;
  const run = () => {
    timer = setTimeout(() => (held() ? waitForRelease() : runOut()), ms);
  };
  const waitForRelease = () => {
    timer = setTimeout(() => (held() ? waitForRelease() : run()), HELD_POLL_MS);
  };
  const runOut = () => {
    void close();
    onClose?.();
  };
  if (held()) waitForRelease();
  else run();

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
