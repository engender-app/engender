/* Whether the app is showing its journal or its lock screen (ticket 17).

   The question is asked as "is there a PIN, and has it been entered since
   this page loaded", not as a stored "locked" flag. A stored flag would
   have to be written on the way out, and the ways out are a killed tab, a
   crash and a swipe from the app switcher - none of which run code. This
   way the safe answer is the default: `unlocked` starts false, so a cold
   start with a PIN set is locked before anything else decides anything.

   `pinHash` rather than `appLock` is what the gate reads, because the gate
   renders before SQLite opens and only the boot set is available that
   early (ADR-0009). The two are kept in step where a PIN is set and
   cleared, so a hash is present exactly when app lock is on.

   Biometrics (Android) will unlock by calling markUnlocked() after its own
   prompt succeeds; nothing about the PIN path has to change for it. */

import { prefs } from '../data/prefs/store.svelte';
import { isAndroid } from '../platform';

export const lockState = $state({
  /** Set once the PIN has been accepted, cleared on every lock. */
  unlocked: false,
  /** Quick exit's neutral page, over the top of everything (web only). */
  blanked: false
});

export function isLocked(): boolean {
  return prefs.pinHash !== null && !lockState.unlocked;
}

export function markUnlocked() {
  lockState.unlocked = true;
  lockState.blanked = false;
}

export function lockNow() {
  lockState.unlocked = false;
}

/** Two-finger swipe down (F24): lock, and on web put a neutral page over
    the tab as well, so what is on screen when someone glances over is not
    a lock screen with the app's name on it. On Android the shell's own
    "leave the app" gesture is the equivalent, and belongs with it. */
export function quickExit() {
  lockNow();
  if (!isAndroid()) lockState.blanked = true;
}

/** How far two fingers travel down before it counts. Long enough not to
    fire on a two-finger scroll of a page that scrolls. */
const QUICK_EXIT_DISTANCE = 90;

/** Registers the gestures and the leave events. The preferences are read
    inside the handlers rather than around them, so toggling a setting
    doesn't churn listeners. */
export function watchLock(): () => void {
  let startY: number | null = null;

  const twoFingerY = (touches: TouchList): number | null =>
    touches.length === 2 ? (touches[0].clientY + touches[1].clientY) / 2 : null;

  const onTouchStart = (event: TouchEvent) => {
    startY = twoFingerY(event.touches);
  };

  const onTouchMove = (event: TouchEvent) => {
    const y = twoFingerY(event.touches);
    if (startY === null || y === null) return;
    if (prefs.quickExit && y - startY > QUICK_EXIT_DISTANCE) {
      startY = null;
      quickExit();
    }
  };

  const onTouchEnd = () => {
    startY = null;
  };

  /* Both events, because they answer different halves of "the app is no
     longer in front of you": visibilitychange covers a backgrounded
     Android app and a switched tab, blur covers a window that lost focus
     while still visible. Locking twice is free. */
  const onVisibility = () => {
    if (prefs.lockOnLeave && document.visibilityState === 'hidden') lockNow();
  };
  const onBlur = () => {
    if (prefs.lockOnLeave) lockNow();
  };

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
  };
}
