import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from './test-support/migrated-db.ts';

function latch() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), release: () => resolve() };
}

const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('a snapshot waits for an existing transaction and sees its committed rows', async () => {
  const db = await migratedDb();
  const entered = latch();
  const release = latch();
  const writing = db.transaction(async (db) => {
    await db.run("INSERT INTO pref (key, value) VALUES ('snapshot-test', 'before')");
    entered.release();
    await release.promise;
    await db.run("UPDATE pref SET value = 'after' WHERE key = 'snapshot-test'");
  });
  await entered.promise;
  let reading = false;
  const snapshot = db.readSnapshot(async (reader) => {
    reading = true;
    return reader.query('SELECT value FROM pref');
  });
  await yieldTurn();
  assert.equal(reading, false);
  release.release();
  await writing;
  assert.deepEqual((await snapshot).map((row) => row.value), ['after']);
  await db.close();
});

test('plain writes and new transactions wait until a snapshot finishes all its queries', async () => {
  const db = await migratedDb();
  const entered = latch();
  const release = latch();
  const snapshot = db.readSnapshot(async (reader) => {
    assert.deepEqual(await reader.query('SELECT value FROM pref'), []);
    entered.release();
    await release.promise;
    return reader.query('SELECT value FROM pref');
  });
  await entered.promise;
  const plain = db.run("INSERT INTO pref (key, value) VALUES ('plain', 'plain')");
  const transaction = db.transaction((db) => db.run("INSERT INTO pref (key, value) VALUES ('transaction', 'transaction')"));
  await yieldTurn();
  release.release();
  assert.deepEqual(await snapshot, []);
  await Promise.all([plain, transaction]);
  assert.equal((await db.query('SELECT * FROM pref')).length, 2);
  await db.close();
});

test('failed snapshots release waiting writes and do not poison later snapshots', async () => {
  const db = await migratedDb();
  const entered = latch();
  const release = latch();
  const failed = db.readSnapshot(async (reader) => {
    entered.release();
    await release.promise;
    return reader.query('SELECT * FROM nonexistent');
  });
  const rejection = assert.rejects(failed, /no such table/);
  await entered.promise;
  const writing = db.run("INSERT INTO pref (key, value) VALUES ('after', 'after')");
  release.release();
  await rejection;
  await writing;
  assert.deepEqual((await db.readSnapshot((reader) => reader.query('SELECT value FROM pref'))).map((row) => row.value), ['after']);
  await db.close();
});

test('a primed shared read waits until a held snapshot releases the connection', async () => {
  const db = await migratedDb();
  const sql = 'SELECT value FROM pref';
  await db.query(sql);
  const entered = latch();
  const release = latch();
  const snapshot = db.readSnapshot(async (reader) => {
    await reader.query(sql);
    entered.release();
    await release.promise;
  });
  await entered.promise;
  let answered = false;
  const reading = db.query(sql).then((rows) => {
    answered = true;
    return rows;
  });
  await yieldTurn();
  const answeredInsideSnapshot = answered;
  release.release();
  await snapshot;
  assert.deepEqual(await reading, []);
  assert.equal(answeredInsideSnapshot, false);
  await db.close();
});

test('identical reads share one statement until a write, with independent result rows', async () => {
  const db = await migratedDb();
  await db.run("INSERT INTO pref (key, value) VALUES ('answer', 'before')");
  const original = db.raw.prepare.bind(db.raw);
  let statements = 0;
  db.raw.prepare = ((sql: string) => {
    if (sql === 'SELECT value FROM pref WHERE key = ?') statements++;
    return original(sql);
  }) as typeof db.raw.prepare;
  const sql = 'SELECT value FROM pref WHERE key = ?';
  const [first, second] = await Promise.all([db.query(sql, ['answer']), db.query(sql, ['answer'])]);
  assert.equal(statements, 1);
  first[0].value = 'changed in caller';
  assert.equal(second[0].value, 'before');
  assert.equal((await db.query(sql, ['answer']))[0].value, 'before');
  assert.equal(statements, 1);
  assert.deepEqual(await db.query(sql, ['other']), []);
  assert.equal(statements, 2);
  await db.run("UPDATE pref SET value = 'after' WHERE key = 'answer'");
  assert.equal((await db.query(sql, ['answer']))[0].value, 'after');
  assert.equal(statements, 3);
  await db.close();
});

test('read sharing never crosses transaction scopes or independent connections', async () => {
  const db = await migratedDb();
  const other = await migratedDb();
  const sql = 'SELECT value FROM pref';
  assert.deepEqual(await db.query(sql), []);
  await db.transaction(async (scope) => {
    await scope.run("INSERT INTO pref (key, value) VALUES ('answer', 'inside')");
    assert.deepEqual((await scope.query(sql)).map((row) => row.value), ['inside']);
    await scope.run("UPDATE pref SET value = 'changed'");
    assert.deepEqual((await scope.query(sql)).map((row) => row.value), ['changed']);
  });
  assert.deepEqual((await db.query(sql)).map((row) => row.value), ['changed']);
  assert.deepEqual(await other.query(sql), []);
  await assert.rejects(db.transaction(async (scope) => {
    await scope.run("UPDATE pref SET value = 'rollback'");
    assert.deepEqual((await scope.query(sql)).map((row) => row.value), ['rollback']);
    throw new Error('rollback');
  }), /rollback/);
  assert.deepEqual((await db.query(sql)).map((row) => row.value), ['changed']);
  await db.close();
  await other.close();
});

test('a rejected shared read can retry without a write', async () => {
  const db = await migratedDb();
  const original = db.raw.prepare.bind(db.raw);
  let fail = true;
  db.raw.prepare = ((sql: string) => {
    if (fail) { fail = false; throw new Error('read failed'); }
    return original(sql);
  }) as typeof db.raw.prepare;
  const first = db.query('SELECT value FROM pref');
  const second = db.query('SELECT value FROM pref');
  await Promise.all([assert.rejects(first, /read failed/), assert.rejects(second, /read failed/)]);
  assert.deepEqual(await db.query('SELECT value FROM pref'), []);
  await db.close();
});
