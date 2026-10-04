/* Recovery keys reach the system clipboard on both platforms. Clipboard
   managers, history and cloud sync may retain a copy after the app clears it.
   Android marks the clip sensitive through its native plugin. Web cleanup is
   best effort: reading or writing may be refused without a user gesture. */

import { isAndroid } from '$lib/platform';
import { sensitiveClipboard } from './recovery-key-clipboard-bridge';

/** How long to wait before clearing the copied key. Named in the copy
    beside the button as a minute, in both catalogues, so a change here is a
    change to two strings as well. */
/* RECOVERY_KEY_CLIPBOARD_CLEAR_MS stays exported only for its own test (AU-09
   test-only review). */
export const RECOVERY_KEY_CLIPBOARD_CLEAR_MS = 60_000;

let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
let copyGeneration = 0;
let pendingWrite: Promise<void> | undefined;
let currentCopy: { key: string; clipboard: Clipboard; deadline: number } | undefined;

// Idle copies call the browser immediately, preserving the button's user
// activation. Later writes wait for an in-flight copy or clear to finish.
function writeClipboard(write: () => Promise<void>): Promise<void> {
  const result = pendingWrite ? pendingWrite.then(write, write) : write();
  pendingWrite = result;
  const release = () => { if (pendingWrite === result) pendingWrite = undefined; };
  void result.then(release, release);
  return result;
}

function armCleanup() {
  const copy = currentCopy;
  if (!copy) return;
  const generation = copyGeneration;
  cleanupTimer = setTimeout(async () => {
    cleanupTimer = undefined;
    try {
      const current = await copy.clipboard.readText();
      if (generation !== copyGeneration || current !== copy.key) return;
      await writeClipboard(() => generation === copyGeneration
        ? copy.clipboard.writeText('') : Promise.resolve());
    } catch {
      // Browsers can refuse background clipboard access. Copy still worked.
    }
  }, Math.max(0, copy.deadline - performance.now()));
}

/** Puts the key on the clipboard. Rejects if the platform refuses, which is
    what the screen's "that did not work" toast is for. */
export async function copyRecoveryKey(key: string): Promise<void> {
  if (!isAndroid()) {
    const clipboard = navigator.clipboard;
    const generation = ++copyGeneration;
    clearTimeout(cleanupTimer);
    cleanupTimer = undefined;
    try {
      await writeClipboard(() => clipboard.writeText(key));
      currentCopy = { key, clipboard, deadline: performance.now() + RECOVERY_KEY_CLIPBOARD_CLEAR_MS };
    } finally {
      // A failed recopy still owes cleanup of the last successful copy.
      if (generation === copyGeneration) armCleanup();
    }
    return;
  }
  await sensitiveClipboard.copy({ value: key, clearAfterMs: RECOVERY_KEY_CLIPBOARD_CLEAR_MS });
}
