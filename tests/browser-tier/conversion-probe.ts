/* Ticket 10 on the real platform: build a Journal exactly as the app built
   one before encryption existed - SQLocal, a `gender-diary.sqlite3` file in
   the OPFS root, plaintext photos in `photos/` - convert it, and then ask
   the disk what is left.

   The Node tier already walks every interruption stage of the state
   machine (src/lib/data/conversion/conversion.test.ts). What only a browser
   can answer is whether the ports underneath it do what they claim on real
   OPFS, a real SAHPool and real sqlite3mc:

     - does a whole plaintext database come out of importDb and PRAGMA
       hexrekey as a keyed, complete Journal - rows, FTS index, prefs;
     - are the sentinels readable BEFORE the conversion, so that not
       finding them afterwards means something;
     - is anything readable left over - the source, its pre-migration copy,
       the plaintext the import put in the pool, the rollback journal the
       rekey wrote its original pages into;
     - do the resumable ports really resume, twice over the same file.

   The sentinels and the scanner are ticket 09's (opfs-scan.ts). The point
   of running them again here is that this journal's content was written in
   plaintext first, so every one of them was genuinely on disk in the clear
   at the start of this probe. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createWebSqlite } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { createKeystore, unlockKeystore } from '../../src/lib/crypto/keystore.ts';
import { readKeystoreFile, writeKeystoreFile, KEYSTORE_FILE } from '../../src/lib/data/keystore-file.ts';
import { localStorageCache, BOOT_CACHE_KEY } from '../../src/lib/data/prefs/boot-cache.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { LATEST_SCHEMA_VERSION } from '../../src/lib/data/sqlite/migrations.ts';
import {
  describeJournalState,
  prepareConversion,
  runConversion,
  type ConversionPorts
} from '../../src/lib/data/conversion/conversion.ts';
import { opfsConversionMarker } from '../../src/lib/data/conversion/marker-file.ts';
import {
  plaintextJournalPresent,
  webConversionPorts,
  webConversionPrecheckPorts,
  JOURNAL_DATABASE
} from '../../src/lib/data/conversion/web-ports.ts';
import { journalKeystoreExists } from '../../src/lib/data/journal-passphrase.ts';
import { scanOpfs, scanLocalStorage, textSentinel, type Sentinel } from './opfs-scan.ts';
import { freshOrigin } from './fresh-origin.ts';

const publish = (value: unknown) => {
  (window as unknown as { __conversionProbeResult: unknown }).__conversionProbeResult = value;
  document.body.dataset.conversionProbeReady = 'true';
};

const PASSPHRASE = 'the passphrase this journal never had';
const PROBE_KDF = { memorySize: 1024, iterations: 1, parallelism: 1, hashLength: 32 };

const NOTE = 'sentinel-converted-note-woke-up-early-4182';
const ANALYTE = 'sentinel-converted-analyte-estradiol';
const REMINDER = 'sentinel-converted-reminder-progynova-7715';
const MILESTONE = 'sentinel-converted-milestone-first-day-2260';
const PREFERENCE = 'sentinel-converted-preference-alicja-9014';
const PHOTO_BODY = 'sentinel-converted-photo-body-3378';
const PIN_HASH = 'sentinel-converted-pinhash-6801';

const SENTINELS: Sentinel[] = [
  textSentinel('entry note', NOTE),
  textSentinel('lab analyte', ANALYTE),
  textSentinel('reminder title', REMINDER),
  textSentinel('milestone name', MILESTONE),
  textSentinel('preference name', PREFERENCE),
  textSentinel('pin hash', PIN_HASH),
  textSentinel('photo body', PHOTO_BODY),
  { label: 'JPEG signature', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), atStartOnly: true }
];

/** A real JPEG with a sentinel in a COM segment, so a plaintext photo is
    findable both by its signature and by its content.

    The comment goes after the encoder's own first segment rather than
    straight after SOI, so the file still begins ff d8 ff e0 - a photo
    whose first four bytes are not a JPEG's would make the signature
    sentinel inert, and an inert sentinel is one the scan can never fail
    on. The plaintext scan below checks all eight are really found, which
    is what makes finding none of them afterwards mean something. */
