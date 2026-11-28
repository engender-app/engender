/* Mirror lock coverage and its ground color to Android before leaving.
   MainActivity and LeaveCover.java put up the native cover synchronously
   so the task snapshot contains the cover. The page removes it after the
   return frame has drawn the unlocked content or the lock gate.

   Cover whenever the access mode has a secret. Delayed locks decide on
   return, so their task snapshots also need protection. */

import { isAndroid } from '../platform';
import { androidLockTiming as bridge } from './lock-timing-bridge';

/** Whether a leave covers the window: whenever the access mode has a secret,
    whatever the timing. A timing that waits for the return still leaves the
    window's snapshot in Recents, showing the journal, long after the lock
    has engaged; the snapshot is taken at the leave, before anyone can know
    whether the lock will be due. */
export function leaveCovers(hasSecret: boolean): boolean {
  return hasSecret;
}

/** Hands the activity what it needs before the next leave. `ground` is the
    page's own `--bg`, so the cover and the gate's page are one colour. */
export function syncLeaveCover(cover: boolean, ground: string, android = isAndroid()): void {
  if (!android) return;
  void bridge.setLeaveCover({ cover, ground }).catch(() => {});
}

/** Two frames, so the one the page has just drawn - the gate, after a lock -
    has been committed before the cover comes off. A WebView that is not
    drawing yet fires neither, and the cover stays: a plain ground for longer
    is the safe way to be slow. */
export function revealLeaveCoverAfterPaint(
  frame: (callback: () => void) => unknown = (callback) => requestAnimationFrame(callback),
  reveal: () => Promise<void> = () => bridge.revealLeaveCover()
): void {
  frame(() => frame(() => void reveal().catch(() => {})));
}
