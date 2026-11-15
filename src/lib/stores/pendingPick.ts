/* A photo or file that came back from the system while the app was locked
   (Android, Lock immediately, a handler that is not a system component).

   A lock unmounts the screen that asked, so nothing is left to receive the
   result, and the lock also forbids keeping journal content in the page. The
   native side holds the picked file behind a token (PickedFiles.java), so only
   that token is kept here: no bytes, no name, nothing readable. After the
   person unlocks, the screen that asked mounts again at the same address and
   claims it by kind and place. A result nobody claims within ten minutes, or
   at another address, is forgotten, and the native side drops the file when the
   next pick replaces it or the device is reset. */

export type ClaimBy = 'entry' | 'document';

const HOLD_MS = 10 * 60_000;

let held: { claimBy: ClaimBy; path: string; tokens: string[]; at: number } | null = null;

export function holdPending(claimBy: ClaimBy, path: string, tokens: string[], now = Date.now()): void {
  held = { claimBy, path, tokens, at: now };
}

/** The tokens for this kind of screen at this address, once; null otherwise. */
export function claimPending(claimBy: ClaimBy, path: string, now = Date.now()): string[] | null {
  const current = held;
  if (!current) return null;
  if (now - current.at > HOLD_MS) {
    held = null;
    return null;
  }
  if (current.claimBy !== claimBy || current.path !== path) return null;
  held = null;
  return current.tokens;
}

export function dropPending(): void {
  held = null;
}
