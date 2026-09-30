/* When leaving the app asks for its secret again (lock-timing ticket 01).

   The clock starts when the page is hidden - a switched tab, a backgrounded
   app, a screen turned off - and nothing else. A desktop window losing focus
   while it is still on screen is not leaving, and used to lock the diary the
   moment somebody clicked the window beside it.

   The check happens on the way back rather than on a timer. A timer set while
   hidden may never run, since a backgrounded WebView is suspended, and the
   return is the first moment anything could be seen anyway. The one timing
   that cannot wait for the return is `immediately`, which locks as the page
   goes so the app switcher's thumbnail is taken of a locked screen. On
   Android the native onUserLeaveHint call (lock.svelte.ts) can get there
   sooner still; this listener is the one that runs everywhere.

   Wall-clock time, not performance.now(): a monotonic clock can stop while
   the device sleeps, which would under-count exactly the long absences this
   is for. A wall clock can be moved instead, so time running backwards counts
   as long enough rather than as none. */

import type { LockAfter } from '../data/prefs/catalogue.ts';

/** How long an absence may last under each timing that waits for the
    return. `immediately` locks as the page goes and `restart` never does,
    so neither has a length. */
const LOCK_AFTER_MS: Record<Exclude<LockAfter, 'immediately' | 'restart'>, number> = {
  'one-minute': 60_000,
  'five-minutes': 5 * 60_000
};

export function watchLeave({
  page,
  lockAfter,
  lock,
  now = Date.now
}: {
  /** The document, or anything with its visibility and its event. */
  page: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  /** Read at each event rather than once, so a timing changed while the app
      was away applies to that absence. */
  lockAfter: () => LockAfter;
  lock: () => void;
  now?: () => number;
}): () => void {
  let hiddenAt: number | null = null;

  const onVisibility = () => {
    if (page.visibilityState === 'hidden') {
      if (lockAfter() === 'immediately') lock();
      else hiddenAt = now();
      return;
    }
    if (hiddenAt === null) return;
    const away = now() - hiddenAt;
    hiddenAt = null;
    const timing = lockAfter();
    if (timing === 'restart') return;
    /* Changed to immediately while away: the absence already happened. */
    if (timing === 'immediately' || away >= LOCK_AFTER_MS[timing] || away < 0) lock();
  };

  page.addEventListener('visibilitychange', onVisibility);
  return () => page.removeEventListener('visibilitychange', onVisibility);
}
