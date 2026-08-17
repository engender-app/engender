import assert from 'node:assert/strict';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { test } from 'vitest';
import { DecryptionFailedError } from '../../crypto/aesGcm.ts';
import { deriveKey } from '../../crypto/argon2id.ts';
import { PREFERENCE_DEFAULTS, DEVICE_LOCAL_KEYS, PORTABLE_KEYS, type PreferenceValues } from '../prefs/catalogue.ts';
import { openJournal } from '../journal/journal.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import {
  CorruptArchiveError,
  UnsupportedArchiveError,
  byteReader,
  collect,
  readArchiveHeader,
  unframeArchive
} from './container.ts';
import { packArchive, openArchive, type ArchiveContents } from './pack.ts';
import { portablePreferences } from './payload.ts';

/* The archive parameters take about a second per derivation by design
   (ADR-0013), and these tests derive a key twice per round trip. The
   format does not care what the parameters are - they travel in the
   header - so the tests use a cheap set and the browser tier packs with
   the real ones. */
const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

async function populatedJournal() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();

  const voice = await journal.dimensions.addCustomDimension({ name: 'Voice', low: 'off', high: 'mine', min: 0, max: 10 });
  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 4,
    note: 'zażółć gęślą jaźń',
    dims: { [voice.key]: 7 },
    tags: ['e-happy']
  });
  await journal.photos.attach({ entryId: entry }, { full: bytes('full bytes of a photo'), thumb: bytes('thumb') });
  const milestone = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 19000 });
  await journal.photos.attach({ milestoneId: milestone }, { full: bytes('milestone photo'), thumb: bytes('mt') });
  await journal.labs.upsertResult({ epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L' });
  await journal.reminders.upsertReminder({
    title: 'injection',
    type: 'injection',
    time: '08:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true
  });
  return { journal, files };
}

/** Everything set to something other than its default, so a device-local
    preference that leaked into an archive would be recognisable in it. */
function everyPreferenceSet(): PreferenceValues {
  return {
    ...PREFERENCE_DEFAULTS,
    onboarded: true,
    name: 'Alicja',
    activePreset: 'p-nb',
    metricKind: 'dimension',
    metricDimension: 'femininity',
    theme: 'dark',
    palette: 'lesbian',
    language: 'pl',
    appLock: true,
    pinHash: 'DEVICE-LOCAL-PIN-HASH',
    lockOnLeave: true,
    disguise: true,
    quickExit: true,
    checkInEnabled: true,
    checkInTime: '07:30',
    autoExportEnabled: true,
    autoExportSchedule: 'monthly',
    lastBackupAt: 1_700_000_000_000,
    backupNoticeDismissed: true
  };
}

async function contentsOf(preferences = everyPreferenceSet()): Promise<{ contents: ArchiveContents; files: ReturnType<typeof fakeFileStore> }> {
  const { journal, files } = await populatedJournal();
  const snapshot = await journal.archive.snapshot();
  return {
    files,
    contents: {
      journal: snapshot.journal,
      preferences: portablePreferences(preferences),
      files: snapshot.files,
      readFile: snapshot.readFile
    }
  };
}

const pack = (contents: ArchiveContents, password = 'correct horse') =>
  collect(packArchive(contents, password, CHEAP_KDF));

async function* oneShot(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function unpack(archive: Uint8Array, password = 'correct horse') {
  const opened = await openArchive(oneShot(archive), password);
  const files = [];
  for await (const file of opened.files) files.push(file);
  return { payload: opened.payload, files };
}

test('round-trips the journal, its photos and its portable preferences', async () => {
  const { contents } = await contentsOf();

  const { payload, files } = await unpack(await pack(contents));

  assert.deepEqual(payload.journal, contents.journal);
  assert.deepEqual(payload.files, contents.files);
  assert.deepEqual(payload.preferences, portablePreferences(everyPreferenceSet()));

  assert.deepEqual(
    files.map((f) => f.name),
    contents.files.map((f) => f.name)
  );
  for (const file of files) {
    assert.deepEqual(file.bytes, await contents.readFile(file.name));
  }
});

test('the journal that comes back out holds what went in', async () => {
  const { contents } = await contentsOf();

  const { payload } = await unpack(await pack(contents));

  const entry = payload.journal.entries[0];
  assert.equal(entry.note, 'zażółć gęślą jaźń');
  assert.equal(entry.mood, 4);
  assert.deepEqual(entry.tags, ['e-happy']);
  assert.equal(entry.photos.length, 1);
  assert.equal(payload.journal.milestones[0].name, 'HRT start');
  assert.equal(payload.journal.labResults[0].analyte, 'estradiol');
  assert.equal(payload.journal.reminders[0].title, 'injection');
  assert.ok(payload.journal.dimensions.some((d) => d.name === 'Voice'));
});

test('a lab result survives the encrypted archive and restores into another journal', async () => {
  const { contents } = await contentsOf();
  const opened = await openArchive(oneShot(await pack(contents)), 'correct horse');
  const target = openJournal(await migratedDb(), fakeFileStore());

  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });

  const [result] = await target.labs.getResults('estradiol');
  assert.deepEqual(
    {
      epochDay: result.epochDay,
      analyte: result.analyte,
      value: result.value,
      unit: result.unit,
      note: result.note
    },
    { epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L', note: '' }
  );
});

test('a wrong password is rejected cleanly, and says only that', async () => {
  const { contents } = await contentsOf();
  const archive = await pack(contents);

  await assert.rejects(unpack(archive, 'Correct Horse'), (error: Error) => {
    assert.ok(error instanceof DecryptionFailedError);
    assert.equal(error.message, 'wrong password');
    return true;
  });
});

test('no device-local preference travels, in the archive or in its plaintext', async () => {
  const { contents } = await contentsOf();
  const archive = await pack(contents);

  const { payload } = await unpack(archive);
  assert.deepEqual(Object.keys(payload.preferences).sort(), [...PORTABLE_KEYS].sort());

  /* Not just "the keys look right": no device-local key is named anywhere
     in the decrypted body, wherever an export path might have put it, and
     the PIN hash - the value whose presence in a file would matter most -
     is in neither the plaintext nor the archive's own bytes. Searching for
     the other nine values would prove less than it looks: seven of them
     are booleans, and "true" appears in an archive for a dozen honest
     reasons. */
  const plaintext = new TextDecoder().decode(await decryptedBody(archive));
  for (const key of DEVICE_LOCAL_KEYS) {
    assert.ok(!plaintext.includes(`"${key}"`), `${key} is in the archive`);
  }

  const pinHash = everyPreferenceSet().pinHash!;
  assert.ok(!plaintext.includes(pinHash), 'the PIN hash is in the archive');
  assert.ok(!new TextDecoder('latin1').decode(archive).includes(pinHash), "the PIN hash is in the archive's bytes");
});

/** The decrypted body, read the way openArchive reads it. */
async function decryptedBody(archive: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const reader = byteReader(oneShot(archive));
  const { header, headerBytes } = await readArchiveHeader(reader);
  const key = await deriveKey('correct horse', header.salt, header.kdf);
  return collect(unframeArchive(reader, header, headerBytes, key));
}

test('a truncated archive fails authentication rather than importing part of it', async () => {
  const { contents } = await contentsOf();
  const archive = await pack(contents);

  // A real archive, really cut short - photos and all.
  await assert.rejects(
    unpack(archive.subarray(0, archive.length - 40)),
    (error: Error) => error instanceof DecryptionFailedError || error instanceof CorruptArchiveError
  );
});

test('an archive with a byte flipped in its body fails authentication', async () => {
  const { contents } = await contentsOf();
  const archive = await pack(contents);
  const corrupted = new Uint8Array(archive);
  corrupted[corrupted.length - 100] ^= 0xff;

  await assert.rejects(unpack(corrupted), DecryptionFailedError);
});

test('an archive from a newer format version is refused before the password is used', async () => {
  const { contents } = await contentsOf();
  const archive = new Uint8Array(await pack(contents));
  new DataView(archive.buffer).setUint16(6, 99);

  await assert.rejects(unpack(archive, 'anything at all'), UnsupportedArchiveError);
});

test('a file that is not an archive is refused', async () => {
  await assert.rejects(unpack(bytes('PK a zip file, or a photo, or anything else')), UnsupportedArchiveError);
});

/* Peak memory is the reason the format is chunked at all (ADR-0007), so
   these two check the property rather than the shape: nothing may read the
   photo set into memory to pack it, and nothing may hold more than a chunk
   of what it has already packed. A fixture big enough to matter, with the
   bytes generated on demand so the fixture itself is not what fills the
   heap. */
const BIG_FILE = 2 * 1024 * 1024;
const BIG_FILE_COUNT = 32;

function bigContents(): { contents: ArchiveContents; reads: string[] } {
  const reads: string[] = [];
  const files = Array.from({ length: BIG_FILE_COUNT }, (_, i) => ({ name: `photo-${i}.jpg`, length: BIG_FILE }));
  return {
    reads,
    contents: {
      journal: {
        dimensions: [],
        presets: [],
        tagGroups: [],
        entries: [],
        milestones: [],
        labResults: [],
        reminders: [],
        regimenEpisodes: [],
        doseEvents: [],
        doseSchedules: [],
        dosePauses: [],
        medicationStock: []
      },
      preferences: portablePreferences(PREFERENCE_DEFAULTS),
      files,
      async readFile(name) {
        reads.push(name);
        return new Uint8Array(BIG_FILE).fill(name.length);
      }
    }
  };
}

/* Bytes held in ArrayBuffers, which is where a Uint8Array's contents live
   - not in the V8 heap that heapUsed reports, which stays flat however
   much of the archive is being held.

   Collecting first is what makes the number mean "retained" rather than
   "allocated since the last collection": a perfectly streaming pack still
   allocates every chunk it hands over, and without a collection those
   dead buffers read exactly like an implementation holding onto them.

   It is also why the two tests that measure come before the ones that
   merely allocate a lot: a big buffer left over from an earlier test that
   dies during a measured one is collected inside the measurement, and
   what it frees hides what the measured code is holding. */
v8.setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

function bytesHeld(): number {
  collectGarbage();
  return process.memoryUsage().arrayBuffers;
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

test('peak memory stays bounded while packing a large photo set', async () => {
  const { contents } = bigContents();
  const archiveLength = BIG_FILE * BIG_FILE_COUNT;

  const before = bytesHeld();
  let peak = 0;
  let packed = 0;
  for await (const piece of packArchive(contents, 'correct horse', CHEAP_KDF)) {
    packed += piece.length;
    peak = Math.max(peak, bytesHeld() - before);
  }

  assert.ok(packed > archiveLength, 'the fixture is the size it claims to be');
  // Generous: holding the archive would be 64 MB, and holding it twice -
  // what single-shot encryption costs - would be 128 MB.
  assert.ok(peak < archiveLength / 4, `held ${megabytes(peak)} packing ${megabytes(archiveLength)}`);
});

test('unpacking hands photos over one at a time', async () => {
  const { contents } = bigContents();
  const archive = await pack(contents);

  const opened = await openArchive(oneShot(archive), 'correct horse');
  const before = bytesHeld();
  let peak = 0;
  let count = 0;
  for await (const file of opened.files) {
    count += 1;
    assert.equal(file.bytes.length, BIG_FILE);
    peak = Math.max(peak, bytesHeld() - before);
  }

  assert.equal(count, BIG_FILE_COUNT);
  // The archive itself is held by this test, so the baseline is taken
  // after it is packed: what is measured is what unpacking adds to it.
  assert.ok(peak < archive.length / 4, `held ${megabytes(peak)} unpacking ${megabytes(archive.length)}`);
});

test('packing reads photos as it needs them, not all of them up front', async () => {
  const { contents, reads } = bigContents();

  const packing = packArchive(contents, 'correct horse', CHEAP_KDF);
  // The header and two chunks: two megabytes of a sixty-four megabyte
  // archive. Reading the photo set to get this far is exactly the thing
  // the format exists to avoid.
  for (let i = 0; i < 3; i++) await packing.next();

  assert.ok(reads.length <= 2, `read ${reads.length} photos to produce two chunks`);
  await packing.return(undefined);
});
