/* The demo bar's three state jumps. Here rather than beside the journal
   because both exist only to drive a review build, and the whole demo module
   has to be droppable from a production bundle (ticket 05) - which it can
   only be if nothing outside `__DEMO__` imports it. DemoBar.svelte is the
   only caller, and it is itself behind the same flag.

   Both jumps clear the journal and rebuild it (journal-seed.ts) rather than
   swapping an object, because the journal is SQLite now. They go through the
   same handle the screens write through, so the mirror and every open query
   are invalidated by the writes themselves - a jump does not need to tell the
   UI it happened. */

import { journal } from '../live/journal.svelte';
import { prefs } from '../prefs/store.svelte';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue';
import { clearJournal, seedPersonaJournal } from './journal-seed';
import { demoPreferences } from './persona';
import { seedFullFixture } from './fullFixture';
import { seedReturnGap } from './returnGap';

/* The shape all three jumps share. Defaults first, then the seed: without
   the defaults a palette or a disguise toggle a reviewer flipped would
   survive "Reset demo state", which is not what reset means.

   The catch is ticket 135's answer to a seed that stops half way through -
   which is what a second jump starting inside this one causes, and what the
   journal's own invariants cause when it does. A journal left with the
   persona's first sixty days looks exactly like a journal with the
   persona in it, so a sweep photographs it and says nothing; an empty one
   is visibly wrong on the first screen. Clearing is the honest half-state,
   and the error still reaches the page so nobody has to infer it. */
async function reseed(seed: () => Promise<void>): Promise<void> {
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  try { localStorage.setItem('engender-has-entries', '1'); } catch {}
  await clearJournal(journal);
  try {
    await seed();
  } catch (err) {
    await clearJournal(journal);
    throw err;
  }
}

export async function resetDemo(): Promise<void> {
  await reseed(() => seedPersonaJournal(journal));
}

/** The persona plus every other More-hub area (phase 5 ticket 36) - a
    second jump rather than a change to `resetDemo` above, so "Reset demo
    state" still leaves every one of those areas in its designed empty
    state for a reviewer who wants to see that instead. */
export async function resetDemoFull(): Promise<void> {
  await reseed(async () => {
    await seedPersonaJournal(journal);
    await seedFullFixture(journal);
  });
}

/** The persona and every area, five weeks stale - the state the return
    surface exists for (phase 8 features ticket 05). A third jump rather than
    a variant of the two above, because a journal that stops five weeks ago
    is the wrong state for reviewing anything else: every screen's "recent"
    is empty in it. returnGap.ts says what it adds and why. */
export async function resetDemoComingBack(): Promise<void> {
  await reseed(() => seedReturnGap(journal));
}

/** True first-run state, for the demo bar's "Onboarding (first run)". Only
    the preferences onboarding itself decides are reset, so a reviewer who
    picked a theme or palette keeps it across the jump. */
export async function markFirstRun(): Promise<void> {
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  prefs.activeScales = [...PREFERENCE_DEFAULTS.activeScales];
  try { localStorage.setItem('engender-has-entries', '0'); } catch {}
  await clearJournal(journal);
}
