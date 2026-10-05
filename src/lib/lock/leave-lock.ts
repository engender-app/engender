/* When leaving the app asks for its secret again (lock-timing ticket 01).

   The clock starts when the page is hidden - a switched tab, a backgrounded
   app, a screen turned off - or, on Android, when the activity reports
   leaving. A desktop window losing focus
   while it is still on screen is not leaving, and used to lock the diary the
   moment somebody clicked the window beside it.

   The check happens on the way back rather than on a timer. A timer set while
   hidden may never run, since a backgrounded WebView is suspended, and the
   return is the first moment anything could be seen anyway. The one timing
   that cannot wait for the return is `immediately`, which locks as the page
   goes so the app switcher's thumbnail is taken of a locked screen.

   On Android the activity is the only judge of leaving, and the page's
   visibility is not listened to at all. A photo picker, the camera, a folder
   picker and a permission dialog each cover the WebView and hide the page
   while the person is still in the middle of something here, and only the
   activity knows that it started them (MainActivity's own-system-UI window),
   so it says so when it reports that leave. Under `immediately` such a leave
   gets a minute of grace instead of a lock. Not unlimited grace, because
   Home or Recents pressed on top of a picker never reaches this app at all:
   the time on the picker is all there is to go on, and a picker open for
   longer than a minute is treated as the person having gone. The screen
   going off does reach the activity, picker or not, and locks as before.

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

/** How long `immediately` lets one of the app's own screens stay up. */
const OWN_SCREEN_GRACE_MS = 60_000;

/** Hooks the Android activity calls on every leave and return it judges real. */
export type NativeLeaveHooks = {
  /** `ownScreen` when the app is covered by a screen it opened itself. */
  __lockOnLeaveFromNative?: (ownScreen?: boolean) => void;
  __lockOnReturnFromNative?: () => void;
};

export function watchLeave({
  page,
  native,
  lockAfter,
  lock,
  now = Date.now
}: {
  /** The document, or anything with its visibility and its event. */
  page: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  native?: NativeLeaveHooks;
  /** Read at each event rather than once, so a timing changed while the app
      was away applies to that absence. */
  lockAfter: () => LockAfter;
  lock: () => void;
  now?: () => number;
}): () => void {
  let hiddenAt: number | null = null;
  /** Whether every leave since the last return was to the app's own screen. */
  let ownScreenOnly = false;

  const onLeave = (ownScreen = false) => {
    ownScreenOnly = hiddenAt === null ? ownScreen : ownScreenOnly && ownScreen;
    if (lockAfter() === 'immediately' && !ownScreen) lock();
    else hiddenAt ??= now();
  };
  const onReturn = () => {
    if (hiddenAt === null) return;
    const away = now() - hiddenAt;
    hiddenAt = null;
    const timing = lockAfter();
    if (timing === 'restart') return;
    const limit =
      timing !== 'immediately' ? LOCK_AFTER_MS[timing]
      : ownScreenOnly ? OWN_SCREEN_GRACE_MS
      /* Changed to immediately while away: the absence already happened. */
      : 0;
    if (away >= limit || away < 0) lock();
  };
  const onVisibility = () => {
    if (page.visibilityState === 'hidden') onLeave(false);
    else onReturn();
  };

  if (native) {
    native.__lockOnLeaveFromNative = onLeave;
    native.__lockOnReturnFromNative = onReturn;
    return () => {
      delete native.__lockOnLeaveFromNative;
      delete native.__lockOnReturnFromNative;
    };
  }
  page.addEventListener('visibilitychange', onVisibility);
  return () => page.removeEventListener('visibilitychange', onVisibility);
}
