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

   What this earns mid-session: the lock timing locks the app, and the
   access mode's own secret is the way back in (SessionUnlock.svelte).
   Re-entry costs one Argon2id derivation, which is the honest price of not
   keeping a second, weaker secret around to make it cheaper. On the web the
   lock is more than this flag since after-release ticket 10: it also closes
   the database and lets go of the data key (journal-session.ts), so the
   derivation is what opens the journal again rather than a check on who is
   there. Android keeps its own lock path.

   One combination has no way back and it is named rather than papered over:
   device-bound mode on the web has no secret to ask for, so no screen asks
   when to lock there. Android's
   device-bound mode does have one - the Keystore prompt - because Keystore
   will not release the key until the platform confirms who is present. */

import { prefs } from '../data/prefs/store.svelte';
import { accessModeHasSecret, type JournalAccessMode } from '../data/journal-access-mode';
import { isAndroid } from '../platform';
import { ui } from './ui.svelte';
import { forgetLastResults } from '../data/live/lastResults';
import { watchLeave, type NativeLeaveHooks } from '../lock/leave-lock';

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

export function markUnlocked() {
  lockState.unlocked = true;
  unlockedNow = true;
}

function lockNow(closeJournal: () => Promise<void>) {
  unlockedNow = false;
  lockState.unlocked = false;
  /* A locked app keeps none of the journal in the page: the reads' last
     answers go with the lock, so the first visit after unlocking reads
     fresh (lastResults.ts, ux-carpet 201). */
  forgetLastResults();
  /* Quick add is a layout-level sibling of the gate chain, not below it, so
     its own open flag is the only thing keeping it up. Locking is neither a
     navigation nor an Escape - the fan's two other ways down - and closing
     it here is cheaper than moving quick add inside the chain it would
     otherwise hide behind (phase 8 audit ticket 08). */
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
    native: isAndroid() ? (window as unknown as NativeLeaveHooks) : undefined,
    lockAfter: () => prefs.lockAfter,
    lock: () => lockNow(closeJournal)
  });
}
