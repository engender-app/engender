import { expect, test } from 'vitest';
import type { SqliteDriver, SqliteReader } from './driver';
import { migratedDb } from './test-support/migrated-db';

function latch() {
  let release!: () => void;
  return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
}

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('outside writes wait through rollback and keep their own rows', async () => {
  const db = await migratedDb();
  const entered = latch();
  const release = latch();
  const failed = db.transaction(async (scope) => {
    await scope.run("INSERT INTO pref VALUES ('rolled-back', 'no')");
    entered.release();
    await release.promise;
    throw new Error('deliberate rollback');
  });
  const rejection = expect(failed).rejects.toThrow('deliberate rollback');
  await entered.promise;
  let saved = false;
  const outside = db.run("INSERT INTO pref VALUES ('outside', 'yes')").then(() => { saved = true; });
  await yieldTurn();
  expect(saved).toBe(false);
  release.release();
  await rejection;
  await outside;
  expect(await db.query('SELECT key FROM pref')).toEqual([{ key: 'outside' }]);
  await db.close();
});

for (const rollback of [false, true]) {
  test(`transaction scope expires after ${rollback ? 'rollback' : 'commit'}`, async () => {
    const db = await migratedDb();
    let captured!: SqliteDriver;
    const writing = db.transaction(async (scope) => {
      captured = scope;
      await scope.run("INSERT INTO pref VALUES ('owned', 'yes')");
      if (rollback) throw new Error('deliberate rollback');
    });
    if (rollback) await expect(writing).rejects.toThrow('deliberate rollback');
    else await writing;
    await expect(captured.run("INSERT INTO pref VALUES ('late', 'no')")).rejects.toThrow('scope has expired');
    await expect(captured.query('SELECT * FROM pref')).rejects.toThrow('scope has expired');
    expect(await db.query("SELECT key FROM pref WHERE key = 'late'")).toEqual([]);
    await db.close();
  });
}

test('scope rejects nested transactions, snapshots and close without poisoning its transaction', async () => {
  const db = await migratedDb();
  await db.transaction(async (scope) => {
    await expect(scope.transaction(() => {})).rejects.toThrow('nested transactions');
    await expect(scope.readSnapshot(async () => {})).rejects.toThrow('inside a transaction');
    await expect(scope.close()).rejects.toThrow('cannot close');
    await scope.run("INSERT INTO pref VALUES ('owned', 'yes')");
  });
  expect(await db.query('SELECT key FROM pref')).toEqual([{ key: 'owned' }]);
  await db.close();
});

test('snapshot reader expires after its callback', async () => {
  const db = await migratedDb();
  let captured!: SqliteReader;
  await db.readSnapshot(async (reader) => { captured = reader; });
  await expect(captured.query('SELECT * FROM pref')).rejects.toThrow('scope has expired');
  await db.close();
});

test('snapshot reservation drains prior calls and blocks later calls before its callback starts', async () => {
  const db = await migratedDb();
  const first = db.run("INSERT INTO pref VALUES ('prior', 'yes')");
  const entered = latch();
  const release = latch();
  const snapshot = db.readSnapshot(async (reader) => {
    entered.release();
    await release.promise;
    return reader.query('SELECT key FROM pref ORDER BY key');
  });
  const later = db.run("INSERT INTO pref VALUES ('later', 'yes')");
  await first;
  await entered.promise;
  release.release();
  expect(await snapshot).toEqual([{ key: 'prior' }]);
  await later;
  await db.close();
});
