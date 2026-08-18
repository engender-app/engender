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
import type { WebSqlite } from '../data/sqlite/sqlocal-driver';
import { createEncryptedWebSqlite } from '../data/sqlite/mc-driver';
import {
  androidJournalIsPlaintext,
  createAndroidSqlite,
  deleteAndroidDatabase
} from '../data/sqlite/android-driver';
import { isAndroid } from '../platform';
import { InterruptedRestoreError, SchemaTooNewError, type MigrationFileOps } from '../data/sqlite/migration-runner';
import { markJournalBusy } from '../data/journal-busy';
import { openJournal, type PhotoFileStore } from '../data/journal/journal';
import { sweepOrphanPhotos } from '../data/journal/photos';
import { attachJournal, journalIsOpen } from '../data/live/journal.svelte';
import { hydrateReference } from '../data/live/reference.svelte';
import { opfsPhotoFiles, type ListableDirectory } from '../data/photos/opfs-file-store';
import { appPrivatePhotoFiles } from '../data/photos/android-file-store';
import { encryptedFileStore } from '../data/photos/encrypted-file-store';
import { addJournalPassphrase, journalKeystoreExists, setupJournalPassphrase, unlockJournalPassphrase } from '../data/journal-passphrase';
import {
  deviceBoundJournalExists,
  DeviceBoundKeyUnavailableError,
  removeDeviceBoundJournal,
  setupDeviceBoundJournal,
  unlockDeviceBoundJournal
} from '../data/device-bound-journal';
import {
  chooseJournalAccessMode,
  describeAndroidBootPlan,
  describeWebBootPlan,
  type JournalAccessMode
} from '../data/journal-access-mode';
import {
  describeJournalState,
  finishRetirement,
  prepareConversion,
  runConversion,
  type JournalSurvey
} from '../data/conversion/conversion';
import { opfsConversionMarker } from '../data/conversion/marker-file';
import {
  JOURNAL_DATABASE,
  plaintextJournalPresent,
  removePlaintextRemnants,
  webConversionPorts,
  webConversionPrecheckPorts
} from '../data/conversion/web-ports';
import { LATEST_SCHEMA_VERSION } from '../data/sqlite/migrations';
import { setPhotoFiles } from './photoFiles';
import { setVoiceFiles } from './voiceFiles';
import { localStorageCache } from '../data/prefs/boot-cache';
import { wipeLocalData } from '../data/reset';
import { openPreferences } from '../data/prefs/preferences';
import { applyCachedBootPreferences, attachPreferences } from '../data/prefs/store.svelte';
import { markUnlocked } from './lock.svelte';
import { openAndroidDataKey, type UnlockRequest } from '../lock/android-key';
import { androidKeystore } from '../lock/keystore-bridge';
import { toast } from './toasts.svelte';
import { demoPreferences } from '../data/demo/persona';
import type { PreferenceKey } from '../data/prefs/catalogue';
import { bootStates, bootTransitions, type BootState } from './boot-state';

export const bootState = $state<BootState>(bootStates.booting());

function applyBootState(next: BootState): void {
  Object.assign(bootState, next);
}

let started = false;
/* Kept for the reset below, which has to close the database before OPFS
   will let go of the file. Nothing else reaches for it: screens go through
   data/live/, and bootState.journal is the handle for everything else. */
let openDriver: SqliteDriver | null = null;
let sessionDataKey: Uint8Array<ArrayBuffer> | null = null;
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
    /* Android keeps the journal and the wrapped data key in app-private
       storage rather than in the WebView's, so emptying the OPFS root - all
       the web's reset has to do - reaches neither (ticket 13). Erasing only
       the key would be worse than doing nothing: the ciphertext would stay,
       unopenable, and the next boot would mint a fresh key and meet a
       database it cannot read. */
    wipePlatformStorage: isAndroid()
      ? async () => {
          await deleteAndroidDatabase();
          await androidKeystore.erase();
        }
      : undefined,
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

