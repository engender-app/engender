/* One transaction at a time over one connection (ticket 134). Part of the
   Node tier; run with `npm test`. */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, vi } from 'vitest';
import { oneTransactionAtATime } from './transactor.ts';

/** A connection that records the statements a transaction sends it, and
    fails a BEGIN that arrives while one is already open - which is what
    SQLite itself does ("cannot start a transaction within a transaction"). */
function connection() {
  const sent: string[] = [];
  let open = false;
  return {
    sent,
    steps: {
      async begin() {
        if (open) throw new Error('cannot start a transaction within a transaction');
        open = true;
        sent.push('BEGIN');
      },
      async commit() {
        open = false;
        sent.push('COMMIT');
      },
      async rollback() {
        open = false;
        sent.push('ROLLBACK');
      }
    }
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('two transactions started at once run one after the other', async () => {
  const db = connection();
  const transaction = oneTransactionAtATime(db.steps);

  await Promise.all([
    transaction(async () => {
      db.sent.push('first-a');
      await tick();
      db.sent.push('first-b');
    }),
    transaction(async () => {
      db.sent.push('second');
    })
  ]);

  assert.deepEqual(db.sent, ['BEGIN', 'first-a', 'first-b', 'COMMIT', 'BEGIN', 'second', 'COMMIT']);
});

test("a failed transaction rolls back its own work and not the next one's", async () => {
  const db = connection();
  const transaction = oneTransactionAtATime(db.steps);

  const failing = transaction(async () => {
    await tick();
    throw new Error('the write went wrong');
  });
  const following = transaction(async () => {
    db.sent.push('second');
  });

  await assert.rejects(failing, /the write went wrong/);
  await following;
  assert.deepEqual(db.sent, ['BEGIN', 'ROLLBACK', 'BEGIN', 'second', 'COMMIT']);
});

test('a BEGIN that fails is not followed by a ROLLBACK', async () => {
  // A rollback issued for a transaction that never began would take back
  // whatever else the connection had open - the failure mode worth naming,
  // since that is a commit nobody asked to lose.
  const sent: string[] = [];
  const transaction = oneTransactionAtATime({
    begin: async () => {
      sent.push('BEGIN');
      throw new Error('the database is locked');
    },
    commit: async () => void sent.push('COMMIT'),
    rollback: async () => void sent.push('ROLLBACK')
  });

  await assert.rejects(transaction(async () => void sent.push('body')), /the database is locked/);
  assert.deepEqual(sent, ['BEGIN']);
});

test('a rejected transaction does not fail the ones queued behind it', async () => {
  const db = connection();
  const transaction = oneTransactionAtATime(db.steps);

  const failing = transaction(async () => {
    throw new Error('first');
  });
  const following = transaction(async () => 'second');

  await assert.rejects(failing, /first/);
  assert.equal(await following, 'second');
});

test.each(['statement', 'commit'] as const)('rollback failure keeps the %s failure as its cause and does not poison queued work', async (stage) => {
  const originalCause = new Error('original diagnostic');
  const original = new Error('database or disk is full', { cause: originalCause });
  const rollback = new Error('cannot rollback - no transaction is active');
  const db = connection();
  let refuseCommit = stage === 'commit';
  const transaction = oneTransactionAtATime({
    ...db.steps,
    async commit() {
      if (refuseCommit) { refuseCommit = false; throw original; }
      await db.steps.commit();
    },
    async rollback() { await db.steps.rollback(); throw rollback; }
  });
  const failing = transaction(() => { if (stage === 'statement') throw original; });
  const following = transaction(() => 'following');
  await assert.rejects(failing, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, original.message);
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, original);
    assert.equal(original.cause, originalCause);
    assert.deepEqual(error.errors, [original, rollback]);
    return true;
  });
  assert.equal(await following, 'following');
  assert.equal(db.sent.at(-1), 'COMMIT');
});

test('real SQLite automatic rollback preserves SQLITE_FULL and allows the next queued transaction', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE entry (body TEXT); PRAGMA max_page_count = 20');
    const transaction = oneTransactionAtATime({
      async begin() { db.exec('BEGIN'); },
      async commit() { db.exec('COMMIT'); },
      async rollback() { db.exec('ROLLBACK'); }
    });
    const failing = transaction(() => {
      const insert = db.prepare('INSERT INTO entry VALUES (?)');
      insert.run('first');
      for (let i = 0; i < 1000; i++) insert.run('x'.repeat(2000));
    });
    const following = transaction(() => db.prepare('INSERT INTO entry VALUES (?)').run('following'));
    await assert.rejects(failing, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /database or disk is full/);
      assert.ok(error instanceof AggregateError);
      assert.equal((error.cause as Error & { errcode: number }).errcode, 13);
      assert.equal(error.errors[0], error.cause);
      assert.match(error.errors[1].message, /cannot rollback - no transaction is active/);
      return true;
    });
    await following;
    assert.deepEqual(db.prepare('SELECT body FROM entry').all().map((row) => row.body), ['following']);
  } finally { db.close(); }
});

 test('a failed post-commit cleanup preserves the committed result and runs later cleanups', async () => {
  const { migratedDb } = await import('./test-support/migrated-db');
  const db = await migratedDb();
  const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const later = vi.fn(async () => {});
  try {
    assert.equal(await db.transaction(async (scope) => {
      await scope.run("INSERT INTO pref (key, value) VALUES ('cleanup-proof', 'kept')");
      scope.deferUntilCommit!(async () => { throw new Error('file busy'); });
      scope.deferUntilCommit!(later);
      return 'saved';
    }), 'saved');
    assert.equal((await db.query<{ value: string }>("SELECT value FROM pref WHERE key = 'cleanup-proof'"))[0].value, 'kept');
    assert.equal(warned.mock.calls.length, 1);
    assert.equal(later.mock.calls.length, 1);
  } finally {
    warned.mockRestore();
    await db.close();
  }
});