async function sentinelJpeg(): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(64, 64);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#c94f7c';
  context.fillRect(0, 0, 64, 64);
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
  const comment = new TextEncoder().encode(PHOTO_BODY);
  const segment = new Uint8Array(4 + comment.length);
  segment.set([0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff]);
  segment.set(comment, 4);
  // SOI, then the first marker segment (its length is the two bytes after
  // the marker), and the comment lands after that.
  const at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const withComment = new Uint8Array(jpeg.length + segment.length);
  withComment.set(jpeg.subarray(0, at));
  withComment.set(segment, at);
  withComment.set(jpeg.subarray(at), at + segment.length);
  return withComment;
}

const dirty = (scan: { path: string; found: string[] }[]) =>
  scan.filter((file) => file.found.length > 0).map((file) => `${file.path}: ${file.found.join(', ')}`);

const survey = async () => ({
  keystoreExists: await journalKeystoreExists(),
  plaintextJournalPresent: await plaintextJournalPresent(),
  marker: await opfsConversionMarker().read()
});

/** The pre-encryption app, in full: SQLocal over the OPFS root, the real
    migrations, the real journal, and photos written to the same store the
    encrypting decorator later wraps - only without the decorator. */
async function buildPlaintextEraJournal(): Promise<{ entryId: number; photoName: string }> {
  const { driver, fileOps } = createWebSqlite(JOURNAL_DATABASE);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;

  const files = opfsPhotoFiles();
  const journal = openJournal(driver, files);
  await journal.reconcileBuiltIns();

  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: NOTE,
    dims: {},
    tags: []
  });
  await journal.photos.attach({ entryId }, { full: await sentinelJpeg(), thumb: await sentinelJpeg() });
  await journal.labs.upsertResult({ epochDay: 20000, analyte: ANALYTE, value: 424242.5, unit: 'pg/mL' });
  await journal.reminders.upsertReminder({
    title: REMINDER,
    type: 'med',
    time: '09:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true
  });
  await journal.milestones.upsertMilestone({ name: MILESTONE, epochDay: 19000 });

  const preferences = await openPreferences(driver, localStorageCache());
  await preferences.set('name', PREFERENCE);
  // Device-local, and deliberately not carried by the archive format
  // (ADR-0003) - so it only survives if the conversion moves the whole
  // database rather than exporting and importing one.
  await preferences.set('pinHash', PIN_HASH);

  // The pre-migration copy an ordinary schema migration would have left
  // behind, in plaintext: a remnant the conversion has to retire.
  await fileOps.copyDatabaseFile();

  const [photo] = await journal.photos.inJournal();
  await driver.close();
  // Every photo written through the store has a file; a null name would
  // mean the fixture never stored one, which would make the scan below
  // prove nothing.
  if (photo?.fileName == null) throw new Error('the fixture photo has no file');
  return { entryId, photoName: photo.fileName };
}

