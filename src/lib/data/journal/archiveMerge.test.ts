/* Every table has a Merge class, and every table merged by `updated_at` records its
   deletions (archiveMerge.ts).

   Read off the migrated schema rather than a list kept beside it, so a table a later ticket
   adds fails here until it is classified, and a table a later migration rebuilds fails here
   if the rebuild dropped its deletion trigger. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { runMigrations } from '../sqlite/migration-runner.ts';
import { migrations } from '../sqlite/migrations.ts';
import { makeNodeSqliteDb } from '../sqlite/test-support/node-sqlite-driver.ts';
import { migratedDb, noopFileOps } from '../sqlite/test-support/migrated-db.ts';
import type { ArchiveJournal } from '../archive/payload.ts';
import { MERGE_CLASSES, applyDeletions, rowGate } from './archiveMerge.ts';
import { openJournal } from './journal.ts';

async function schemaTables() {
  const db = await migratedDb();
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return { db, names: tables.map((table) => table.name) };
}

test('every table in the schema has a Merge class, and every class names a real table', async () => {
  const { names } = await schemaTables();
  const unclassified = names.filter((name) => !(name in MERGE_CLASSES));
  assert.deepEqual(unclassified, [], `tables with no Merge class: ${unclassified.join(', ')}`);
  const stale = Object.keys(MERGE_CLASSES).filter((name) => !names.includes(name));
  assert.deepEqual(stale, [], `Merge classes for tables the schema no longer has: ${stale.join(', ')}`);
});

test('a table merged by updated_at has the column, and a row that follows its parent does not need it', async () => {
  const { db, names } = await schemaTables();
  for (const name of names) {
    const merge = MERGE_CLASSES[name];
    const columns = (await db.query<{ name: string }>(`SELECT name FROM pragma_table_info('${name}')`)).map((c) => c.name);
    if (merge.by === 'updatedAt') assert.ok(columns.includes('updated_at'), `${name} is merged by updated_at it does not have`);
    if (merge.by === 'parent') {
      assert.equal(MERGE_CLASSES[merge.parent]?.by, 'updatedAt', `${name} follows ${merge.parent}, which is not merged by updated_at`);
      const parents = await db.query<{ table: string }>(`SELECT "table" FROM pragma_foreign_key_list('${name}')`);
      assert.ok(parents.some((p) => p.table === merge.parent), `${name} has no foreign key to ${merge.parent}`);
    }
  }
});

test('deleting a row from a table merged by updated_at records the deletion under its identity', async () => {
  const { db, names } = await schemaTables();
  const triggers = new Map(
    (await db.query<{ tbl_name: string; sql: string }>("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'trigger'"))
      .filter((t) => t.sql.includes('INSERT INTO deletion'))
      .map((t) => [t.tbl_name, t.sql])
  );
  for (const name of names) {
    const merge = MERGE_CLASSES[name];
    if (merge.by !== 'updatedAt') {
      assert.ok(!triggers.has(name), `${name} records deletions but is not merged by updated_at`);
      continue;
    }
    const sql = triggers.get(name);
    assert.ok(sql, `${name} has no trigger recording its deletions`);
    assert.ok(sql.includes(`VALUES ('${name}', ${merge.identity('OLD.')},`), `${name}'s trigger records something other than its identity`);
  }
});

test('the trigger stamps a deletion with the clock and keeps the later of two', async () => {
  const { db } = await schemaTables();
  await db.run("INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at) VALUES ('l-1', 1, 'x', 2, 3)");
  const before = Date.now();
  await db.run("DELETE FROM letter WHERE uuid = 'l-1'");
  const [row] = await db.query<{ deleted_at: number }>("SELECT deleted_at FROM deletion WHERE tbl = 'letter' AND row_key = 'l-1'");
  assert.ok(row.deleted_at >= before - 5 && row.deleted_at <= Date.now() + 5, `stamped ${row.deleted_at}, read ${before}`);

  await db.run("UPDATE deletion SET deleted_at = 9999999999999 WHERE row_key = 'l-1'");
  await db.run("INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at) VALUES ('l-1', 1, 'x', 2, 3)");
  await db.run("DELETE FROM letter WHERE uuid = 'l-1'");
  const [kept] = await db.query<{ deleted_at: number }>("SELECT deleted_at FROM deletion WHERE row_key = 'l-1'");
  assert.equal(kept.deleted_at, 9999999999999);
});

/* A built-in row nobody edited must not read as an edit to a Merge: a device
   installed after another one hid a built-in tag would otherwise bring the
   tag back (deletion-migration.ts). */
