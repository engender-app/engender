import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'vitest';
import { packArchive, openArchive } from '../../src/lib/data/archive/pack';
import { collect } from '../../src/lib/data/archive/container';
import { portablePreferences } from '../../src/lib/data/archive/payload';
import { PREFERENCE_DEFAULTS } from '../../src/lib/data/prefs/catalogue';
import { openJournal } from '../../src/lib/data/journal/journal';
import { migratedDb } from '../../src/lib/data/sqlite/test-support/migrated-db';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store';

const directory = process.env.MANUAL_EXPORT_ARCHIVE_DIR;
if (!directory) throw new Error('MANUAL_EXPORT_ARCHIVE_DIR must name an owned temporary directory');
const password = 'synthetic manual export probe';
const full = new TextEncoder().encode('synthetic full image bytes');
const thumb = new TextEncoder().encode('synthetic thumbnail bytes');

test('pack or restore the actual delivered Archive with the released KDF profile', async () => {
  if (process.env.MANUAL_EXPORT_ARCHIVE_PHASE === 'pack') {
    const journal = openJournal(await migratedDb(), fakeFileStore());
    await journal.reconcileBuiltIns();
    const entry = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'synthetic picker roundtrip', dims: {}, tags: [] });
    await journal.photos.attach({ entryId: entry }, { full, thumb });
    const snapshot = await journal.archive.snapshot();
    const archive = await collect(packArchive({ ...snapshot, preferences: portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Probe' }) }, password));
    await writeFile(join(directory, 'input.ttbackup'), archive);
    return;
  }
  const delivered = await readFile(join(directory, 'delivered.ttbackup'));
  const opened = await openArchive((async function* () { yield delivered; })(), password);
  assert.equal(opened.payload.preferences.name, 'Probe');
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.archive.replace({ journal: opened.payload.journal, files: opened.files });
  const snapshot = await journal.archive.snapshot();
  assert.equal(snapshot.journal.entries.length, 1);
  assert.equal(snapshot.journal.entries[0].note, 'synthetic picker roundtrip');
  assert.equal(snapshot.journal.entries[0].mood, 4);
  assert.equal(snapshot.journal.entries[0].photos.length, 1);
  const contents = await Promise.all(snapshot.files.map(file => snapshot.readFile(file.name)));
  assert.ok(contents.some(bytes => Buffer.from(bytes).equals(full)));
  assert.ok(contents.some(bytes => Buffer.from(bytes).equals(thumb)));
});
