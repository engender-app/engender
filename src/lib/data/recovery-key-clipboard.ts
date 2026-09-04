/* Copying the recovery key, on either platform (phase 8 audit ticket 09).

   The key is a complete bypass of the passphrase, the PIN, the biometric,
   disguise mode, Safe Space and FLAG_SECURE, and ADR-0054 accepts that for
   the piece of paper the screen tells people to write it on. The clipboard
   is not the paper. On Android it is a shared surface: the keyboard's own
   clipboard history shows whatever is on it to anyone who long-presses in
   any text field in any app, and the flag that keeps a value out of that
   history - ClipDescription.EXTRA_IS_SENSITIVE - cannot be set through the
   web clipboard API. Nor does anything clear the clipboard again.

   So Android copies through SensitiveClipboardPlugin instead, which sets
   that flag and takes the value back off the clipboard a minute later. The
   web keeps navigator.clipboard, where the clipboard is the browser's own
   and no other app is reading it.

   Copy stays because dropping it would be worse: 25 characters typed by hand
   into a password manager is its own transcription risk, and the check
   symbol would reject the result without saying which group was wrong. */

import { isAndroid } from '$lib/platform';
import { sensitiveClipboard } from './recovery-key-clipboard-bridge';

/** How long the key may stay on the Android clipboard. Named in the copy
    beside the button as a minute, in both catalogues, so a change here is a
    change to two strings as well. */
export const RECOVERY_KEY_CLIPBOARD_CLEAR_MS = 60_000;

/** Puts the key on the clipboard. Rejects if the platform refuses, which is
    what the screen's "that did not work" toast is for. */
export async function copyRecoveryKey(key: string): Promise<void> {
  if (!isAndroid()) {
    await navigator.clipboard.writeText(key);
    return;
  }
  await sensitiveClipboard.copy({ value: key, clearAfterMs: RECOVERY_KEY_CLIPBOARD_CLEAR_MS });
}
