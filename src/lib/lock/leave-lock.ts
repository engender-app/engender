/* Time a web leave from page visibility and an Android leave from the
   activity. A web window that merely loses focus remains visible. Evaluate
   timeouts on return because the background runtime may suspend. An
   immediate lock engages on leave before the app switcher captures it.

   Android gives its own picker, camera and permission screens up to one
   minute under immediate timing. Screen-off still locks. Use wall-clock
   time so sleep counts. A backward clock also expires the wait. */

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
  lifecycle,
  lockAfter,
  lock,
  returned,
  now = Date.now
}: {
  /** The document, or anything with its visibility and its event. */
  page: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  native?: NativeLeaveHooks;
  /** Browser history can restore a frozen document before visibility fires. */
  lifecycle?: EventTarget;
  /** Read at each event rather than once, so a timing changed while the app
      was away applies to that absence. */
  lockAfter: () => LockAfter;
  lock: () => void;
  /** Called after every return the activity reports, once the lock has been
      decided: Android's leave cover comes off from here (leave-cover.ts). */
  returned?: () => void;
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
    native.__lockOnReturnFromNative = () => {
      onReturn();
      returned?.();
    };
    return () => {
      delete native.__lockOnLeaveFromNative;
      delete native.__lockOnReturnFromNative;
    };
  }
  const onHide = (event: Event) => {
    if ((event as PageTransitionEvent).persisted && hiddenAt === null) onLeave(false);
  };
  const onShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) onReturn();
  };
  page.addEventListener('visibilitychange', onVisibility);
  lifecycle?.addEventListener('pagehide', onHide);
  lifecycle?.addEventListener('pageshow', onShow);
  return () => {
    page.removeEventListener('visibilitychange', onVisibility);
    lifecycle?.removeEventListener('pagehide', onHide);
    lifecycle?.removeEventListener('pageshow', onShow);
  };
}
