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
import { createEncryptedWebSqlite } from '../data/sqlite/mc-driver';
import { InterruptedRestoreError, SchemaTooNewError, type MigrationFileOps } from '../data/sqlite/migration-runner';
import { markJournalBusy } from '../data/journal-busy';
import { openJournal, type Journal } from '../data/journal/journal';
import { sweepOrphanPhotos } from '../data/journal/photos';
import { attachJournal, journalIsOpen } from '../data/live/journal.svelte';
import { hydrateReference } from '../data/live/reference.svelte';
import { opfsPhotoFiles, type ListableDirectory } from '../data/photos/opfs-file-store';
import { encryptedFileStore } from '../data/photos/encrypted-file-store';
import { journalKeystoreExists, setupJournalPassphrase, unlockJournalPassphrase } from '../data/journal-passphrase';
import {
  describeJournalState,
  finishRetirement,
  prepareConversion,
  runConversion,
  type ConversionProgress,
  type ConversionRefusal,
  type JournalSurvey
} from '../data/conversion/conversion';
import { opfsConversionMarker } from '../data/conversion/marker-file';
import {
  plaintextJournalPresent,
  removePlaintextRemnants,
  webConversionPorts,
  webConversionPrecheckPorts
} from '../data/conversion/web-ports';
import { LATEST_SCHEMA_VERSION } from '../data/sqlite/migrations';
import { setPhotoFiles } from './photoFiles';
import { localStorageCache } from '../data/prefs/boot-cache';
import { wipeLocalData } from '../data/reset';
import { openPreferences } from '../data/prefs/preferences';
import { applyCachedBootPreferences, attachPreferences } from '../data/prefs/store.svelte';
import { markUnlocked } from './lock.svelte';
import { toast } from './toasts.svelte';
import { demoPreferences } from '../data/demo/persona';
import type { PreferenceKey } from '../data/prefs/catalogue';

export const bootState = $state<{
  /** The passphrase states come before the database exists for this
      session (ticket 09): `needs-setup` on a first run, `needs-unlock` on
      every later cold start. The layout renders the passphrase gate for
      those, for `converting` and for `conversion-refused`, and
      submitPassphraseSetup/-Unlock below are what move on. */
  /** `schema-too-new` is the rollback direction of ticket 04: this build met
      a Journal a newer one has already migrated, and refuses it rather than
      guessing (ADR-0006). Its own status rather than an `error`, because the
      journal is intact and the screen has something to say about what to do. */
  status:
    | 'booting'
    | 'needs-setup'
    | 'needs-unlock'
    | 'converting'
    | 'conversion-refused'
    | 'ready'
    | 'schema-too-new'
    | 'error';
  error: string | null;
  persistDenied: boolean;
  /** Set when a migration failed and the copy ADR-0006 took beforehand is
      still on disk, so the failure screen can offer to put it back
      (ticket 04). */
  recoverable: boolean;
  /** The one journal instance the UI reads (ADR-0017), for anything that
      needs the handle itself rather than the reactive layer over it. */
  journal: Journal | null;
  /** Set when the Journal on this device is a plaintext one (ticket 10):
      the gate says so, and the passphrase submitted runs the conversion
      before the app opens rather than opening one. Whether this is a first
      attempt or a resume is already in `status` - needs-setup against
      needs-unlock - so it is not repeated here. */
  conversion: { progress: ConversionProgress | null } | null;
  /** Why a conversion cannot even start. The gate owns the wording. */
  conversionRefusal: ConversionRefusal | null;
}>({
  status: 'booting',
  error: null,
  persistDenied: false,
  recoverable: false,
  journal: null,
  conversion: null,
  conversionRefusal: null
});

let started = false;
/* Kept for the reset below, which has to close the database before OPFS
   will let go of the file. Nothing else reaches for it: screens go through
   data/live/, and bootState.journal is the handle for everything else. */
let openDriver: SqliteDriver | null = null;
/** Kept for the same reason, and for the restore below: putting the
    pre-migration copy back is the one recovery a failed boot can offer, and
    it needs the file ops of the driver that failed (ticket 04). */
let openFileOps: MigrationFileOps | null = null;
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

