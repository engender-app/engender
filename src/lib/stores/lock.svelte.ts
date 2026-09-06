/* Whether the app is showing its journal or asking for its secret again
   (ticket 17, rebuilt by ticket 53).

   The question used to be "is there a PIN, and has it been entered since this
   page loaded", against a PIN that gated the UI and encrypted nothing
   (ADR-0014). That gate is retired: a PIN is an access mode now, and there is
   no second secret sitting on top of the one that opens the journal.

   So the question is "does this journal's access mode have a secret, and has
   it been given since this page loaded". A stored "locked" flag would still
   be wrong for the reason it always was - the ways out are a killed tab, a
   crash and a swipe from the app switcher, none of which run code - so
   `unlocked` still starts false and a cold start is still locked before
   anything decides anything. Boot sets it the moment a secret is typed.

   What this earns mid-session is unchanged: lock-on-leave and quick exit lock
   the app while the unlocked key is still in memory, and the access mode's
   own secret is the way back in (SessionUnlock.svelte). Re-entry costs one
   Argon2id derivation, which is the honest price of not keeping a second,
   weaker secret around to make it cheaper.

   One combination has no way back and it is named rather than papered over:
   device-bound mode on the web has no secret to ask for, so lock-on-leave
   there can only blank the screen. Android's device-bound mode does have one
   - the Keystore prompt - because Keystore will not release the key until the
   platform confirms who is present. */

import { prefs } from '../data/prefs/store.svelte';
import { accessModeHasSecret, type JournalAccessMode } from '../data/journal-access-mode';
import { isAndroid } from '../platform';
import { ui } from './ui.svelte';

export const lockState = $state({
  /** Set once the access mode's secret has been given, cleared on every lock. */
  unlocked: false,
  /** Quick exit's neutral page, over the top of everything (web only). */
  blanked: false
});

/** Takes the mode rather than reading it, so this stays importable by the
    boot store it would otherwise have to import back. */
export function isLocked(mode: JournalAccessMode): boolean {
  return accessModeHasSecret(mode, isAndroid()) && !lockState.unlocked;
}

export function markUnlocked() {
  lockState.unlocked = true;
  lockState.blanked = false;
}

function lockNow() {
  lockState.unlocked = false;
  /* Quick add is a layout-level sibling of the gate chain, not below it, so
     its own open flag is the only thing keeping it up. Locking is neither a
     navigation nor an Escape - the fan's two other ways down - and closing
     it here is cheaper than moving quick add inside the chain it would
     otherwise hide behind (phase 8 audit ticket 08). */
  ui.chooserOpen = false;
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

  /* The Android equivalent of the two-finger swipe (ticket 15): pressing
     Home or Recents. MainActivity.onUserLeaveHint calls this straight
     through evaluateJavascript rather than waiting on onVisibility above,
     which only runs once the WebView's event loop gets to it - by then the
     system may already have the recents thumbnail it took at leave time. */
  if (isAndroid()) {
    (window as unknown as { __quickExitFromNative?: () => void }).__quickExitFromNative = quickExit;
  }

  return () => {
    if (isAndroid()) delete (window as unknown as { __quickExitFromNative?: () => void }).__quickExitFromNative;
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
  };
}
