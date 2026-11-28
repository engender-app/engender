/* Keep an unacknowledged recovery key available after a lock unmounts its
   screen. Seal it in memory with the journal key and open it after
   authorization. Clear it on acknowledgment or intentional dismissal.
   On web, journal-session.ts releases access to the journal key during
   the lock. Android uses its native gate. See SECURITY.md.

   Process death drops this copy. The replacement protocol and persisted
   wraps own recovery across restarts. This module stays rune-free. */

import { open, seal } from '../crypto/aesGcm';

/** The sealed bytes, as a promise so that a screen drawn while sealing is
    still under way waits for it rather than missing it. */
let held: Promise<Uint8Array<ArrayBuffer>> | null = null;

/** Starts holding `display`, sealed under `dataKey`, in place of whatever
    was held before. Synchronous, so a forget that follows it at once wins. */
export function holdShownRecoveryKey(display: string, dataKey: Uint8Array<ArrayBuffer>): void {
  const sealing = seal(dataKey, new TextEncoder().encode(display) as Uint8Array<ArrayBuffer>);
  // A failed seal surfaces at the open that reads it, not as an unhandled rejection.
  sealing.catch(() => {});
  held = sealing;
}

/** Whether a key is waiting to be shown again. */
export function recoveryKeyHeld(): boolean {
  return held !== null;
}

/** The held key's characters, or null when nothing is held or it was
    forgotten while this was opening it. Throws DecryptionFailedError for a
    data key that is not the one it was sealed under. */
export async function openHeldRecoveryKey(dataKey: Uint8Array<ArrayBuffer>): Promise<string | null> {
  const sealing = held;
  if (sealing === null) return null;
  const plaintext = await open(dataKey, await sealing);
  return held === sealing ? new TextDecoder().decode(plaintext) : null;
}

/** Acknowledged, discarded, or left: nothing is shown again. */
export function forgetHeldRecoveryKey(): void {
  held = null;
}
