/* One transaction at a time over one connection (ticket 134). Part of the
   Node tier; run with `npm test`. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
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
