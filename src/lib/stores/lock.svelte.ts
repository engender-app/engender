/* Keep the unlocked state in memory. A cold start begins locked for modes
   with an access secret, even after a crash or process death. Mid-session
   unlock uses that mode's original secret. Web locks close the database and
   release the key through journal-session.ts. Android has a native path.

   Web device-bound mode hides lock timing because it has no prompt to
   re-enter. Android's device-bound mode uses the Keystore prompt. */

import { prefs } from '../data/prefs/store.svelte';
import { accessModeHasSecret, type JournalAccessMode } from '../data/journal-access-mode';
import { isAndroid } from '../platform';
import { ui } from './ui.svelte';
import { forgetLastResults } from '../data/live/lastResults';
import { unlockAttempts } from '../lock/unlock-attempt';
import { dropPending } from './pendingPick';
import { watchLeave, type NativeLeaveHooks } from '../lock/leave-lock';
import { revealLeaveCoverAfterPaint } from '../lock/leave-cover';

export const lockState = $state({
  /** Set once the access mode's secret has been given, cleared on every lock. */
  unlocked: false
});

/** Takes the mode rather than reading it, so this stays importable by the
    boot store it would otherwise have to import back. */
export function isLocked(mode: JournalAccessMode): boolean {
  return accessModeHasSecret(mode, isAndroid()) && !lockState.unlocked;
}

/* The same flag outside the rune, for a teardown to read. Svelte hands an
   effect's teardown the value a piece of state had before the change that
   is tearing it down, so an editor unmounted by a lock read `unlocked` as
   still true and cleared the draft it was meant to keep (after-release
   ticket 10, traced in the demo build). */
let unlockedNow = false;

/** `isLocked` for a teardown: the same answer, read from the plain mirror. */
export function isLockedNow(mode: JournalAccessMode): boolean {
  return accessModeHasSecret(mode, isAndroid()) && !unlockedNow;
}

const attempts = unlockAttempts();

export const beginSessionUnlock = () => attempts.begin();

export function markUnlocked() {
  lockState.unlocked = true;
  unlockedNow = true;
  lockEngaged = false;
}

/** The app has locked mid-session and has not been unlocked since. A
    first-run or no-secret state is not this: nothing was left open. */
let lockEngaged = false;
export const isSessionLocked = () => lockEngaged && !unlockedNow;

function lockNow(closeJournal: () => Promise<void>) {
  attempts.lock();
  /* A result kept through the last lock was for the screen then open. */
  dropPending();
  unlockedNow = false;
  lockEngaged = true;
  lockState.unlocked = false;
  /* A locked app keeps none of the journal in the page: the reads' last
     answers go with the lock, so the first visit after unlocking reads
     fresh (lastResults.ts, ux-carpet 201). */
  forgetLastResults();
  /* Quick add is a layout-level sibling of the gate chain, not below it.
     The layout unmounts it while locked (security-scan ticket 08), and the
     flag is closed too, so it comes back closed after the unlock rather
     than open on whatever it was showing. */
  ui.chooserOpen = false;
  /* After the flag, so the gate is already drawn over the journal while the
     database waits for its last save and closes. A close that fails leaves
     the gate up regardless: the screen does not depend on it. */
  closeJournal().catch((error) => console.error('could not close the journal at the lock', error));
}

/** Watches page visibility, or on Android the activity's leave and return
    hooks instead. The preference is read when leaving, so changing timing
    does not replace listeners. `closeJournal` is the boot store's half of
    a lock, passed in rather than imported, so this stays importable by the
    boot store. */
export function watchLock(closeJournal: () => Promise<void>): () => void {
  return watchLeave({
    page: document,
    lifecycle: window,
    native: isAndroid() ? (window as unknown as NativeLeaveHooks) : undefined,
    lockAfter: () => prefs.lockAfter,
    lock: () => lockNow(closeJournal),
    /* After the lock: the cover the activity put up on the way out comes
       off once the gate has been drawn (lock/leave-cover.ts). */
    returned: isAndroid() ? () => revealLeaveCoverAfterPaint() : undefined
  });
}