type SkipSetupResult = 'ok' | 'needs-device-lock' | 'device-bound-unavailable';

export function startBoot() {
  if (started) return;
  started = true;

  /* Before anything async: the passphrase gate is about to render, and it
     should do so in the person's theme and palette, not the defaults. This
     used to be step 1 inside boot(), which now runs only after the gate. */
  applyCachedBootPreferences(bootCache.read());

  /* Android takes none of what follows (ticket 11). The survey below asks
     OPFS what an earlier web install left there, and the states it can
     return - convert, retire, unlock - are all about the web keystore and
     the plaintext journal that predated it. A phone has neither: this is
     the first build that runs on one. */
  if (isAndroid()) {
    continueBootOnAndroid();
    return;
  }

  (async () => {
    const passphraseKeystoreExists = await journalKeystoreExists();
    const deviceBoundKeystoreExists = await deviceBoundJournalExists();
    applyBootState(
      bootTransitions.setAccessMode(
        bootState,
        chooseJournalAccessMode({ passphraseKeystoreExists, deviceBoundKeystoreExists })
      )
    );

    let state = describeJournalState({
      keystoreExists: passphraseKeystoreExists || deviceBoundKeystoreExists,
      plaintextJournalPresent: await plaintextJournalPresent(),
      marker: await opfsConversionMarker().read()
    });

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
          continueBoot(await unlockJournalPassphrase(DEMO_PASSPHRASE), 'passphrase');
        } catch {
          applyBootState(bootTransitions.toNeedsUnlock(bootState));
        }
        return;
      }
      continueBoot(await setupJournalPassphrase(DEMO_PASSPHRASE), 'passphrase');
      return;
    }

    if (state === 'convert') {
      /* Free space and the schema version, asked before anyone is made to
         choose a passphrase and write it down - ticket 10 refuses clearly
         rather than part way through, and a refusal leaves the plaintext
         Journal exactly as it was. */
      const precheck = await prepareConversion(webConversionPrecheckPorts(), LATEST_SCHEMA_VERSION);
      if (!precheck.ok) {
        applyBootState(bootTransitions.toConversionRefused(bootState, precheck));
        return;
      }
      /* A keystore already there means an earlier attempt got past the
         passphrase screen, so ask for that passphrase again rather than
         for a new one - the one they saved is still the one. */
      const resuming = await journalKeystoreExists();
      applyBootState(
        resuming
          ? bootTransitions.toNeedsUnlock(bootState, { accessMode: 'passphrase', conversionRequired: true })
          : bootTransitions.toNeedsSetup(bootState, { accessMode: 'passphrase', conversionRequired: true })
      );
      return;
    }

    const plan = describeWebBootPlan({
      passphraseKeystoreExists,
      deviceBoundKeystoreExists,
      plaintextJournalPresent: false,
      marker: null
    });

    if (plan === 'auto-unlock') {
      try {
        continueBoot(await unlockDeviceBoundJournal(), 'device-bound');
      } catch (error) {
        if (error instanceof DeviceBoundKeyUnavailableError) {
          applyBootState(bootTransitions.toNeedsDeviceRecovery(bootState));
          return;
        }
        throw error;
      }
      return;
    }

    applyBootState(
      plan === 'needs-unlock'
        ? bootTransitions.toNeedsUnlock(bootState)
        : bootTransitions.toNeedsSetup(bootState)
    );
  })().catch(failBoot);
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
  await convertThenBoot(dataKey, 'passphrase');
}

/** The unlock screen's submit. Throws DecryptionFailedError back to the
    screen on a wrong passphrase; the screen owns the copy. */
export async function submitPassphraseUnlock(passphrase: string): Promise<void> {
  const dataKey = await unlockJournalPassphrase(passphrase);
  markUnlocked();
  await convertThenBoot(dataKey, 'passphrase');
}

