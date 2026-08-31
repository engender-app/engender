/* Runs the real SQLite boot sequence once (ticket 04) and exposes its
   result reactively, so +layout.svelte can show a handled error state
   instead of a blank screen if opening the database or running migrations
   fails. This only runs in the browser (ssr = false).

   It is also the thin app-level module ADR-0017 asks for: the one place that
   constructs the journal over the driver and hands it to the UI. The driver
   stops here - screens reach the journal through data/live/, which is the
   only thing above this file that knows a database is involved at all.

   Since phase 5 audit ticket 14 it decides nothing. boot-machine.ts holds the
   order - web and Android, first run and unlock, conversion, a refused key, a
   schema from a newer build - and this is its adapter: an effect arrives, the
   platform is asked, and what it answered goes back as an event. The reducer's
   state is mirrored into the rune below and read by the layout and the gates
   exactly as before.

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
import { createAndroidSqlite, deleteAndroidDatabase } from '../data/sqlite/android-driver';
import { isAndroid } from '../platform';
import { whenIdle } from '../idle';
import type { MigrationFileOps } from '../data/sqlite/migration-runner';
import { openJournal, type PhotoFileStore } from '../data/journal/journal';
import { purgeExpiredTrash } from '../data/journal/entries';
import { sweepOrphanPhotos } from '../data/journal/photos';
import { attachJournal, journalIsOpen } from '../data/live/journal.svelte';
import { bump } from '../data/live/tableVersions.svelte';
import { tablesWrittenBy } from '../data/live/writes';
import { hydrateReference } from '../data/live/reference.svelte';
import { opfsPhotoFiles, type ListableDirectory } from '../data/photos/opfs-file-store';
import { appPrivatePhotoFiles } from '../data/photos/android-file-store';
import { encryptedFileStore } from '../data/photos/encrypted-file-store';
import {
  addJournalPassphrase,
  setupJournalPassphrase,
  unlockJournalPassphrase
} from '../data/journal-passphrase';
import { addJournalPin, setupJournalPin, unlockJournalPin } from '../data/journal-pin';
import { removeDeviceBindingSecret } from '../data/device-secret';
import {
  addDeviceBoundJournal,
  DeviceBoundKeyUnavailableError,
  removeDeviceBoundJournal,
  setupDeviceBoundJournal
} from '../data/device-bound-journal';
import { removeKeystoreFile } from '../data/keystore-file';
import type { JournalAccessMode } from '../data/journal-access-mode';
import { JOURNAL_DATABASE } from '../data/conversion/web-ports';
import { setPhotoFiles } from './photoFiles';
import { setVideoFiles } from './videoFiles';
import { setVoiceFiles } from './voiceFiles';
import { localStorageCache } from '../data/prefs/boot-cache';
import { clearBrowserMirrors, wipeLocalData } from '../data/reset';
import { androidDeviceReset } from '../data/android-device-reset-bridge';
import { openPreferences } from '../data/prefs/preferences';
import { applyCachedBootPreferences, attachPreferences } from '../data/prefs/store.svelte';
import { markUnlocked } from './lock.svelte';
import { openAndroidDataKey, type UnlockRequest } from '../lock/android-key';
import { androidKeystore } from '../lock/keystore-bridge';
import { toast } from './toasts.svelte';
import { demoPreferences } from '../data/demo/persona';
import type { PreferenceKey } from '../data/prefs/catalogue';
import type { BootState } from './boot-state';
import { performPlatformEffect } from './boot-platform';
import {
  describeError,
  deviceBoundSetupOutcome,
  initialBoot,
  reduce,
  type BootEffect,
  type BootEvent,
  type BootMachine,
  type DeviceBoundSetupResult
} from './boot-machine';

let machine: BootMachine = initialBoot();

export const bootState = $state<BootState>({ ...machine.boot });

/** One event in, the reducer's answer mirrored out, and whatever it asked for
    started. Synchronous on purpose: by the time a caller's dispatch returns,
    the screen it renders has already changed. */
