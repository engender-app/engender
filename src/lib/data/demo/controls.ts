/* The demo bar's three state jumps. Here rather than beside the journal
   because both exist only to drive a review build, and the whole demo module
   has to be droppable from a production bundle - which it can
   only be if nothing outside `__DEMO__` imports it. DemoBar.svelte is the
   only caller, and it is itself behind the same flag.

   Both jumps clear the journal and rebuild it (journal-seed.ts) rather than
   swapping an object, because the journal is SQLite now. They go through the
   same handle the screens write through, so the mirror and every open query
   are invalidated by the writes themselves - a jump does not need to tell the
   UI it happened. */

import { batchWrites, journal, onTablesWritten } from '../live/journal.svelte';
import { prefs } from '../prefs/store.svelte';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue';
import { withHasEntries } from '../acknowledgements';
import { clearJournal, seedPersonaJournal } from './journal-seed';
import { demoPreferences } from './persona';
import { getLocale } from '$lib/paraglide/runtime';

/* The device sweep records which demo profile it prepared. Any journal
   write outside that preparation makes the record stale. The sweep stamps
   it again only after its own seed has finished. */
onTablesWritten((tables) => {
  if (!document.querySelector('[data-app-root][data-boot="ready"]')) return;
  /* Boot auto-logs due doses after it marks the journal ready. Those
     expected rows do not turn the seeded persona into another profile. */
  if (tables.every((table) => table === 'dose')) return;
  try { localStorage.removeItem('yank-sweep-profile'); } catch {}
});

/* Restore defaults before seeding so reviewer overrides clear on reset.
   Clear any partial seed and propagate the error. An incomplete persona
   can look valid in a sweep, while an empty journal signals failure.

   `batchWrites` defers table-version bumps until the seed completes.
   Thousands of writes then trigger one round of live queries, avoiding
   repeated reads against a growing journal. */
async function reseed(seed: () => Promise<void>): Promise<void> {
  Object.assign(prefs, PREFERENCE_DEFAULTS, demoPreferences());
  prefs.acknowledgements = withHasEntries(prefs.acknowledgements, true);
  await batchWrites(async () => {
    await clearJournal(journal);
    try {
      await seed();
    } catch (err) {
      await clearJournal(journal);
      throw err;
    }
  });
}

export async function resetDemo(): Promise<void> {
  await reseed(() => seedPersonaJournal(journal, undefined, getLocale()));
}

/** The persona plus every other More-hub area - a
    second jump rather than a change to `resetDemo` above, so "Reset demo
    state" still leaves every one of those areas in its designed empty
    state for a reviewer who wants to see that instead. */
export async function resetDemoFull(): Promise<void> {
  const { seedFullFixture } = await import('./fullFixture');
  await reseed(async () => {
    await seedPersonaJournal(journal, undefined, getLocale());
    await seedFullFixture(journal, undefined, getLocale());
  });
}

/** The persona and every area, five weeks stale - the state the return
    surface exists for. A third jump rather than
    a variant of the two above, because a journal that stops five weeks ago
    is the wrong state for reviewing anything else: every screen's "recent"
    is empty in it. returnGap.ts says what it adds and why. */
export async function resetDemoComingBack(): Promise<void> {
  const { seedReturnGap } = await import('./returnGap');
  await reseed(() => seedReturnGap(journal, undefined, getLocale()));
}

/** True first-run state, for the demo bar's "Onboarding (first run)". Only
    the preferences onboarding itself decides are reset, so a reviewer who
    picked a theme or palette keeps it across the jump. */
export async function markFirstRun(): Promise<void> {
  prefs.onboarded = PREFERENCE_DEFAULTS.onboarded;
  prefs.name = PREFERENCE_DEFAULTS.name;
  prefs.lastBackupAt = PREFERENCE_DEFAULTS.lastBackupAt;
  prefs.activeScales = [...PREFERENCE_DEFAULTS.activeScales];
  prefs.acknowledgements = withHasEntries(prefs.acknowledgements, false);
  await clearJournal(journal);
}
