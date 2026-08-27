/* When the browser next has nothing better to do.

   One caller so far: boot's two housekeeping passes, which no screen waits for
   (phase 5 audit ticket 02). requestIdleCallback is what the platform offers
   for exactly this, and both platforms have it - Chromium since 47, and the
   Android shell is a Chromium WebView (the app's floor is Chrome 87). The
   fallback is there for a browser that has withheld it, not for a platform
   that lacks it.

   The timeout is a ceiling, not a delay: a page that stays busy would
   otherwise never run the work at all, and housekeeping that only happens on
   idle machines is housekeeping that does not happen. */

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

/** How long the work may be held back before it runs anyway. */
const IDLE_TIMEOUT_MS = 3000;

export function whenIdle(run: () => void): void {
  const schedule = (globalThis as IdleWindow).requestIdleCallback;
  if (schedule) schedule(() => run(), { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(run, IDLE_TIMEOUT_MS);
}
