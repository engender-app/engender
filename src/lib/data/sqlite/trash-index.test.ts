import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openJournal } from '../journal/journal.ts';
import { countingDriver } from '../journal/test-support.ts';
import { purgeExpiredTrash, TRASH_WINDOW_DAYS } from '../journal/entries.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migrations } from './migrations.ts';
import { runMigrations } from './migration-runner.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { dumpRows } from './test-support/schema-dump.ts';

const DAY_COUNT = 3653;

test('schema 92 keeps live reads on day indexes and trash reads on the trash index without changing results', async () => {
  const db = makeNodeSqliteDb();
  try {
    await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 88));
    // The journal reads this build's column name; version 119 is what renames
    // it, and this test stops at 92, so the rename is made by hand here.
    db.raw.exec('ALTER TABLE entry RENAME COLUMN presentation_id TO presentation_uuid');
    const freshTrash = Date.now();
    const expiredTrash = freshTrash - (TRASH_WINDOW_DAYS + 1) * 86_400_000;
    const insert = db.raw.prepare(`INSERT INTO entry
      (uuid, epoch_day, timestamp, mood, note, updated_at, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    db.raw.exec('BEGIN');
    for (let day = 1; day <= DAY_COUNT; day += 1) {
      insert.run(`entry-${day}`, day, day * 86_400_000, day % 5 + 1, `Note ${day}`, 1,
        day === DAY_COUNT ? freshTrash : day % 100 === 0 ? expiredTrash : null);
    }
    insert.run('second-entry', DAY_COUNT - 1, DAY_COUNT * 86_400_000, 5, 'Same day', 1, null);
    db.raw.exec("INSERT INTO entry_body_region (entry_id, region, value) VALUES (1, 'chest', 65)");
    db.raw.exec("INSERT INTO saved_question (uuid, name, starred, updated_at) VALUES ('question', 'Still here', 1, 1)");
    db.raw.exec('COMMIT');
    const originalEntries = db.raw.prepare('SELECT * FROM entry ORDER BY id').all();
    const originalRegions = db.raw.prepare('SELECT * FROM entry_body_region').all();
    const originalQuestions = db.raw.prepare('SELECT * FROM saved_question').all();

    // Start at the released schema, then isolate the index migration from
    // earlier migrations that add columns to other tables.
    await runMigrations(db, noopFileOps(), migrations.filter((migration) => migration.version <= 91));
    const beforeRows = dumpRows(db.raw);
    const queries: { sql: string; params: unknown[] }[] = [];
    const { driver } = countingDriver(db, {
      onQuery: (sql, params) => queries.push({ sql, params: params ?? [] })
    });
    const files = fakeFileStore();
    const journal = openJournal(driver, files);
    const reads = [
      () => journal.entries.recentDays(7),
      () => journal.stats.entryCountsByDay(DAY_COUNT - 30, DAY_COUNT),
      () => journal.entries.lastWriteEpochDay(DAY_COUNT),
      () => journal.stats.dayAverages('mood', DAY_COUNT - 30, DAY_COUNT),
      () => journal.entries.trashedEntries()
    ];
    const before = [];
    for (const read of reads) before.push(await read());
    const liveQueries = queries.filter(({ sql }) => /FROM entry(?: e)?\s/.test(sql) && /trashed_at IS NULL/.test(sql));
    assert.equal(liveQueries.length, 4);

    let copies = 0;
    await runMigrations(db, {
      ...noopFileOps(),
      copyDatabaseFile() { copies += 1; },
      cleanupPreMigrationCopy() { assert.fail('migration must retain its recovery copy'); }
    }, migrations.filter((migration) => migration.version <= 92));
    assert.equal(db.getUserVersion(), 92);
    assert.equal(copies, 1);
    assert.equal(dumpRows(db.raw), beforeRows);
    assert.deepEqual(db.raw.prepare('SELECT * FROM entry ORDER BY id').all(), originalEntries);
    assert.deepEqual(db.raw.prepare('SELECT * FROM entry_body_region').all(), originalRegions);
    assert.deepEqual(db.raw.prepare('SELECT * FROM saved_question').all(), originalQuestions);
    for (const [index, read] of reads.entries()) assert.deepEqual(await read(), before[index]);

    const plan = ({ sql, params }: { sql: string; params: unknown[] }) =>
      (db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params as never[]) as { detail: string }[])
        .map((row) => row.detail).join('\n');
    for (const query of liveQueries) {
      assert.match(plan(query), /USING (?:COVERING )?INDEX idx_entry_epoch_day/);
      assert.doesNotMatch(plan(query), /idx_entry_trashed_at/);
    }
    // recentDays has an outer day lookup and an inner distinct-day scan.
    assert.equal(plan(liveQueries[0]).match(/INDEX idx_entry_epoch_day/g)?.length, 2);
    const trashQuery = queries.find(({ sql }) => /WHERE trashed_at IS NOT NULL ORDER BY/.test(sql));
    assert.ok(trashQuery);
    assert.match(plan(trashQuery), /USING (?:COVERING )?INDEX idx_entry_trashed_at/);

    assert.equal(await purgeExpiredTrash(driver, files), 36);
    const purgeQuery = queries.find(({ sql }) => /trashed_at IS NOT NULL AND trashed_at <=/.test(sql));
    assert.ok(purgeQuery);
    assert.match(plan(purgeQuery), /SEARCH entry USING (?:COVERING )?INDEX idx_entry_trashed_at/);
    assert.deepEqual((await journal.entries.trashedEntries()).map((entry) => entry.id), [DAY_COUNT]);
    assert.equal(await journal.entries.countAll(), DAY_COUNT - 36);
  } finally {
    await db.close();
  }
});
