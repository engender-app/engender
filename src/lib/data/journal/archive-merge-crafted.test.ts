/* Archives whose rows contradict themselves or this journal, which no device
   writes but a hand-edited file can carry (re-check carpet 11, findings F2
   to F6). Each one used to stop a Merge with a raw SQLite or lookup error
   that the import screen could only call "failed"; now each is either
   merged by the rule in archiveMerge.ts or refused as a damaged archive. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import { CorruptArchiveError } from '../archive/wire.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { everySectionDevice } from './golden-archive-fixture.ts';
import { openJournal, type Journal } from './journal.ts';
import type { RestoreContents } from './restore.ts';

interface Device {
  driver: SqliteDriver;
  journal: Journal;
}

const FAR_FUTURE = 4_102_444_800_000;

async function exported(device: Device, edit: (journal: ArchiveJournal) => void): Promise<RestoreContents> {
  const snapshot = await device.journal.archive.snapshot();
  const journal = JSON.parse(JSON.stringify(snapshot.journal)) as ArchiveJournal;
  edit(journal);
  return {
    journal,
    files: (async function* () {
      for (const { name } of snapshot.files) yield { name, bytes: await snapshot.readFile(name) };
    })()
  };
}

async function freshDevice(): Promise<Device> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { driver, journal };
}

const deletions = (driver: SqliteDriver) =>
  driver.query('SELECT tbl, row_key, deleted_at FROM deletion ORDER BY tbl, row_key');

test('a deletion of an effect category the archive still uses is left out, as no device can delete one', async () => {
  const a = await everySectionDevice();
  const [{ key }] = await a.driver.query<{ key: string }>(
    'SELECT category_key AS key FROM personal_effect_type WHERE category_key IS NOT NULL LIMIT 1'
  );
  const b = await freshDevice();

  await b.journal.archive.merge(await exported(a, (journal) => {
    journal.deletions.push({ table: 'effect_category', id: key, deletedAt: FAR_FUTURE });
  }));

  assert.equal((await b.driver.query('SELECT 1 FROM effect_category WHERE key = ?', [key])).length, 1);
  assert.deepEqual(await b.driver.query('PRAGMA foreign_key_check'), []);
});

test('merging twice an archive that deletes a built-in tag group leaves every tombstone where the first merge put it', async () => {
  const a = await everySectionDevice();
  const [{ key }] = await a.driver.query<{ key: string }>('SELECT key FROM tag_group WHERE uuid IS NULL LIMIT 1');
  const b = await freshDevice();
  const crafted = (journal: ArchiveJournal) => {
    journal.deletions.push({ table: 'tag_group', id: key, deletedAt: FAR_FUTURE });
  };

  await b.journal.archive.merge(await exported(a, crafted));
  const once = await deletions(b.driver);
  await new Promise((resolve) => setTimeout(resolve, 2));
  await b.journal.archive.merge(await exported(a, crafted));

  assert.deepEqual(await deletions(b.driver), once);
  assert.equal((await b.driver.query('SELECT 1 FROM tag_group WHERE key = ?', [key])).length, 1);
});

test('an archive that deletes its own custom tag group while its entries use the tags is refused as damaged', async () => {
  const a = await everySectionDevice();
  const used = await a.driver.query<{ key: string }>(
    `SELECT DISTINCT g.key FROM tag_group g JOIN tag t ON t.group_id = g.id JOIN entry_tag et ON et.tag_id = t.id
      WHERE g.uuid IS NOT NULL LIMIT 1`
  );
  assert.equal(used.length, 1, 'the seed tags an entry with a custom group tag');
  const b = await freshDevice();

  await assert.rejects(
    b.journal.archive.merge(await exported(a, (journal) => {
      journal.deletions.push({ table: 'tag_group', id: used[0].key, deletedAt: FAR_FUTURE });
    })),
    CorruptArchiveError
  );
});
