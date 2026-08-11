/* The demo bar's two state jumps. Here rather than beside the journal
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

export async function resetDemo(): Promise<void> {
  // Defaults first, then the persona: without the defaults a palette or a
  // disguise toggle a reviewer flipped would survive "Reset demo state",
  // which is not what reset means.
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  await clearJournal(journal);
  await seedPersonaJournal(journal);
}

/** True first-run state, for the demo bar's "Onboarding (first run)". Only
    the preferences onboarding itself decides are reset, so a reviewer who
    picked a theme or palette keeps it across the jump. */
export async function markFirstRun(): Promise<void> {
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  await clearJournal(journal);
}
