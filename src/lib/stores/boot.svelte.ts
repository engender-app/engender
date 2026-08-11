/* Runs the real SQLite boot sequence once (ticket 04) and exposes its
   result reactively, so +layout.svelte can show a handled error state
   instead of a blank screen if opening the database or running migrations
   fails. This only runs in the browser (ssr = false).

   It is also the thin app-level module ADR-0017 asks for: the one place
   that constructs a module over the driver and hands it to the UI. Today
   that is preferences; the journal joins it in ticket 07.

   Preferences arrive in two steps, matching boot()'s own sequence. Step 1
   reads the mirrored boot set synchronously, before anything renders, so
   theme and palette match what the pre-paint script in app.html already
   stamped on <html>. Step 2 replaces the lot with what SQLite holds. */

import { boot } from '../data/sqlite/boot';
import { createWebSqlite } from '../data/sqlite/sqlocal-driver';
import { openJournal, type Journal } from '../data/journal/journal';
import { sweepOrphanPhotos } from '../data/journal/photos';
import { opfsPhotoFiles } from '../data/photos/opfs-file-store';
import { setPhotoFiles } from './photoFiles';
import { localStorageCache } from '../data/prefs/boot-cache';
import { openPreferences } from '../data/prefs/preferences';
import { applyCachedBootPreferences, attachPreferences } from '../data/prefs/store.svelte';
import { toast } from './toasts.svelte';
import { demoPreferences } from '../data/demo/persona';
import type { PreferenceKey } from '../data/prefs/catalogue';
import type { SqliteDriver } from '../data/sqlite/driver';

export const bootState = $state<{
  status: 'booting' | 'ready' | 'error';
  error: string | null;
  persistDenied: boolean;
  driver: SqliteDriver | null;
  /** The one journal instance the UI reads (ADR-0017). Ticket 08's query
      layer takes over as the only consumer; the driver stops being
      exposed then. */
  journal: Journal | null;
}>({
  status: 'booting',
  error: null,
  persistDenied: false,
  driver: null,
  journal: null
});

let started = false;

export function startBoot() {
  if (started) return;
  started = true;

  const cache = localStorageCache();

  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but there is no save path yet (repositories move onto this
  // driver in ticket 07), and persist() is safe to call more than once,
  // so this asks once here as a stand-in. Move this call to the real
  // first-save moment once ticket 07 adds one, rather than adding a
  // second call there.
  const { driver, fileOps, requestPersistentStorage } = createWebSqlite('gender-diary.sqlite3');

  // Set before boot() rather than after, so the first screen to render a
  // photo already has somewhere to read it from.
  const photoFiles = opfsPhotoFiles();
  setPhotoFiles(photoFiles);

  boot({
    createDriver: () => driver,
    fileOps,
    requestPersistentStorage,
    applyBootPreferences: () => applyCachedBootPreferences(cache.read()),
    // Step 4 of the sequence: after the database is open and migrated, so
    // the rows it compares against are the current ones (ADR-0008).
    sweepOrphanPhotos: (opened) => sweepOrphanPhotos(opened, photoFiles)
  }).then(async (result) => {
    if (result.phase === 'error') {
      bootState.status = 'error';
      bootState.error = String((result.error as Error)?.message ?? result.error);
      return;
    }

    // Built-ins reconcile on every boot, by key - not seed-if-empty, so a
    // journal can never end up short of one (ADR-0002; ticket 14's Replace
    // calls the same operation before an import applies).
    const journal = openJournal(result.driver, photoFiles);
    await journal.reconcileBuiltIns();

    const preferences = await openPreferences(result.driver, cache);
    // The demo persona's preferences (Alice, onboarded, her active preset)
    // are what make the demo build land on a populated Home rather than on
    // onboarding. Ticket 05 moves this behind the dev-only persona module
    // along with the rest of the persona.
    if (__DEMO__ && preferences.openedEmpty()) {
      for (const [key, value] of Object.entries(demoPreferences()) as [PreferenceKey, never][]) {
        await preferences.set(key, value);
      }
    }
    await attachPreferences(preferences);

    bootState.status = 'ready';
    bootState.persistDenied = result.persistDenied;
    bootState.driver = result.driver;
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