/** Puts the pre-migration copy back as the live Journal and starts the app
    again on it (ticket 04, ADR-0006).

    Reached two ways. From the migration-failure screen, when a person decides
    to go back: what comes back is the Journal as it was before the update that
    could not finish, and if this build still cannot migrate it, the next boot
    lands on the same screen with the copy still in place. The version of Gender
    Diary the Journal came from is what opens it - the honest limit of an in-app
    rollback, and the screen's copy says so.

    And from the boot below, without asking, when a previous restore was
    interrupted part way through. That is not a decision being made twice: it is
    one that was already made, finishing.

    Reloads rather than carrying on: the driver's connection was on the file
    that has just been replaced (mc-driver.ts), and boot() has already run. */
export async function restorePreviousJournal(): Promise<void> {
  if (!openFileOps) throw new Error('there is no failed boot to recover from');
  await openFileOps.restorePreMigrationCopy();
  /* Closed before the reload, the way resetApp does it: the restore left the
     database connection gone but the pool still held, and pauseVfs() is what
     lets go of its access handles so the next boot's worker can acquire them
     (ADR-0020's one connection per origin). */
  await openDriver?.close();
  location.reload();
}

/** In a demo build the passphrase machinery runs for real - keystore,
    wrap, encrypted database - but under a fixed passphrase entered by no
    one, so reviewers and the walkthrough suite land in the journal instead
    of at a setup wall. Folded out of production bundles with the rest of
    the demo (ticket 05). */
const DEMO_PASSPHRASE = 'demo';

export function startBoot() {
  if (started) return;
  started = true;

  /* Before anything async: the passphrase gate is about to render, and it
     should do so in the person's theme and palette, not the defaults. This
     used to be step 1 inside boot(), which now runs only after the gate. */
  applyCachedBootPreferences(bootCache.read());

  (async () => {
    let state = describeJournalState(await surveyJournal());

    /* A conversion that got all the way through and was killed before its
       last few deletes (ticket 10). Nothing here needs a data key, so it
       happens before the gate renders rather than after someone types a
       passphrase: ADR-0018's claim is false for as long as those files are
       readable. */
    if (state === 'retire') {
      await finishRetirement(opfsConversionMarker(), removePlaintextRemnants);
      state = describeJournalState(await surveyJournal());
    }

    if (__DEMO__) {
      if (state === 'convert') {
        /* A demo journal is throwaway by definition - reseeded from the
           persona on every empty boot - so a plaintext leftover from before
           encryption is wiped rather than converted. */
        await wipeLocalData({
          closeDatabase: async () => {},
          storageRoot: async () => (await navigator.storage.getDirectory()) as ListableDirectory,
          clearBootCache: () => bootCache.clear()
        });
        state = 'first-run';
      }

      if (state === 'unlock') {
        /* A reviewer may have changed the demo passphrase in Settings; the
           gate is the honest fallback. */
        try {
          continueBoot(await unlockJournalPassphrase(DEMO_PASSPHRASE));
        } catch {
          bootState.status = 'needs-unlock';
        }
        return;
      }
      continueBoot(await setupJournalPassphrase(DEMO_PASSPHRASE));
      return;
    }

    if (state === 'convert') {
      /* Free space and the schema version, asked before anyone is made to
         choose a passphrase and write it down - ticket 10 refuses clearly
         rather than part way through, and a refusal leaves the plaintext
         Journal exactly as it was. */
      const precheck = await prepareConversion(webConversionPrecheckPorts(), LATEST_SCHEMA_VERSION);
      if (!precheck.ok) {
        bootState.conversionRefusal = precheck;
        bootState.status = 'conversion-refused';
        return;
      }
      /* A keystore already there means an earlier attempt got past the
         passphrase screen, so ask for that passphrase again rather than
         for a new one - the one they saved is still the one. */
      const resuming = await journalKeystoreExists();
      bootState.conversion = { progress: null };
      bootState.status = resuming ? 'needs-unlock' : 'needs-setup';
      return;
    }

    bootState.status = state === 'unlock' ? 'needs-unlock' : 'needs-setup';
  })().catch((error) => {
    bootState.status = 'error';
    bootState.error = String((error as Error)?.message ?? error);
  });
}

/** The three questions that decide what a boot is looking at, asked of the
    files themselves (conversion.ts turns the answers into a state). */
async function surveyJournal(): Promise<JournalSurvey> {
  return {
    keystoreExists: await journalKeystoreExists(),
    plaintextJournalPresent: await plaintextJournalPresent(),
    marker: await opfsConversionMarker().read()
  };
}

