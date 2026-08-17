/* Ticket 17 (phase 2): one archive format, both directions.

   This probe runs inside the Android app's WebView and boots both storage
   implementations there: the web stack (OPFS + SQLocal/sqlite3mc) and the
   Android stack (the Capacitor SQLCipher bridge + app-private files). It
   then proves archive round-trips both ways, under both encryption layouts:

     1) both journals encrypted
     2) only one encrypted (web encrypted, Android plaintext)

   The checks mirror ticket 17's acceptance lines directly: rows and photos,
   merge/replace behaviour, portable preferences, device-local preferences,
   and wrong-password wording parity. */

import { boot } from '../../../src/lib/data/sqlite/boot.ts';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver.ts';
import { createEncryptedWebSqlite } from '../../../src/lib/data/sqlite/mc-driver.ts';
import { createWebSqlite } from '../../../src/lib/data/sqlite/sqlocal-driver.ts';
import { openJournal, type Journal } from '../../../src/lib/data/journal/journal.ts';
import { appPrivatePhotoFiles } from '../../../src/lib/data/photos/android-file-store.ts';
import { encryptedFileStore } from '../../../src/lib/data/photos/encrypted-file-store.ts';
import { opfsPhotoFiles } from '../../../src/lib/data/photos/opfs-file-store.ts';
import { openArchive, packArchive } from '../../../src/lib/data/archive/pack.ts';
import { collect } from '../../../src/lib/data/archive/container.ts';
import { PREFERENCE_DEFAULTS, type PreferenceValues } from '../../../src/lib/data/prefs/catalogue.ts';
import { openPreferences } from '../../../src/lib/data/prefs/preferences.ts';
import type { SqliteDriver } from '../../../src/lib/data/sqlite/driver.ts';
import type { PhotoFileStore } from '../../../src/lib/data/journal/journal.ts';
import { DecryptionFailedError } from '../../../src/lib/crypto/aesGcm.ts';

declare global {
  interface Window {
    __archiveCrossResult?: unknown;
  }
}

const PASSWORD = 'cross-platform-pass';

const WEB_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => (i * 3 + 11) & 0xff));
const ANDROID_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => (i * 5 + 17) & 0xff));

const bytes = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

