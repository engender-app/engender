/* What Android shows of the journal when somebody comes back to a locked app
   (tester-report-02 ticket 07, the return-from-Home check).

   "Lock immediately" locks as the app is left, but the lock is JavaScript,
   run by the activity through evaluateJavascript, and Android photographs the
   window for its task snapshot before the WebView has drawn the gate. The
   snapshot is what Android draws first when the person comes back, while the
   WebView wakes up and draws again, so the screen they left - Today with
   their name and their entry count, or whatever else was open - was on
   screen for the first 190ms of every return before it crossfaded into the
   gate, and for seconds when the WebView was slow to draw.

   Nothing on the page can reach a photograph Android has already taken, so
   the activity covers the window itself, natively and synchronously, in the
   same leave callback that asks the page to lock: a plain block of the
   page's ground over the WebView (MainActivity, LeaveCover.java). The
   snapshot is taken of the cover. On the way back the page takes the cover
   off only once a frame has been drawn with the gate in it, so the first
   thing a person sees is the ground and then the gate, as a cut.

   The activity cannot ask the page what to do while it is leaving, so this
   module mirrors the two things it needs ahead of time: whether a leave
   covers (the access mode has a secret, whatever the lock timing) and the
   ground to cover with. A timing that waits for the return is covered too:
   whether the lock is due is only known when the person comes back, and
   Recents would show the journal in the meantime, and after the lock had
   engaged. The page takes the cover off after every return, so a return
   that does not lock costs two frames of the plain ground. */

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
