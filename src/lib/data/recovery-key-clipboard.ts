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

/** Puts the key on the clipboard. Rejects if the platform refuses, which is
    what the screen's "that did not work" toast is for. */
export async function copyRecoveryKey(key: string): Promise<void> {
  if (!isAndroid()) {
    const clipboard = navigator.clipboard;
    await clipboard.writeText(key);
    setTimeout(async () => {
      try {
        if (await clipboard.readText() === key) await clipboard.writeText('');
      } catch {
        // Browsers can refuse background clipboard access. Copy still worked.
      }
    }, RECOVERY_KEY_CLIPBOARD_CLEAR_MS);
    return;
  }
  await sensitiveClipboard.copy({ value: key, clearAfterMs: RECOVERY_KEY_CLIPBOARD_CLEAR_MS });
}
