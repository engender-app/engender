/* A new recovery key that a lock took off the screen before it was
   acknowledged (last-audit UI 09).

   A lock unmounts the route under it, and the recovery key screen held the
   only copy of a freshly minted key in its own state. Replacing a key kills
   the old one the moment the new wrap is written, so a lock that arrived
   while somebody went to another app to write the new one down left them
   with neither: the screen came back after unlocking saying a key was
   active, and nothing said the one they never saw was gone.

   So the key is held here, outside the screen, from the moment it is shown
   until it is acknowledged or left behind on purpose, and the screen shows
   it again when it is next drawn. What makes that compatible with the lock
   is that this module never holds the characters themselves. It holds them
   sealed under the journal's data key, the key a lock lets go of on the web
   (journal-session.ts), so while the gate is up the page has ciphertext and
   nothing that opens it, and only the access mode's own secret brings the
   key back - the same secret that brings the journal back. On Android the
   lock leaves the data key in the page, behind its native gate, and the
   sealed copy is then no weaker than the journal itself: whoever could open
   it already holds a key that reads every entry and, since the data key is
   not rotated, every copy of the journal (SECURITY.md).

   Memory only, on purpose. Nothing here touches storage, sealed or not, and
   a killed process loses the key along with this module; what a replacement
   interrupted by process death should leave behind is UI 42's protocol, not
   something a memory holder can answer.

   Rune-free so the Node tier reaches it. */

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
