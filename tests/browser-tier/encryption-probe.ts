/* Browser-tier check for ticket 09: the at-rest encryption claim, proved
   the only way the spec accepts - by closing the app and reading the raw
   bytes of everything it left behind.

   The probe walks the whole production key path: create a keystore from a
   passphrase, open the encrypted driver under the unwrapped data key, run
   the real migrations, seed protected content of every kind the claim
   names (entry text, a lab value, a reminder title, a milestone name, a
   preference, real JPEG photo bytes) through the real journal, force a
   pre-migration copy so the copy is on disk too, close - and then scan
   every OPFS file and every localStorage value for any of it.

   The key model rides along: wrong passphrase fails as one
   indistinguishable error, a rewrap changes the passphrase without
   touching the database, and a wrong raw key is refused by SQLite rather
   than read as garbage. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { createKeystore, unlockKeystore, rewrapKeystore } from '../../src/lib/crypto/keystore.ts';
import { readKeystoreFile, writeKeystoreFile } from '../../src/lib/data/keystore-file.ts';
import { localStorageCache, BOOT_CACHE_KEY } from '../../src/lib/data/prefs/boot-cache.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { scanOpfs, scanLocalStorage, textSentinel, type Sentinel } from './opfs-scan.ts';
import { freshOrigin } from './fresh-origin.ts';

const publish = (value: unknown) => {
  (window as unknown as { __encryptionProbeResult: unknown }).__encryptionProbeResult = value;
  document.body.dataset.encryptionProbeReady = 'true';
};

const PASSPHRASE = 'correct horse battery staple';

/* The cheap KDF parameters keep this probe from paying four full journal
   derivations; the parameter set travels in the keystore metadata either
   way, which is itself one of the properties under test. */
const PROBE_KDF = { memorySize: 1024, iterations: 1, parallelism: 1, hashLength: 32 };

const SENTINELS: Sentinel[] = [
  textSentinel('entry note', 'sentinel-note-woke-up-early-9351'),
  textSentinel('lab analyte', 'sentinel-analyte-estradiol'),
  textSentinel('lab unit', 'sentinel-unit-pg/mL'),
  textSentinel('reminder title', 'sentinel-reminder-progynova-2114'),
  textSentinel('milestone name', 'sentinel-milestone-first-day-7738'),
  textSentinel('preference name', 'sentinel-preference-alicja-4479'),
  textSentinel('photo body', 'sentinel-photo-body-6627'),
  { label: 'JPEG signature', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), atStartOnly: true }
];

/** Real JPEG bytes with a sentinel riding in a COM segment, so both the
    image signature and readable content are plantable in one file. */
async function sentinelJpeg(): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(64, 64);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c94f7c';
  context.fillRect(0, 0, 64, 64);
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
  const comment = new TextEncoder().encode('sentinel-photo-body-6627');
  const segment = new Uint8Array(4 + comment.length);
  segment.set([0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff]);
  segment.set(comment, 4);
  /* After the encoder's own first segment, not straight after SOI: a
     comment inserted at byte 2 displaces the JFIF marker, and the file
     stops beginning ff d8 ff e0 - which is exactly what the JPEG-signature
     sentinel above matches on, atStartOnly. Ticket 10's probe scans the
     same fixture before encrypting it and asserts every sentinel is found,
     which is how this one turned out to have been inert. */
  const at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const withComment = new Uint8Array(jpeg.length + segment.length);
  withComment.set(jpeg.subarray(0, at));
  withComment.set(segment, at);
  withComment.set(jpeg.subarray(at), at + segment.length);
  return withComment;
}

const refusal = async (attempt: () => Promise<unknown>): Promise<{ name: string; message: string } | null> => {
  try {
    await attempt();
    return null;
  } catch (error) {
    return { name: (error as Error).name, message: (error as Error).message };
  }
};

