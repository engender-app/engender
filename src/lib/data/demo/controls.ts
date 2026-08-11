/* The demo bar's two state jumps. Here rather than in db.svelte.ts because
   both exist only to drive a review build, and the whole demo module has to
   be droppable from a production bundle (ticket 05) - which it can only be
   if nothing outside `__DEMO__` imports it. DemoBar.svelte is the only
   caller, and it is itself behind the same flag. */

import { replaceAll } from '../db.svelte';
import { emptyDb, seedVocabulary } from '../firstRun';
import { prefs } from '../prefs/store.svelte';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue';
import { demoPreferences, personaDb } from './persona';

export function resetDemo() {
  // Defaults first, then the persona: without the defaults a palette or a
  // disguise toggle a reviewer flipped would survive "Reset demo state",
  // which is not what reset means.
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  replaceAll(seedVocabulary(personaDb()));
}

/** True first-run state, for the demo bar's "Onboarding (first run)". Only
    the preferences onboarding itself decides are reset, so a reviewer who
    picked a theme or palette keeps it across the jump. */
export function markFirstRun() {
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  replaceAll(seedVocabulary(emptyDb()));
}
