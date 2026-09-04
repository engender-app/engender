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

export async function resetDemo(): Promise<void> {
  // Defaults first, then the persona: without the defaults a palette or a
  // disguise toggle a reviewer flipped would survive "Reset demo state",
  // which is not what reset means.
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  await clearJournal(journal);
  await seedPersonaJournal(journal);
}

/** The persona plus every other More-hub area (phase 5 ticket 36) - a
    second jump rather than a change to `resetDemo` above, so "Reset demo
    state" still leaves every one of those areas in its designed empty
    state for a reviewer who wants to see that instead. */
export async function resetDemoFull(): Promise<void> {
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  await clearJournal(journal);
  await seedPersonaJournal(journal);
  await seedFullFixture(journal);
}

/** The persona and every area, five weeks stale - the state the return
    surface exists for (phase 8 features ticket 05). A third jump rather than
    a variant of the two above, because a journal that stops five weeks ago
    is the wrong state for reviewing anything else: every screen's "recent"
    is empty in it. returnGap.ts says what it adds and why. */
export async function resetDemoComingBack(): Promise<void> {
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  await clearJournal(journal);
  await seedReturnGap(journal);
}

/** True first-run state, for the demo bar's "Onboarding (first run)". Only
    the preferences onboarding itself decides are reset, so a reviewer who
    picked a theme or palette keeps it across the jump. */
export async function markFirstRun(): Promise<void> {
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  prefs.activeScales = [...PREFERENCE_DEFAULTS.activeScales];
  await clearJournal(journal);
}