/** The setup screen's submit (first run). The passphrase the person just
    chose also opens this session: the casual-access gate has nothing left
    to ask on top of it (spec: app lock may grant shorter access while an
    unlocked key is available - a key unlocked by hand is the strong case). */
export async function submitPassphraseSetup(passphrase: string): Promise<void> {
  const dataKey = await setupJournalPassphrase(passphrase);
  markUnlocked();
  await convertThenBoot(dataKey);
}

/** The unlock screen's submit. Throws DecryptionFailedError back to the
    screen on a wrong passphrase; the screen owns the copy. */
export async function submitPassphraseUnlock(passphrase: string): Promise<void> {
  const dataKey = await unlockJournalPassphrase(passphrase);
  markUnlocked();
  await convertThenBoot(dataKey);
}

/** Between the passphrase and the journal, on a device that still holds a
    plaintext one: the conversion runs to completion first (ticket 10), so
    the app never opens anything but a Journal that has been copied whole
    and verified. A conversion that fails says so in its own words - the
    gate's "that passphrase is not right" would be a lie, and the
    passphrase has already been accepted by the time this runs.

    Not awaited past the conversion: continueBoot() is fire-and-forget by
    design, and the gate only needs its submit to resolve once the screen
    it renders has changed. */
async function convertThenBoot(dataKey: Uint8Array<ArrayBuffer>): Promise<void> {
  if (bootState.conversion === null) {
    continueBoot(dataKey);
    return;
  }

  bootState.status = 'converting';
  /* The longest of the four windows an update must not land in (ticket 04):
     a whole Journal and every photo, rewritten on a phone. The conversion
     survives being killed and resumes, but code replaced under it mid-write
     is not an interruption it can reason about. */
  const converting = markJournalBusy();
  try {
    await runConversion(webConversionPorts(dataKey), (progress) => {
      bootState.conversion = { progress };
    });
  } catch (error) {
    bootState.status = 'error';
    bootState.error = String((error as Error)?.message ?? error);
    return;
  } finally {
    converting();
  }

  bootState.conversion = null;
  continueBoot(dataKey);
}

function continueBoot(dataKey: Uint8Array<ArrayBuffer>) {
  bootState.status = 'booting';

  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but persist() is safe to call more than once and asking here
  // covers every save path at once. Worth revisiting when the PWA ticket
  // lands, not by adding a second call.
  const { driver, fileOps, requestPersistentStorage } = createEncryptedWebSqlite(
    'gender-diary.sqlite3',
    dataKey
  );
  openDriver = driver;
  openFileOps = fileOps;

  // Set before boot() rather than after, so the first screen to render a
  // photo already has somewhere to read it from. Encrypted per file under
  // the same data key as the database (ticket 09): whole-database
  // encryption never reaches files outside SQLite (ADR-0020).
  const photoFiles = encryptedFileStore(opfsPhotoFiles(), dataKey);
  setPhotoFiles(photoFiles);

  /* Attached before the migrations run, so the writes step 3 makes below -
     reconciling built-ins - announce themselves like any other. Queries stay
     parked until journalIsOpen(). */
  const journal = attachJournal(openJournal(driver, photoFiles));

  boot({
    createDriver: () => driver,
    fileOps,
    requestPersistentStorage,
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
      /* The rollback direction (ticket 04): older code has met a Journal a
         newer build already migrated. Not the generic failure, because
         nothing is wrong with the Journal and there is something to do about
         it - the screen says which, in the person's language, rather than
         printing the exception. */
      if (result.error instanceof SchemaTooNewError) {
        bootState.status = 'schema-too-new';
        return;
      }

      /* A restore that was interrupted between unlinking the database and
         writing the copy over it. Finished here rather than shown to anybody,
         the way ticket 10's retirement is: the decision to restore was already
         made, and this is the same operation reaching its end. Doing it once
         and reloading terminates - what comes up is the copy's own schema,
         which is not the empty database that got us here. */
      if (result.error instanceof InterruptedRestoreError) {
        await restorePreviousJournal();
        return;
      }

      bootState.status = 'error';
      bootState.error = String((result.error as Error)?.message ?? result.error);
      /* Whether the failure screen can offer a way back. Asked of the disk
         rather than assumed from the failure: a copy is there only if this
         boot or an earlier one got as far as taking one, and a driver too
         broken to answer is a driver that cannot restore either. */
      bootState.recoverable = await Promise.resolve(fileOps.preMigrationCopyIsUsable()).catch(() => false);
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