function bytesEqual(a: Uint8Array | null, b: Uint8Array) {
  if (!a || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function* oneShot(input: Uint8Array): AsyncGenerator<Uint8Array> {
  yield input;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function record(checks: Check[], name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
}

interface Handle {
  driver: SqliteDriver;
  journal: Journal;
  files: PhotoFileStore;
  close(): Promise<void>;
}

async function openHandle(
  kind: 'web' | 'android',
  encrypted: boolean,
  databaseName: string,
  photoRoot: string
): Promise<Handle> {
  if (kind === 'web') {
    const sqlite = encrypted ? createEncryptedWebSqlite(databaseName, WEB_KEY) : createWebSqlite(databaseName);
    const files = encrypted ? encryptedFileStore(opfsPhotoFiles(photoRoot), WEB_KEY) : opfsPhotoFiles(photoRoot);
    const booted = await boot({ createDriver: () => sqlite.driver, fileOps: sqlite.fileOps, requestPersistentStorage: sqlite.requestPersistentStorage });
    if (booted.phase === 'error') throw booted.error;
    const journal = openJournal(booted.driver, files);
    await journal.reconcileBuiltIns();
    return { driver: booted.driver, journal, files, close: () => booted.driver.close() };
  }

  const sqlite = createAndroidSqlite(databaseName, encrypted ? ANDROID_KEY : undefined);
  const files = encrypted ? encryptedFileStore(appPrivatePhotoFiles(photoRoot), ANDROID_KEY) : appPrivatePhotoFiles(photoRoot);
  const booted = await boot({ createDriver: () => sqlite.driver, fileOps: sqlite.fileOps, requestPersistentStorage: sqlite.requestPersistentStorage });
  if (booted.phase === 'error') throw booted.error;
  const journal = openJournal(booted.driver, files);
  await journal.reconcileBuiltIns();
  return { driver: booted.driver, journal, files, close: () => booted.driver.close() };
}

async function seedSource(journal: Journal, files: PhotoFileStore, marker: string) {
  const group = await journal.tags.addGroup(`Appointments ${marker}`);
  const customTag = await journal.tags.addTag(group.key, `endo-${marker}`);

  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: `cross-note-${marker}`,
    dims: { femininity: 60 },
    tags: ['e-happy', customTag.id]
  });

  const entryPhoto = await journal.photos.attach({ entryId }, { full: bytes(`entry-full-${marker}`), thumb: bytes(`entry-thumb-${marker}`) });

  const milestoneId = await journal.milestones.upsertMilestone({ name: `HRT-${marker}`, epochDay: 19000 });
  const milestonePhoto = await journal.photos.attach(
    { milestoneId },
    { full: bytes(`milestone-full-${marker}`), thumb: bytes(`milestone-thumb-${marker}`) }
  );

  await journal.labs.upsertResult({ epochDay: 20000, analyte: `estradiol-${marker}`, value: 412.5, unit: 'pmol/L' });
  await journal.reminders.upsertReminder({
    title: `reminder-${marker}`,
    type: 'med',
    time: '09:30',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true
  });

  const snapshot = await journal.archive.snapshot();
  return {
    entryNote: `cross-note-${marker}`,
    customTag: customTag.id,
    analyte: `estradiol-${marker}`,
    reminder: `reminder-${marker}`,
    milestone: `HRT-${marker}`,
    entryPhotoName: `${entryPhoto}.jpg`,
    milestonePhotoName: `${milestonePhoto}.jpg`,
    sourceFileCount: snapshot.files.length,
    sourceEntryCount: snapshot.journal.entries.length
  };
}

async function seedTargetLocalState(driver: SqliteDriver, journal: Journal, marker: string) {
  await journal.entries.upsertEntry({ epochDay: 20999, mood: 2, note: `target-only-${marker}` });
  const prefs = await openPreferences(driver);
  await prefs.set('onboarded', true);
  await prefs.set('pinHash', `pin-${marker}`);
  await prefs.set('appLock', true);
  await prefs.set('lockOnLeave', true);
  await prefs.set('disguise', true);
  await prefs.set('quickExit', true);
  await prefs.set('hideNotificationTitles', true);
  await prefs.set('autoExportEnabled', true);
  await prefs.set('autoExportSchedule', 'monthly');
  await prefs.set('lastBackupAt', 1_706_000_000_000);
  await prefs.set('backupNoticeDismissed', true);
}

async function readLocalPrefs(driver: SqliteDriver) {
  const prefs = await openPreferences(driver);
  return {
    onboarded: prefs.get('onboarded'),
    pinHash: prefs.get('pinHash'),
    appLock: prefs.get('appLock'),
    lockOnLeave: prefs.get('lockOnLeave'),
    disguise: prefs.get('disguise'),
    quickExit: prefs.get('quickExit'),
    hideNotificationTitles: prefs.get('hideNotificationTitles'),
    autoExportEnabled: prefs.get('autoExportEnabled'),
    autoExportSchedule: prefs.get('autoExportSchedule'),
    lastBackupAt: prefs.get('lastBackupAt'),
    backupNoticeDismissed: prefs.get('backupNoticeDismissed')
  };
}

function portableWith(marker: string) {
  const values: PreferenceValues = {
    ...PREFERENCE_DEFAULTS,
    name: `Name-${marker}`,
    theme: 'dark',
    palette: 'lesbian',
    language: 'pl',
    metricKind: 'dimension',
    metricDimension: 'femininity',
    checkInEnabled: true,
    checkInTime: '07:45',
    pinHash: `device-local-${marker}`
  };

  return {
    name: values.name,
    activePreset: values.activePreset,
    metricKind: values.metricKind,
    metricDimension: values.metricDimension,
    palette: values.palette,
    moodPreset: values.moodPreset,
    theme: values.theme,
    language: values.language,
    checkInEnabled: values.checkInEnabled,
    checkInTime: values.checkInTime,
    preferredLabUnits: {}
  };
}

async function pack(journal: Journal, preferences: ReturnType<typeof portableWith>) {
  const snapshot = await journal.archive.snapshot();
  return collect(
    packArchive(
      {
        journal: snapshot.journal,
        preferences,
        files: snapshot.files,
        readFile: snapshot.readFile
      },
      PASSWORD
    )
  );
}

async function importInto(
  archive: Uint8Array,
  mode: 'replace' | 'merge',
  target: Journal
): Promise<ReturnType<typeof portableWith>> {
  const opened = await openArchive(oneShot(archive), PASSWORD);
  const portable = opened.payload.preferences;
  if (mode === 'replace') {
    await target.archive.replace({ journal: opened.payload.journal, files: opened.files });
  } else {
    await target.archive.merge({ journal: opened.payload.journal, files: opened.files });
  }
  return portable;
}

async function wrongPasswordMessage(archive: Uint8Array) {
  try {
    const opened = await openArchive(oneShot(archive), 'wrong-pass');
    for await (const _file of opened.files);
    return { name: 'none', message: 'no error' };
  } catch (error) {
    return {
      name: error instanceof DecryptionFailedError ? 'DecryptionFailedError' : String((error as Error)?.name),
      message: String((error as Error)?.message)
    };
  }
}

async function verifyImportedState(target: Handle, marker: string, sourceMeta: Awaited<ReturnType<typeof seedSource>>) {
  const entries = await target.journal.entries.recentDays(1000);
  const imported = entries.find((entry) => entry.note === sourceMeta.entryNote);
  const milestone = (await target.journal.milestones.getMilestones()).find((m) => m.name === sourceMeta.milestone);
  const reminderTitles = (await target.journal.reminders.getReminders()).map((r) => r.title);
  const analytes = await target.journal.labs.getUsedAnalytes();
  const tagIds = (await target.journal.tags.getTagGroups()).flatMap((group) => group.tags.map((tag) => tag.id));

  const entryPhotoBytes = imported?.photos[0]?.fileName ? await target.files.read(imported.photos[0].fileName) : null;
  const milestonePhotoBytes = milestone?.photo?.fileName ? await target.files.read(milestone.photo.fileName) : null;

  return {
    importedEntryPresent: Boolean(imported),
    importedEntryDims: imported?.dims?.femininity,
    importedEntryTags: imported?.tags ?? [],
    importedCustomTagPresent: tagIds.includes(sourceMeta.customTag),
    importedMilestonePresent: Boolean(milestone),
    importedReminderPresent: reminderTitles.includes(sourceMeta.reminder),
    importedLabPresent: analytes.includes(sourceMeta.analyte),
    importedEntryPhoto: bytesEqual(entryPhotoBytes, bytes(`entry-full-${marker}`)),
    importedMilestonePhoto: bytesEqual(milestonePhotoBytes, bytes(`milestone-full-${marker}`)),
    targetOnlyStillThere: entries.some((entry) => entry.note === `target-only-${marker}`)
  };
}

async function runDirection(
  checks: Check[],
  caseName: string,
  sourceKind: 'web' | 'android',
  sourceEncrypted: boolean,
  targetKind: 'web' | 'android',
  targetEncrypted: boolean,
  marker: string
) {
  const source = await openHandle(sourceKind, sourceEncrypted, `${marker}-source.sqlite3`, `${marker}-source-photos`);
  let targetReplace: Handle | null = null;
  let targetMerge: Handle | null = null;

  try {
    const sourceMeta = await seedSource(source.journal, source.files, marker);
    const portableExpected = portableWith(marker);
    const archive = await pack(source.journal, portableExpected);

    // The Android bridge is a single native connection. Keeping two target
    // handles open at once lets one open() replace the other's database.
    targetReplace = await openHandle(targetKind, targetEncrypted, `${marker}-replace.sqlite3`, `${marker}-replace-photos`);
    await seedTargetLocalState(targetReplace.driver, targetReplace.journal, marker);
    const localBeforeReplace = await readLocalPrefs(targetReplace.driver);

    const portableOnReplace = await importInto(archive, 'replace', targetReplace.journal);
    const replaceState = await verifyImportedState(targetReplace, marker, sourceMeta);
    const localAfterReplace = await readLocalPrefs(targetReplace.driver);

    record(
      checks,
      `${caseName}: replace carries rows and photo bytes`,
      replaceState.importedEntryPresent &&
        replaceState.importedEntryDims === 60 &&
        replaceState.importedCustomTagPresent &&
        replaceState.importedMilestonePresent &&
        replaceState.importedReminderPresent &&
        replaceState.importedLabPresent &&
        replaceState.importedEntryPhoto &&
        replaceState.importedMilestonePhoto &&
        !replaceState.targetOnlyStillThere,
      JSON.stringify(replaceState)
    );

    record(
      checks,
      `${caseName}: portable preferences survive archive read`,
      JSON.stringify(portableOnReplace) === JSON.stringify(portableExpected),
      JSON.stringify(portableOnReplace)
    );

    record(
      checks,
      `${caseName}: device-local preferences are not clobbered by replace`,
      JSON.stringify(localBeforeReplace) === JSON.stringify(localAfterReplace),
      JSON.stringify({ before: localBeforeReplace, after: localAfterReplace })
    );

    await targetReplace.close();
    targetReplace = null;

    targetMerge = await openHandle(targetKind, targetEncrypted, `${marker}-merge.sqlite3`, `${marker}-merge-photos`);
    await seedTargetLocalState(targetMerge.driver, targetMerge.journal, marker);
    const localBeforeMerge = await readLocalPrefs(targetMerge.driver);

    await importInto(archive, 'merge', targetMerge.journal);
    const afterMerge = await verifyImportedState(targetMerge, marker, sourceMeta);
    const localAfterMerge = await readLocalPrefs(targetMerge.driver);

    record(
      checks,
      `${caseName}: merge keeps existing rows and adds missing ones`,
      afterMerge.importedEntryPresent && afterMerge.targetOnlyStillThere,
      JSON.stringify(afterMerge)
    );

    const snapshotAfterFirstMerge = await targetMerge.journal.archive.snapshot();
    await importInto(archive, 'merge', targetMerge.journal);
    const snapshotAfterSecondMerge = await targetMerge.journal.archive.snapshot();
    record(
      checks,
      `${caseName}: merging the same archive twice is a no-op`,
      JSON.stringify(snapshotAfterFirstMerge.journal) === JSON.stringify(snapshotAfterSecondMerge.journal),
      `${snapshotAfterFirstMerge.journal.entries.length} entries -> ${snapshotAfterSecondMerge.journal.entries.length} entries`
    );

    record(
      checks,
      `${caseName}: device-local preferences are not clobbered by merge`,
      JSON.stringify(localBeforeMerge) === JSON.stringify(localAfterMerge),
      JSON.stringify({ before: localBeforeMerge, after: localAfterMerge })
    );

    const wrongPassword = await wrongPasswordMessage(archive);
    record(
      checks,
      `${caseName}: wrong password is a clean DecryptionFailedError`,
      wrongPassword.name === 'DecryptionFailedError' && wrongPassword.message === 'wrong password',
      JSON.stringify(wrongPassword)
    );
  } finally {
    await source.close();
    if (targetReplace) await targetReplace.close();
    if (targetMerge) await targetMerge.close();
  }
}

async function run() {
  const checks: Check[] = [];

  await runDirection(checks, 'both encrypted web->android', 'web', true, 'android', true, 'ee-wa');
  await runDirection(checks, 'both encrypted android->web', 'android', true, 'web', true, 'ee-aw');

  await runDirection(checks, 'mixed encryption web->android', 'web', true, 'android', false, 'me-wa');
  await runDirection(checks, 'mixed encryption android->web', 'android', false, 'web', true, 'me-aw');
  await runDirection(checks, 'mixed encryption web plaintext->android encrypted', 'web', false, 'android', true, 'me2-wa');
  await runDirection(checks, 'mixed encryption android encrypted->web plaintext', 'android', true, 'web', false, 'me2-aw');

  window.__archiveCrossResult = { checks };
  document.body.dataset.archiveCrossReady = 'true';
}

run().catch((error) => {
  window.__archiveCrossResult = { error: String((error as Error)?.stack ?? error) };
  document.body.dataset.archiveCrossReady = 'true';
});
