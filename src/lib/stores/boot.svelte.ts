/* Runs the real SQLite boot sequence once (ticket 04) and exposes its
   result reactively, so +layout.svelte can show a handled error state
   instead of a blank screen if opening the database or running migrations
   fails. This only runs in the browser (ssr = false).

   It is also the thin app-level module ADR-0017 asks for: the one place that
   constructs the journal over the driver and hands it to the UI. The driver
   stops here - screens reach the journal through data/live/, which is the
   only thing above this file that knows a database is involved at all.

   Two things arrive in two steps each, matching boot()'s own sequence.
   Preferences: the mirrored boot set is read synchronously before anything
   renders, so theme and palette match what the pre-paint script in app.html
   already stamped on <html>, then SQLite replaces the lot. Reference data:
   the built-ins are reconciled and the mirror filled at step 3, so the first
   screen to render already has a vocabulary. */

import { boot } from '../data/sqlite/boot';
import type { SqliteDriver } from '../data/sqlite/driver';
import { createWebSqlite } from '../data/sqlite/sqlocal-driver';
import { openJournal, type Journal } from '../data/journal/journal';
import { sweepOrphanPhotos } from '../data/journal/photos';
import { attachJournal, journalIsOpen } from '../data/live/journal.svelte';
import { hydrateReference } from '../data/live/reference.svelte';
import { opfsPhotoFiles, type ListableDirectory } from '../data/photos/opfs-file-store';
import { setPhotoFiles } from './photoFiles';
import { localStorageCache } from '../data/prefs/boot-cache';
import { wipeLocalData } from '../data/reset';
import { openPreferences } from '../data/prefs/preferences';
import { applyCachedBootPreferences, attachPreferences } from '../data/prefs/store.svelte';
import { toast } from './toasts.svelte';
import { demoPreferences } from '../data/demo/persona';
import type { PreferenceKey } from '../data/prefs/catalogue';

export const bootState = $state<{
  status: 'booting' | 'ready' | 'error';
  error: string | null;
  persistDenied: boolean;
  /** The one journal instance the UI reads (ADR-0017), for anything that
      needs the handle itself rather than the reactive layer over it. */
  journal: Journal | null;
}>({
  status: 'booting',
  error: null,
  persistDenied: false,
  journal: null
});

let started = false;
/* Kept for the reset below, which has to close the database before OPFS
   will let go of the file. Nothing else reaches for it: screens go through
   data/live/, and bootState.journal is the handle for everything else. */
let openDriver: SqliteDriver | null = null;
const bootCache = localStorageCache();

/** The forgotten-PIN escape hatch (ADR-0014): wipes what this device holds
    and comes back up at onboarding. Reloads rather than resetting the
    modules in place - boot() has already run, the journal is attached, and
    unwinding all of that in the browser is a far bigger surface than
    starting the page again. */
export async function resetApp(): Promise<void> {
  await wipeLocalData({
    closeDatabase: async () => {
      await openDriver?.close();
    },
    storageRoot: async () => (await navigator.storage.getDirectory()) as ListableDirectory,
    clearBootCache: () => bootCache.clear()
  });
  // replace(), so back doesn't return to the lock screen of a journal that
  // is no longer there.
  location.replace('/');
}

export function startBoot() {
  if (started) return;
  started = true;

  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but persist() is safe to call more than once and asking here
  // covers every save path at once. Worth revisiting when the PWA ticket
  // lands, not by adding a second call.
  const { driver, fileOps, requestPersistentStorage } = createWebSqlite('gender-diary.sqlite3');
  openDriver = driver;

  // Set before boot() rather than after, so the first screen to render a
  // photo already has somewhere to read it from.
  const photoFiles = opfsPhotoFiles();
  setPhotoFiles(photoFiles);

  /* Attached before the migrations run, so the writes step 3 makes below -
     reconciling built-ins - announce themselves like any other. Queries stay
     parked until journalIsOpen(). */
  const journal = attachJournal(openJournal(driver, photoFiles));

  boot({
    createDriver: () => driver,
    fileOps,
    requestPersistentStorage,
    applyBootPreferences: () => applyCachedBootPreferences(bootCache.read()),
    // Step 3: built-ins reconcile on every boot, by key - not seed-if-empty,
    // so a journal can never end up short of one (ADR-0002; ticket 14's
    // Replace calls the same operation before an import applies). Then the
    // mirror is filled from what that left behind (ADR-0004).
    loadReferenceData: async () => {
      await journal.reconcileBuiltIns();
      await hydrateReference(journal);
    },
    // Step 4: after the database is open and migrated, so the rows it
    // compares against are the current ones (ADR-0008).
    sweepOrphanPhotos: (opened) => sweepOrphanPhotos(opened, photoFiles)
  }).then(async (result) => {
    if (result.phase === 'error') {
      bootState.status = 'error';
      bootState.error = String((result.error as Error)?.message ?? result.error);
      return;
    }

    const preferences = await openPreferences(result.driver, bootCache);
    /* The demo persona (Alice, onboarded, her active preset, 150 days of
       entries) is what makes the demo build land on a populated Home rather
       than on onboarding. Gated on the preference table being empty rather
       than on the journal being empty, so the demo bar's "first run" jump -
       which empties the journal on purpose - is not undone by the next
       reload. Dropped whole from a production build (ticket 05). */
    if (__DEMO__ && preferences.openedEmpty()) {
      const { clearJournal, seedPersonaJournal } = await import('../data/demo/journal-seed');
      /* Cleared first, and the preferences written last, so an interrupted
         seed heals itself. Writing the persona is a few thousand statements
         through a worker, and a tab closed part-way through would otherwise
         leave a demo that is permanently half-seeded: the preferences would
         say it had been done, while the journal held only the oldest entries -
         the persona writes 150 days oldest-first, so what goes missing is
         exactly the recent data every screen shows. */
      await clearJournal(journal);
      await seedPersonaJournal(journal);
      for (const [key, value] of Object.entries(demoPreferences()) as [PreferenceKey, never][]) {
        await preferences.set(key, value);
      }
    }
    await attachPreferences(preferences);

    /* Last, so no query runs against a half-written journal. Each of the
       persona's entries bumps the entry version, and announcing that to
       screens that are already mounted would re-run Home's list once per
       seeded entry. */
    journalIsOpen();

    bootState.status = 'ready';
    bootState.persistDenied = result.persistDenied;
    bootState.journal = journal;

    // Raised here rather than from an $effect in +layout.svelte, where it
    // used to live: toast() pushes onto a $state array, and reading that
    // array's length to push made the effect depend on what it was
    // writing, so it re-ran itself until Svelte gave up with
    // effect_update_depth_exceeded. It never fired while opening the
    // database was failing outright, which is how it stayed hidden.
    if (result.persistDenied) {
      toast(
        "This browser didn't grant persistent storage. Export backups regularly so nothing is lost to storage pressure."
      );
    }
  });
}
