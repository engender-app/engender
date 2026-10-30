/* Every table has a Merge class, and every table merged by `updated_at`
   records its deletions (functional audit ticket 48, archiveMerge.ts).

   Read off the migrated schema rather than a list kept beside it, so a table
   a later ticket adds fails here until it is classified, and a table a later
   migration rebuilds fails here if the rebuild dropped its deletion
   trigger. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { runMigrations } from '../sqlite/migration-runner.ts';
import { migrations } from '../sqlite/migrations.ts';
import { makeNodeSqliteDb } from '../sqlite/test-support/node-sqlite-driver.ts';
import { migratedDb, noopFileOps } from '../sqlite/test-support/migrated-db.ts';
import { MERGE_CLASSES } from './archiveMerge.ts';
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
