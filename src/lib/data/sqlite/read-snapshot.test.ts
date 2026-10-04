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