async function run() {
  const result: Record<string, unknown> = {};

  await freshOrigin();
  const { entryId, photoName } = await buildPlaintextEraJournal();

  // --- the fixture is what it claims: all of it readable, in the clear ---
  const before = await scanOpfs(SENTINELS);
  result.plaintextScanFound = [...new Set(before.flatMap((file) => file.found))].sort();
  result.plaintextRootNames = before.map((file) => file.path).sort();
  result.stateBeforeConversion = describeJournalState(await survey());

  // --- the precheck, then the passphrase, then the conversion -------------
  const precheck = await prepareConversion(webConversionPrecheckPorts(), LATEST_SCHEMA_VERSION);
  result.precheck = precheck;
  result.markerAfterPrecheck = await opfsConversionMarker().read();

  const created = await createKeystore(PASSPHRASE, PROBE_KDF);
  await writeKeystoreFile(created.metadata);
  result.stateWithKeystoreMidConversion = describeJournalState(await survey());

  const ports = webConversionPorts(created.dataKey);

  /* An attempt that got as far as writing the copy and died, so that the
     conversion below is a redo over a target that is already there. This
     is the one place the real port has durable substates the Node tier's
     fake cannot model: the plaintext importDb leaves in the pool before
     the rekey runs, and the rollback journal the rekey writes its original
     pages into (ADR-0020's amendment names both). Doing it twice puts the
     unlink-and-start-again path under the final scan, which is what has to
     find nothing readable. */
  const source = await ports.readSource();
  await ports.writeEncryptedCopy(source.bytes);
  result.copyBeforeRedoVerifies = await ports
    .censusOfEncryptedCopy()
    .then((census) => census.entry === source.census.entry)
    .catch((error: Error) => error.message);

  /* A kill part way through the photos, on the real store: the ports have
     to be resumable against OPFS and AES-GCM, not just against the Node
     tier's fakes. Nothing catches this but the caller, exactly as a killed
     process would leave it. */
  let converted = 0;
  const failingOnSecondPhoto: ConversionPorts = {
    ...ports,
    async convertPhoto(name) {
      converted += 1;
      if (converted === 2) throw new Error('killed part way through the photos');
      await ports.convertPhoto(name);
    }
  };
  result.interrupted = await runConversion(failingOnSecondPhoto).then(
    () => null,
    (error: Error) => error.message
  );
  result.markerAfterInterruption = await opfsConversionMarker().read();
  result.stateAfterInterruption = describeJournalState(await survey());
  // Mid-flight, with the copy verified and some photos still plaintext:
  // the source is still on disk and the app still calls this a conversion.
  result.sourceStillPresentMidPhotos = await plaintextJournalPresent();

  // --- resume, to the end -------------------------------------------------
  const stages: string[] = [];
  await runConversion(ports, (progress) => stages.push(progress.stage));
  result.resumeStages = [...new Set(stages)];
  result.markerAfterConversion = await opfsConversionMarker().read();
  result.stateAfterConversion = describeJournalState(await survey());

  // --- what a thief with the device would read now ------------------------
  result.scan = await scanOpfs(SENTINELS);
  result.dirtyFiles = dirty(result.scan as { path: string; found: string[] }[]);
  result.rootNames = (result.scan as { path: string }[]).map((file) => file.path).sort();
  result.localStorageScan = scanLocalStorage(SENTINELS);
  result.dirtyKeys = (result.localStorageScan as { key: string; found: string[] }[])
    .filter((entry) => entry.found.length > 0)
    .map((entry) => entry.key);
  result.plaintextGone = !(await plaintextJournalPresent());

  // --- and what the person reads: the same journal, through the key -------
  const dataKey = await unlockKeystore((await readKeystoreFile())!, PASSPHRASE);
  const { driver } = createEncryptedWebSqlite(JOURNAL_DATABASE, dataKey);
  const files = encryptedFileStore(opfsPhotoFiles(), dataKey);
  const reopened = openJournal(driver, files);

  const entry = await reopened.entries.getEntry(entryId);
  result.note = entry?.note;
  result.photoCount = entry?.photos.length ?? 0;
  const photoBytes = await files.read(photoName);
  result.photoIntact = photoBytes !== null && photoBytes[0] === 0xff && photoBytes[1] === 0xd8;
  result.milestones = (await reopened.milestones.getMilestones()).map((milestone) => milestone.name);
  result.reminders = (await reopened.reminders.getReminders()).map((reminder) => reminder.title);
  result.labs = await reopened.labs.getUsedAnalytes();

  // The boot mirror rewrites itself from the encrypted table on first
  // open, and the PIN hash is not in the boot set any more (ticket 09) -
  // so a hash that was in plaintext localStorage before the conversion is
  // in the encrypted database afterwards and nowhere else.
  const cache = localStorageCache();
  const preferences = await openPreferences(driver, cache);
  result.preferenceName = preferences.get('name');
  result.pinHashInDatabase = preferences.get('pinHash');
  result.bootMirror = JSON.parse(localStorage.getItem(BOOT_CACHE_KEY) ?? 'null');

  // Search survived the copy: the FTS index went across with the rest of
  // the pages rather than being rebuilt from the rows.
  const hits = await driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entry_fts WHERE entry_fts MATCH 'sentinel'"
  );
  result.searchHits = hits[0].n;
  await driver.close();

  // --- the ports are idempotent, which is what a resume rests on ----------
  const again = webConversionPorts(dataKey);
  result.secondConvertPhoto = await again
    .convertPhoto(photoName)
    .then(async () => {
      const bytes = await encryptedFileStore(opfsPhotoFiles(), dataKey).read(photoName);
      return bytes !== null && bytes[0] === 0xff && bytes[1] === 0xd8;
    })
    .catch((error: Error) => error.message);

  result.keystoreFileName = KEYSTORE_FILE;
  publish(result);
}

run().catch((err) => publish({ error: String((err as Error)?.stack ?? err) }));
