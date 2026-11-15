/* One owner per stored file, and names every store reads the same way
   (security scan ticket 04: GD-010, GD-020, GD-024). */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CorruptArchiveError } from '../archive/container.ts';
import type { ArchiveJournal } from '../archive/payload.ts';
import { encryptedFileStore } from '../photos/encrypted-file-store.ts';
import { isStorableFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { markJournalBusy } from '../journal-busy.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type PhotoFileStore } from './journal.ts';
import type { RestoreContents } from './restore.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const control = String.fromCharCode(1);
// PhotoFiles.fileFor trims with String.trim, which drops every char up to U+0020.
const javaTrim = (name: string) => name.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');

async function device() {
  const db = await migratedDb();
  const disk = fakeFileStore();
  // Android's store: a name is trimmed on the way in, whatever the caller meant.
  const android: PhotoFileStore = {
    ...disk,
    write: (name, data) => disk.write(javaTrim(name), data),
    read: (name) => disk.read(javaTrim(name)),
    remove: (name) => disk.remove(javaTrim(name))
  };
  const files = encryptedFileStore(android, crypto.getRandomValues(new Uint8Array(32)));
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  await journal.entries.upsertEntry({
    epochDay: 20_000, mood: 4, note: 'keep me',
    attachPhotos: [{ full: bytes('original photo'), thumb: bytes('original thumbnail') }]
  });
  const snapshot = await journal.archive.snapshot();
  const target = snapshot.journal.entries[0].photos[0].fileName;
  const ciphertext = new Map(await Promise.all(disk.names().map(async (name) => [name, await disk.read(name)] as const)));
  return { db, disk, files, journal, snapshot, target, ciphertext };
}
type Made = Awaited<ReturnType<typeof device>>;

const withFiles = (journal: ArchiveJournal, delivered: Record<string, string>): RestoreContents => ({
  journal,
  files: (async function* () {
    for (const [name, text] of Object.entries(delivered)) yield { name, bytes: bytes(text) };
  })()
});
/** The restore's own orphan sweep is deferred while another write is in flight, so
    holding the journal busy shows what the restore itself left on disk. */
async function whileBusy<T>(work: () => Promise<T>): Promise<T> {
  const release = markJournalBusy();
  try { return await work(); } finally { release(); }
}
const clone = (made: Made) => structuredClone(made.snapshot.journal);

async function refused(made: Made, mode: 'merge' | 'replace', contents: RestoreContents) {
  const before = new Map(made.disk.names().map((name) => [name, name] as const));
  await assert.rejects(made.journal.archive[mode](contents), (error: unknown) => error instanceof CorruptArchiveError);
  assert.deepEqual(made.disk.names(), [...before.keys()].sort());
  for (const [name, data] of made.ciphertext) assert.deepEqual(await made.disk.read(name), data);
  assert.deepEqual(await made.files.read(made.target), bytes('original photo'));
}

test('every name the app writes is a storable name', () => {
  for (const name of ['6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.jpg', '6f1c2a9e-0b1d-4c3e-8f7a-123456789abc-thumb.jpg',
    '6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.pdf', '6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.webm',
    '6f1c2a9e-0b1d-4c3e-8f7a-123456789abc.m4a', 'a.jpg', 'a b.jpg']) {
    assert.equal(isStorableFileName(name), true, name);
  }
});

test('a name an Android store would read differently is not storable', () => {
  for (const name of ['', ' ', 'x.jpg ', ' x.jpg', 'x.jpg\n', `x.jpg${control}`, `${control}x.jpg`, 'x.jpg ',
    '.', '.nomedia', 'a/b.jpg', 'a\\b.jpg', 'a..jpg', '../x.jpg']) {
    assert.equal(isStorableFileName(name), false, JSON.stringify(name));
  }
});

for (const mode of ['merge', 'replace'] as const) {
  for (const [label, alias] of [['trailing space', (n: string) => `${n} `], ['leading space', (n: string) => ` ${n}`],
    ['control character', (n: string) => `${n}${control}`]] as const) {
    test(`${mode} refuses a ${label} alias of an existing file and leaves its bytes alone (GD-010)`, async () => {
      const made = await device();
      const journal = clone(made);
      journal.entries[0].uuid = 'other-entry';
      journal.entries[0].photos[0] = { ...journal.entries[0].photos[0], id: 'other-photo', fileName: alias(made.target) };
      await refused(made, mode, withFiles(journal, { [alias(made.target)]: 'attacker bytes' }));
    });
  }

  test(`${mode} refuses a delivered file whose name is not canonical (GD-010)`, async () => {
    const made = await device();
    await refused(made, mode, withFiles(clone(made), { [`${made.target} `]: 'attacker bytes' }));
  });

  test(`${mode} refuses a recording named like a photo's thumbnail (GD-024)`, async () => {
    const made = await device();
    const journal = clone(made);
    const entry = journal.entries[0];
    entry.photos.push({ ...entry.photos[0], id: 'second-photo', fileName: 'x.jpg' });
    entry.recordings = [{ id: 'rec', fileName: 'x-thumb.jpg' }] as typeof entry.recordings;
    await refused(made, mode, withFiles(journal, {}));
  });

  test(`${mode} refuses a recording that aliases a thumbnail through trailing space (GD-024)`, async () => {
    const made = await device();
    const journal = clone(made);
    const entry = journal.entries[0];
    entry.photos.push({ ...entry.photos[0], id: 'second-photo', fileName: 'x.jpg' });
    entry.recordings = [{ id: 'rec', fileName: 'x-thumb.jpg ' }] as typeof entry.recordings;
    await refused(made, mode, withFiles(journal, {}));
  });

  test(`${mode} writes no file that no row owns (GD-020)`, async () => {
    const made = await device();
    const empty = { ...clone(made), entries: [] as ArchiveJournal['entries'], milestones: [], hairPhotos: [], voiceBenchmarks: [] };
    await whileBusy(async () => {
      await made.journal.archive[mode](withFiles(empty, { 'stray-1.jpg': 'one', 'stray-2.webm': 'two' }));
      assert.equal(made.disk.names().some((name) => name.startsWith('stray')), false);
    });
  });

  test(`${mode} keeps owned files and drops the unowned ones in the same archive (GD-020)`, async () => {
    const made = await device();
    const journal = clone(made);
    journal.entries[0].uuid = 'imported-entry';
    journal.entries[0].epochDay = 20_005;
    journal.entries[0].photos[0] = { ...journal.entries[0].photos[0], id: 'imported-photo', fileName: 'fresh.jpg' };
    await whileBusy(async () => {
      await made.journal.archive[mode](withFiles(journal, { 'fresh.jpg': 'full', 'fresh-thumb.jpg': 'thumb', 'stray.jpg': 'x' }));
      assert.equal(made.disk.names().includes('fresh.jpg'), true);
      assert.equal(made.disk.names().includes('fresh-thumb.jpg'), true);
      assert.equal(made.disk.names().includes('stray.jpg'), false);
    });
  });

  test(`${mode} removes every file it wrote when the transaction fails, keeps existing ones (GD-020)`, async () => {
    const made = await device();
    const journal = clone(made);
    journal.entries.push({ ...journal.entries[0], uuid: 'invalid-entry', photos: [], recordings: [], videos: [] });
    journal.entries[0].uuid = 'imported-entry';
    journal.entries[0].epochDay = 20_005;
    journal.entries[0].photos[0] = { ...journal.entries[0].photos[0], id: 'imported-photo', fileName: 'fresh.jpg' };
    await made.db.exec(`CREATE TRIGGER reject_archive_entry BEFORE INSERT ON entry
      WHEN NEW.uuid = 'invalid-entry' BEGIN SELECT RAISE(ABORT, 'synthetic archive row failure'); END`);
    await whileBusy(async () => {
      await assert.rejects(made.journal.archive[mode](withFiles(journal, { 'fresh.jpg': 'full', 'fresh-thumb.jpg': 'thumb' })),
        /synthetic archive row failure/);
      // The sweep is held back: the restore itself must have cleaned up.
      assert.deepEqual(made.disk.names(), [...made.ciphertext.keys()].sort());
    });
    for (const [name, data] of made.ciphertext) assert.deepEqual(await made.disk.read(name), data);
  });
}

test('deleting one of two rows that name the same file leaves the bytes (GD-024)', async () => {
  const made = await device();
  const [photo] = (await made.journal.entries.entriesForDay(20_000))[0].photos;
  await made.db.run('INSERT INTO hair_photo(uuid, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?)',
    ['hair-alias', 20_000, made.target, 1]);
  await made.journal.photos.remove(photo.id);
  assert.deepEqual(await made.files.read(made.target), bytes('original photo'));
  await made.db.run('DELETE FROM hair_photo WHERE uuid = ?', ['hair-alias']);
});