async function run() {
  const result: Record<string, unknown> = {};

  // A clean slate: this probe owns the whole origin's storage for its run.
  await freshOrigin();

  // --- setup: the production first-run path --------------------------------
  const created = await createKeystore(PASSPHRASE, PROBE_KDF);
  await writeKeystoreFile(created.metadata);
  result.keystoreRoundTrips =
    JSON.stringify(await unlockKeystore((await readKeystoreFile())!, PASSPHRASE)) ===
    JSON.stringify(created.dataKey);

  const { driver, fileOps } = createEncryptedWebSqlite('gender-diary.sqlite3', created.dataKey);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  // --- seed every kind of protected content the claim names ----------------
  const files = encryptedFileStore(opfsPhotoFiles(), created.dataKey);
  const journal = openJournal(driver, files);
  await journal.reconcileBuiltIns();

  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: 'sentinel-note-woke-up-early-9351',
    dims: {},
    tags: []
  });
  await journal.photos.attach({ entryId }, { full: await sentinelJpeg(), thumb: await sentinelJpeg() });
  await journal.labs.upsertResult({
    epochDay: 20000,
    analyte: 'sentinel-analyte-estradiol',
    value: 424242.5,
    unit: 'sentinel-unit-pg/mL'
  });
  await journal.reminders.upsertReminder({
    title: 'sentinel-reminder-progynova-2114',
    type: 'med',
    time: '09:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true
  });
  await journal.milestones.upsertMilestone({ name: 'sentinel-milestone-first-day-7738', epochDay: 19000 });

  const cache = localStorageCache();
  const preferences = await openPreferences(driver, cache);
  await preferences.set('name', 'sentinel-preference-alicja-4479');
  await preferences.set('theme', 'dark');
  result.bootCachePresent = localStorage.getItem(BOOT_CACHE_KEY) !== null;

  // The pre-migration copy is persistent-file coverage too: force one so
  // the scan below reads the copy's bytes, not just the database's.
  await fileOps.copyDatabaseFile();

  // FTS works over the encrypted index or search is dead weight.
  const hits = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entry_fts WHERE entry_fts MATCH 'sentinel'"
  );
  result.searchHitsWhileOpen = hits[0].n;

  // --- close, then read what a thief with the device would read ------------
  await driver.close();
  result.scan = await scanOpfs(SENTINELS);
  result.localStorageScan = scanLocalStorage(SENTINELS);

  // --- reopen: the passphrase is what brings the journal back --------------
  const stored = (await readKeystoreFile())!;
  result.wrongPassphrase = await refusal(() => unlockKeystore(stored, 'not the passphrase'));

  const reopened = createEncryptedWebSqlite('gender-diary.sqlite3', await unlockKeystore(stored, PASSPHRASE));
  const rebooted = await boot({ createDriver: () => reopened.driver, fileOps: reopened.fileOps });
  if (rebooted.phase === 'error') throw rebooted.error;
  const reread = openJournal(reopened.driver, encryptedFileStore(opfsPhotoFiles(), created.dataKey));
  const entry = await reread.entries.getEntry(entryId);
  result.reopenedNote = entry?.note;
  result.reopenedPhotoIntact = await (async () => {
    const name = entry?.photos[0]?.fileName;
    if (!name) return false;
    const bytes = await encryptedFileStore(opfsPhotoFiles(), created.dataKey).read(name);
    return bytes !== null && bytes[0] === 0xff && bytes[1] === 0xd8;
  })();
  await reopened.driver.close();

  // --- rewrap: a passphrase change never rewrites the journal --------------
  const rewrapped = await rewrapKeystore(stored, PASSPHRASE, 'a different passphrase', PROBE_KDF);
  await writeKeystoreFile(rewrapped);
  result.oldPassphraseAfterRewrap = await refusal(() => unlockKeystore(rewrapped, PASSPHRASE));
  const rewrappedKey = await unlockKeystore((await readKeystoreFile())!, 'a different passphrase');
  const afterRewrap = createEncryptedWebSqlite('gender-diary.sqlite3', rewrappedKey);
  const rewrapBoot = await boot({ createDriver: () => afterRewrap.driver, fileOps: afterRewrap.fileOps });
  if (rewrapBoot.phase === 'error') throw rewrapBoot.error;
  result.noteAfterRewrap = (await openJournal(afterRewrap.driver, files).entries.getEntry(entryId))?.note;
  await afterRewrap.driver.close();

  // --- a wrong raw key is refused, not read --------------------------------
  const wrongKey = crypto.getRandomValues(new Uint8Array(32));
  const wrong = createEncryptedWebSqlite('gender-diary.sqlite3', wrongKey);
  result.wrongRawKey = await refusal(() => wrong.driver.query('SELECT count(*) FROM sqlite_master'));
  await refusal(() => wrong.driver.close());

  publish(result);
}

run().catch((err) => publish({ error: String((err as Error)?.stack ?? err) }));