test('seeding stamps a built-in 0, so an edit on another device always wins over it', async () => {
  const hidden = openJournal(await migratedDb(), fakeFileStore());
  await hidden.reconcileBuiltIns();
  await hidden.tags.setTagHidden('a-work', true);

  const later = await migratedDb();
  const fresh = openJournal(later, fakeFileStore());
  await fresh.reconcileBuiltIns();
  assert.deepEqual(await later.query("SELECT DISTINCT updated_at FROM tag WHERE key IS NOT NULL"), [{ updated_at: 0 }]);

  const snapshot = await fresh.archive.snapshot();
  await hidden.archive.merge({ journal: snapshot.journal, files: (async function* () {})() });
  const tag = (await hidden.tags.getTagGroups()).flatMap((group) => group.tags).find((t) => t.id === 'a-work');
  assert.equal(tag?.hidden, true);
});

test('version 117 resets the stamp a seeding batch left on built-ins, and keeps an edited one', async () => {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 116));
  await db.run("INSERT INTO tag_group (key, name, order_index, updated_at) VALUES ('g', '', 0, 1000)");
  for (const key of ['t-1', 't-2', 't-3']) {
    await db.run("INSERT INTO tag (key, group_id, label, hidden, order_index, updated_at) SELECT ?, id, '', 0, 0, 1000 FROM tag_group", [key]);
  }
  await db.run("UPDATE tag SET hidden = 1, updated_at = 2000 WHERE key = 't-2'");
  await db.run("INSERT INTO tag (uuid, group_id, label, hidden, order_index, updated_at) SELECT 'mine', id, 'mine', 0, 1, 1000 FROM tag_group");

  await runMigrations(db, noopFileOps(), migrations);

  assert.deepEqual(await db.query('SELECT COALESCE(key, uuid) AS id, updated_at FROM tag ORDER BY id'), [
    { id: 'mine', updated_at: 1000 },
    { id: 't-1', updated_at: 0 },
    { id: 't-2', updated_at: 2000 },
    { id: 't-3', updated_at: 0 }
  ]);
});

/* The decision matrix in the header, one boundary at a time (re-check
   carpet 12: equal stamps and the tombstone rules had no test, so their
   mutants survived). */
async function letters(rows: [string, number][], deletions: [string, number][] = []) {
  const db = await migratedDb();
  for (const [uuid, at] of rows) {
    await db.run('INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at) VALUES (?, 1, ?, 2, ?)', [uuid, uuid, at]);
  }
  for (const [uuid, at] of deletions) {
    await db.run("INSERT INTO deletion (tbl, row_key, deleted_at) VALUES ('letter', ?, ?)", [uuid, at]);
  }
  return db;
}

test("a Merge takes the archive's row only when it is strictly newer, and an unstamped one never", async () => {
  const gate = await rowGate({ driver: await letters([['here', 100]]), mode: 'merge' }, 'letter');
  assert.equal(gate.fate('here', 101), 'update');
  assert.equal(gate.fate('here', 100), 'keep', 'a tie keeps this device');
  assert.equal(gate.fate('here', 99), 'keep');
  assert.equal(gate.fate('here', undefined), 'keep');
});