export async function submitSkipSetup(): Promise<SkipSetupResult> {
  if (isAndroid()) {
    const result = await openAndroidDataKey(androidKeystore, {
      title: '',
      subtitle: '',
      cancel: '',
      deviceCredential: false
    });
    if (result.kind !== 'key') {
      return result.kind === 'refused' && result.authentication.wayForward === 'setDeviceLock'
        ? 'needs-device-lock'
        : 'device-bound-unavailable';
    }
    markUnlocked();
    continueBoot(result.dataKey, 'device-bound');
    return 'ok';
  }

  try {
    const dataKey = await setupDeviceBoundJournal();
    markUnlocked();
    continueBoot(dataKey, 'device-bound');
    return 'ok';
  } catch (error) {
    if (error instanceof DeviceBoundKeyUnavailableError) return 'device-bound-unavailable';
    throw error;
  }
}

export async function upgradeJournalToPassphrase(passphrase: string): Promise<void> {
  if (sessionDataKey === null) throw new Error('there is no open journal key to wrap');
  await addJournalPassphrase(sessionDataKey, passphrase);
  applyBootState(bootTransitions.setAccessMode(bootState, 'passphrase'));
  if (isAndroid()) {
    await androidKeystore.erase().catch((error) => {
      console.warn('could not erase the Android device-bound key after adding a passphrase', error);
    });
    return;
  }
  await removeDeviceBoundJournal().catch((error) => {
    console.warn('could not remove the browser device-bound key after adding a passphrase', error);
  });
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
async function convertThenBoot(dataKey: Uint8Array<ArrayBuffer>, accessMode: JournalAccessMode): Promise<void> {
  if (bootState.conversion === null) {
    continueBoot(dataKey, accessMode);
    return;
  }

  applyBootState(bootTransitions.toConverting(bootState));
  /* The longest of the four windows an update must not land in (ticket 04):
     a whole Journal and every photo, rewritten on a phone. The conversion
     survives being killed and resumes, but code replaced under it mid-write
     is not an interruption it can reason about. */
  const converting = markJournalBusy();
  try {
    await runConversion(webConversionPorts(dataKey), (progress) => {
      applyBootState(bootTransitions.updateConversionProgress(bootState, progress));
    });
  } catch (error) {
    failBoot(error);
    return;
  } finally {
    converting();
  }

  continueBoot(dataKey, accessMode);
}

function continueBoot(dataKey: Uint8Array<ArrayBuffer>, accessMode: JournalAccessMode) {
  sessionDataKey = dataKey;
  applyBootState(bootTransitions.setAccessMode(bootState, accessMode));
  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but persist() is safe to call more than once and asking here
  // covers every save path at once. Worth revisiting when the PWA ticket
  // lands, not by adding a second call.
  if (isAndroid()) {
    openAndBoot(
      createAndroidSqlite(JOURNAL_DATABASE, dataKey),
      encryptedFileStore(appPrivatePhotoFiles(), dataKey)
    );
    return;
  }

  openAndBoot(
    createEncryptedWebSqlite(JOURNAL_DATABASE, dataKey),
    // Encrypted per file under the same data key as the database (ticket
    // 09): whole-database encryption never reaches files outside SQLite
    // (ADR-0020).
    encryptedFileStore(opfsPhotoFiles(), dataKey)
  );
}

/** The Android shell's boot (ticket 13). Where the web asks for a passphrase
    and unwraps a keystore file with it, this asks Android Keystore, which
    holds the wrapping key itself and will not use it until the platform says
    somebody authenticated (ADR-0018).

    A first run is silent - the wrap needs no authentication, so there is no
    prompt about a Journal that does not exist yet - and lands in the app.
    Every later run stops here and hands over to the gate, because the prompt
    is Android's own UI and its words have to come from the catalogue.

    The `void` is the same fire-and-forget continueBoot() is: what the caller
    needs is that the screen has changed, and every failure below sets a
    status rather than throwing. */
function continueBootOnAndroid() {
  void (async () => {
    const passphraseKeystoreExists = await journalKeystoreExists();
    const { hasKey } = await androidKeystore.status();
    applyBootState(
      bootTransitions.setAccessMode(
        bootState,
        chooseJournalAccessMode({
          passphraseKeystoreExists,
          deviceBoundKeystoreExists: hasKey
        })
      )
    );

    const plan = describeAndroidBootPlan({
      passphraseKeystoreExists,
      nativeDeviceKeyExists: hasKey,
      plaintextJournalPresent: await androidJournalIsPlaintext(JOURNAL_DATABASE)
    });

    if (plan === 'plaintext-error') {
      /* Rendered through i18n in +layout: this path is expected and needs a
         user sentence, not a raw SQLite failure string. */
      applyBootState(bootTransitions.toError(bootState, 'android-plaintext-journal'));
      return;
    }

    if (plan === 'needs-unlock') {
      applyBootState(bootTransitions.toNeedsUnlock(bootState));
      return;
    }

    if (plan === 'needs-authentication') {
      applyBootState(bootTransitions.toNeedsAuthentication(bootState));
      return;
    }

    applyBootState(bootTransitions.toNeedsSetup(bootState));
  })().catch(failBoot);
}

/** The Android gate's submit, and the first run's own call. Asks Keystore for
    the data key and either opens the Journal under it or leaves the gate
    something to say (ticket 13).

    The prompt copy arrives from the component rather than being read here:
    Android draws the dialog, so its words are UI copy and belong in the
    catalogue with the rest of it. */
export async function openAndroidJournal(request: UnlockRequest): Promise<void> {
  let result;
  try {
    result = await openAndroidDataKey(androidKeystore, request);
  } catch (error) {
    /* The bridge itself failed - no plugin, no keystore, a platform that
       threw. Not a refusal with a way forward, so it goes to the boot error
       screen rather than being dressed up as one. */
    failBoot(error);
    return;
  }

  if (result.kind !== 'key') {
    applyBootState(bootTransitions.toNeedsAuthentication(bootState, result));
    return;
  }

  /* The authentication that unwrapped the key satisfies the casual-access
     gate too, the same way a typed passphrase does on the web: this is the
     strong case the spec allows app lock to stand down for. */
  markUnlocked();
  continueBoot(result.dataKey, 'device-bound');
}

function failBoot(error: unknown) {
  applyBootState(bootTransitions.toError(bootState, String((error as Error)?.message ?? error)));
}

/** Everything both platforms do once they have a driver: the journal is
    constructed over it, boot() runs its sequence, and the UI is handed the
    result. Nothing below this point knows which platform it is on, which is
    ADR-0017's seam doing its job. */
function openAndBoot(sqlite: WebSqlite, photoFiles: PhotoFileStore) {
  applyBootState(bootTransitions.toBooting(bootState));

  const { driver, fileOps, requestPersistentStorage } = sqlite;
  openDriver = driver;
  openFileOps = fileOps;

  // Set before boot() rather than after, so the first screen to render a
  // photo already has somewhere to read it from.
  setPhotoFiles(photoFiles);
  // Same underlying store (journal.ts's PhotoFileStore covers any opaque
  // blob, recordings included) - a second setter because VoicePlayer.svelte
  // reads a different kind of file than PhotoThumb.svelte does.
  setVoiceFiles(photoFiles);

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
        applyBootState(bootTransitions.toSchemaTooNew(bootState));
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

      applyBootState(bootTransitions.toError(bootState, String((result.error as Error)?.message ?? result.error)));
      /* Whether the failure screen can offer a way back. Asked of the disk
         rather than assumed from the failure: a copy is there only if this
         boot or an earlier one got as far as taking one, and a driver too
         broken to answer is a driver that cannot restore either. */
      applyBootState(
        bootTransitions.markErrorRecoverable(
          bootState,
          await Promise.resolve(fileOps.preMigrationCopyIsUsable()).catch(() => false)
        )
      );
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

    applyBootState(
      bootTransitions.toReady(bootState, {
        persistDenied: result.persistDenied,
        journal
      })
    );

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