function dispatch(event: BootEvent): void {
  let step;
  try {
    step = reduce(machine, event);
  } catch (error) {
    /* An event that cannot be taken from where the boot is - a second submit
       landing while the first is already converting, say. The gates make it
       hard to reach, but on the way here it surfaced as "that passphrase is
       not right", which is a lie about somebody's journal. The failure screen
       says what actually happened. */
    step = reduce(machine, { type: 'boot-failed', message: describeError(error) });
  }
  machine = step.machine;
  Object.assign(bootState, machine.boot);
  for (const effect of step.effects) void run(effect);
}

/** Any effect that throws is the boot failing. The sequences this replaced
    each ended in a `.catch(failBoot)`; this is the same net, one layer down,
    and it now covers the post-migration steps too. */
async function run(effect: BootEffect): Promise<void> {
  try {
    await perform(effect);
  } catch (error) {
    dispatch({ type: 'boot-failed', message: describeError(error) });
  }
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
    /* The rest of what the phone holds: the three preference files, the
       alarms scheduled off the reminder one, and the Keystore alias the
       backup password is wrapped under. The web keeps none of it. */
    wipeDeviceState: isAndroid() ? () => androidDeviceReset.wipe() : undefined,
    clearBrowserMirrors: () => clearBrowserMirrors(localStorage),
    clearBootCache: () => bootCache.clear()
  });
  /* PIN mode's binding key (data/device-secret.ts). Not covered by the OPFS
     sweep above - it lives in IndexedDB - and a key left behind after a
     reset is key material outliving the journal it belonged to. Warned
     rather than swallowed: the reset carries on either way, and a reset that
     could not take this is worth seeing in a console. */
  await removeDeviceBindingSecret().catch((error) => {
    console.warn('could not remove the PIN binding key during the reset', error);
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

export function startBoot() {
  if (started) return;
  started = true;
  dispatch({ type: 'started', platform: isAndroid() ? 'android' : 'web', demo: __DEMO__ });
}

/** The setup screen's submit (first run). The passphrase the person just
    chose also opens this session: the casual-access gate has nothing left
    to ask on top of it (spec: app lock may grant shorter access while an
    unlocked key is available - a key unlocked by hand is the strong case). */
export async function submitPassphraseSetup(passphrase: string): Promise<void> {
  const dataKey = await setupJournalPassphrase(passphrase);
  dispatch({ type: 'key-obtained', dataKey, accessMode: 'passphrase', unlocked: true });
}

/** The unlock screen's submit. Throws DecryptionFailedError back to the
    screen on a wrong passphrase; the screen owns the copy. */
export async function submitPassphraseUnlock(passphrase: string): Promise<void> {
  const dataKey = await unlockJournalPassphrase(passphrase);
  dispatch({ type: 'key-obtained', dataKey, accessMode: 'passphrase', unlocked: true });
}

/** The setup module's PIN choice (ticket 53). The PIN just chosen also opens
    this session, the same way a chosen passphrase does. */
export async function submitPinSetup(pin: string): Promise<void> {
  const dataKey = await setupJournalPin(pin);
  dispatch({ type: 'key-obtained', dataKey, accessMode: 'pin', unlocked: true });
}

/** The PIN gate's submit. Throws DecryptionFailedError on a wrong PIN and
    DeviceBindingUnavailableError when this browser has lost the key the PIN
    was bound to; the gate owns both sentences, and they are different
    sentences because only one of them is worth retyping for. */
export async function submitPinUnlock(pin: string): Promise<void> {
  const dataKey = await unlockJournalPin(pin);
  dispatch({ type: 'key-obtained', dataKey, accessMode: 'pin', unlocked: true });
}

/** The setup module's device-bound choice (ADR-0018, ADR-0041). Whether the
    platform would mint the key is the screen's answer to render, not a boot
    transition - a refusal leaves the module exactly where it was.

    This was `submitSkipSetup` until ticket 53. Device-bound is one of the
    module's equal choices now rather than the way past a wall, and the name
    was the last place the old framing survived. */
export async function submitDeviceBoundSetup(): Promise<DeviceBoundSetupResult> {
  if (isAndroid()) {
    const result = await openAndroidDataKey(androidKeystore, {
      title: '',
      subtitle: '',
      cancel: '',
      deviceCredential: false
    });
    const outcome = deviceBoundSetupOutcome(result);
    /* The one place a refusal is not dispatched: this is an offer on the
       setup module, and turning it down leaves the module exactly where it
       was with an answer for the screen. */
    if (result.kind !== 'key') return outcome;
    dispatch({ type: 'android-key-answered', result });
    return outcome;
  }

  try {
    const dataKey = await setupDeviceBoundJournal();
    dispatch({ type: 'key-obtained', dataKey, accessMode: 'device-bound', unlocked: true });
    return 'ok';
  } catch (error) {
    if (error instanceof DeviceBoundKeyUnavailableError) return 'device-bound-unavailable';
    throw error;
  }
}

/** Changing access mode with the journal already open (ticket 53's Settings
    screen). The data key is in memory, so every direction is a rewrap of the
    same key: the journal is never re-encrypted and the change is instant
    whatever the journal's size.

    Write-then-clear, in that order, because the order is the crash safety.
    A new keystore lands before the old material goes, and
    chooseJournalAccessMode prefers a secret keystore over leftover
    device-bound material - so an interruption anywhere in here leaves a
    journal that still opens, under one mode or the other, never neither. */
export async function changeAccessMode(target: Exclude<JournalAccessMode, null>, secret: string): Promise<void> {
  if (sessionDataKey === null) throw new Error('there is no open journal key to wrap');

  if (target === 'device-bound') {
    /* Android's Keystore bridge mints its own data key and cannot be asked
       to wrap this one, so this direction is web-only and the settings
       screen does not offer it on a phone. */
    if (isAndroid()) throw new Error('changing to device-bound mode is not available on Android');
    await addDeviceBoundJournal(sessionDataKey);
    /* The removal is awaited before the change is reported, and a failure is
       allowed to throw. Reporting first would have said "changed" while the
       keystore was still on disk, and chooseJournalAccessMode prefers a
       keystore - so the next boot would have asked for the old secret again,
       with a toast in the person's memory saying it had moved. Failing here
       leaves the old mode working and the screen able to say so. */
    await removeKeystoreFile();
    dispatch({ type: 'access-mode-changed', accessMode: 'device-bound' });
    await removeDeviceBindingSecret().catch((error) => {
      console.warn('could not remove the PIN binding key after moving to device-bound mode', error);
    });
    return;
  }

  if (target === 'pin') await addJournalPin(sessionDataKey, secret);
  else await addJournalPassphrase(sessionDataKey, secret);
  dispatch({ type: 'access-mode-changed', accessMode: target });

  /* PIN mode keeps its own binding key, so only a move *away* from it clears
     one. Everything else here is the previous mode's leftovers. */
  if (target !== 'pin') {
    await removeDeviceBindingSecret().catch((error) => {
      console.warn('could not remove the PIN binding key after changing access mode', error);
    });
  }
  if (isAndroid()) {
    await androidKeystore.erase().catch((error) => {
      console.warn('could not erase the Android device-bound key after changing access mode', error);
    });
    return;
  }
  await removeDeviceBoundJournal().catch((error) => {
    console.warn('could not remove the browser device-bound key after changing access mode', error);
  });
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
    dispatch({ type: 'boot-failed', message: describeError(error) });
    return;
  }

  dispatch({ type: 'android-key-answered', result });
}

/** The effects that need a rune, an open journal or a driver this module is
    holding. Everything else is the platform's side of the boot and lives in
    boot-platform.ts. */
async function perform(effect: BootEffect): Promise<void> {
  switch (effect.type) {
    case 'apply-cached-preferences':
      applyCachedBootPreferences(bootCache.read());
      return;

    case 'mark-unlocked':
      markUnlocked();
      return;

    case 'open-journal':
      await openAndBoot(effect.dataKey);
      return;

    case 'restore-previous-journal':
      await restorePreviousJournal();
      return;

    /* Whether the failure screen can offer a way back. Asked of the disk
       rather than assumed from the failure: a copy is there only if this boot
       or an earlier one got as far as taking one, and a driver too broken to
       answer is a driver that cannot restore either. */
    case 'check-pre-migration-copy':
      dispatch({
        type: 'pre-migration-copy-checked',
        usable:
          openFileOps === null
            ? false
            : await Promise.resolve(openFileOps.preMigrationCopyIsUsable()).catch(() => false)
      });
      return;

    case 'warn-persist-denied':
      // Raised here rather than from an $effect in +layout.svelte, where it
      // used to live: toast() pushes onto a $state array, and reading that
      // array's length to push made the effect depend on what it was
      // writing, so it re-ran itself until Svelte gave up with
      // effect_update_depth_exceeded. It never fired while opening the
      // database was failing outright, which is how it stayed hidden.
      toast(
        "This browser didn't grant persistent storage. Export backups regularly so nothing is lost to storage pressure."
      );
      return;

    default:
      await performPlatformEffect(effect, dispatch);
  }
}

/** The driver and the file store this platform opens a journal with. The last
    place either platform is named: everything past it is ADR-0017's seam,
    where nothing knows which one it is on. */
function journalPorts(dataKey: Uint8Array<ArrayBuffer>): { sqlite: WebSqlite; photoFiles: PhotoFileStore } {
  if (isAndroid()) {
    return {
      sqlite: createAndroidSqlite(JOURNAL_DATABASE, dataKey),
      photoFiles: encryptedFileStore(appPrivatePhotoFiles(), dataKey)
    };
  }
  return {
    sqlite: createEncryptedWebSqlite(JOURNAL_DATABASE, dataKey),
    // Encrypted per file under the same data key as the database (ticket
    // 09): whole-database encryption never reaches files outside SQLite
    // (ADR-0020).
    photoFiles: encryptedFileStore(opfsPhotoFiles(), dataKey)
  };
}

/** Everything both platforms do once they have a data key: the journal is
    constructed over a driver, boot() runs its sequence, and how it ended goes
    back to the reducer as an event. */
async function openAndBoot(dataKey: Uint8Array<ArrayBuffer>): Promise<void> {
  sessionDataKey = dataKey;
  const { sqlite, photoFiles } = journalPorts(dataKey);

  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but persist() is safe to call more than once and asking here
  // covers every save path at once. Worth revisiting when the PWA ticket
  // lands, not by adding a second call.
  const { driver, fileOps, requestPersistentStorage } = sqlite;
  openDriver = driver;
  openFileOps = fileOps;

  // Set before boot() rather than after, so the first screen to render a
  // photo already has somewhere to read it from.
  setPhotoFiles(photoFiles);
  // Same underlying store (journal.ts's PhotoFileStore covers any opaque
  // blob, recordings and video notes included) - separate setters because
  // VoicePlayer.svelte, VideoNotePlayer.svelte and PhotoThumb.svelte each
  // read a different kind of file.
  setVoiceFiles(photoFiles);
  setVideoFiles(photoFiles);

  /* Attached before the migrations run, so the writes step 3 makes below -
     reconciling built-ins - announce themselves like any other. Queries stay
     parked until journalIsOpen(). */
  const journal = attachJournal(openJournal(driver, photoFiles));

  const result = await boot({
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
    /* Step 4: after the database is open and migrated, so the rows it
       compares against are the current ones (ADR-0008), and behind an idle
       callback since phase 5 audit ticket 02 - nothing on screen reads what
       either pass produces, and both grow with the journal.

       Which is also why the purge announces itself: it now runs with the
       screens already live, so a Trash list somebody is looking at would
       otherwise keep showing entries the purge has taken. It announces
       deleteEntry's own tables, asked of writes.ts rather than listed again
       here, because that is the delete this is finishing. The sweep needs no
       announcement - it only ever removes files no row references. */
    purgeExpiredTrash: async (opened) => {
      const reclaimed = await purgeExpiredTrash(opened, photoFiles);
      if (reclaimed > 0) bump(tablesWrittenBy('entries', 'deleteEntry'));
    },
    sweepOrphanPhotos: (opened) => sweepOrphanPhotos(opened, photoFiles),
    scheduleHousekeeping: whenIdle
  });

  if (result.phase === 'error') {
    dispatch({ type: 'journal-open-failed', error: result.error });
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

  dispatch({ type: 'journal-opened', journal, persistDenied: result.persistDenied });
}