test('a Merge inserts a row this device deleted only when the archive wrote it after the deletion', async () => {
  const gate = await rowGate({ driver: await letters([], [['gone', 100]]), mode: 'merge' }, 'letter');
  assert.equal(gate.fate('gone', 101), 'insert');
  assert.equal(gate.fate('gone', 100), 'keep', 'a tie keeps the deletion');
  assert.equal(gate.fate('gone', undefined), 'keep');
  assert.equal(gate.fate('never-here', undefined), 'insert');
  assert.equal(gate.fate('never-here', 1), 'insert');
});

test("a Replace writes every row, over this device's copy or past its deletion", async () => {
  const gate = await rowGate({ driver: await letters([['here', 100]], [['gone', 100]]), mode: 'replace' }, 'letter');
  assert.equal(gate.fate('here', 1), 'update');
  assert.equal(gate.fate('gone', 1), 'insert');
});

test('a row the same import has just written meets a later copy of itself as present', async () => {
  const gate = await rowGate({ driver: await letters([]), mode: 'merge' }, 'letter');
  assert.equal(gate.fate('twice', 50), 'insert');
  gate.wrote('twice', 50);
  assert.equal(gate.fate('twice', 50), 'keep');
  assert.equal(gate.fate('twice', 51), 'update');
});

test('a table with no identity of its own cannot be gated', async () => {
  await assert.rejects(rowGate({ driver: await migratedDb(), mode: 'merge' }, 'entry_tag'), /entry_tag has no identity a Merge can match rows by/);
});

const deleting = (id: string, deletedAt: number) =>
  ({ deletions: [{ table: 'letter', id, deletedAt }] }) as unknown as ArchiveJournal;
const tombstone = async (db: Awaited<ReturnType<typeof migratedDb>>, id: string) =>
  (await db.query<{ deleted_at: number }>("SELECT deleted_at FROM deletion WHERE tbl = 'letter' AND row_key = ?", [id]))[0]?.deleted_at;
const present = async (db: Awaited<ReturnType<typeof migratedDb>>, id: string) =>
  (await db.query('SELECT 1 FROM letter WHERE uuid = ?', [id])).length === 1;

test("a Merged deletion removes this device's row up to and including an equal stamp, and records the archive's time", async () => {
  const db = await letters([['same', 100], ['newer', 101]]);
  await applyDeletions({ driver: db, mode: 'merge', journal: deleting('same', 100), ts: 0 });
  await applyDeletions({ driver: db, mode: 'merge', journal: deleting('newer', 100), ts: 0 });
  assert.equal(await present(db, 'same'), false);
  assert.equal(await present(db, 'newer'), true, 'written here after the deletion');
  assert.equal(await tombstone(db, 'same'), 100);
  assert.equal(await tombstone(db, 'newer'), 100, 'recorded all the same');
});

test("a Replace installs the archive's deletions without deleting a row", async () => {
  const db = await letters([['kept', 100]]);
  await applyDeletions({ driver: db, mode: 'replace', journal: deleting('kept', 200), ts: 0 });
  assert.equal(await present(db, 'kept'), true);
  assert.equal(await tombstone(db, 'kept'), 200);
});

test('a deletion this device already recorded keeps the later of the two times', async () => {
  const db = await letters([], [['early', 100], ['late', 300]]);
  await applyDeletions({ driver: db, mode: 'merge', journal: deleting('early', 200), ts: 0 });
  await applyDeletions({ driver: db, mode: 'merge', journal: deleting('late', 200), ts: 0 });
  assert.equal(await tombstone(db, 'early'), 200);
  assert.equal(await tombstone(db, 'late'), 300);
});

test('a deletion naming a table this build does not merge is left out', async () => {
  const db = await letters([]);
  await applyDeletions({
    driver: db, mode: 'merge', ts: 0,
    journal: { deletions: [{ table: 'entry_tag', id: 'x', deletedAt: 1 }, { table: 'nonsense', id: 'x', deletedAt: 1 }] } as unknown as ArchiveJournal
  });
  assert.deepEqual(await db.query('SELECT * FROM deletion'), []);
});
