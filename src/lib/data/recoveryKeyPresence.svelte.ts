/* Shared recovery-key state for gates and security screens (ADR-0054).
   Wait for `known` before rendering dependent copy so first paint
   does not falsely report a missing key. On unexpected read failures,
   leave `known` false. The file reader already handles unreadable files. */

import { recoveryKeyState } from './recovery-key';

export const recoveryKeyPresence = $state({
  /** Whether the answer is in yet. Nothing conditional draws until it is. */
  known: false,
  /** Whether any recovery key opens this journal: what a gate offers. */
  exists: false,
  /** Whether a confirmed key does: what Settings states as set up. */
  active: false,
  /** Whether a new key is waiting to be confirmed after an interrupted
      replacement or first mint (last-audit UI 42). */
  pending: false
});

/** Re-reads the file. Called on mount by everything that shows the answer,
    and again by the screen that mints or revokes one - a file read is cheap
    enough that caching it would only be a way to go stale. */
export async function refreshRecoveryKeyPresence(): Promise<void> {
  try {
    const found = await recoveryKeyState();
    recoveryKeyPresence.exists = found.active || found.pending;
    recoveryKeyPresence.active = found.active;
    recoveryKeyPresence.pending = found.pending;
    recoveryKeyPresence.known = true;
  } catch (error) {
    console.error('could not tell whether this journal has a recovery key', error);
    recoveryKeyPresence.known = false;
  }
}
