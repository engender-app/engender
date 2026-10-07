/* The gate the journal facade and the session key sit behind (after-release
   ticket 10): what is handed out while the journal is open, what waits while
   it is locked, and what a lock waits for before the database closes. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sessionGate } from './sessionGate.ts';

const settled = <T>(promise: Promise<T>) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), 10))]);

test('a call made before anything is open waits and runs against what opens', async () => {
  const gate = sessionGate<string>();
  const answer = gate.run((value) => Promise.resolve(`read from ${value}`));
  assert.equal(await settled(answer), false);
  gate.open('first journal');
  assert.equal(await answer, 'read from first journal');
});

test('a write already running when the lock starts finishes before the lock does', async () => {
  const gate = sessionGate<string>();
  gate.open('journal');
  let finishWrite!: () => void;
  const write = gate.run(() => new Promise<string>((r) => (finishWrite = () => r('saved'))));

  const locking = gate.close();
  assert.equal(await settled(locking), false, 'the lock waits for the save in flight');
  finishWrite();
  await locking;
  assert.equal(await write, 'saved');
});

test('a write that fails still lets the lock finish', async () => {
  const gate = sessionGate<string>();
  gate.open('journal');
  const write = gate.run(() => Promise.reject(new Error('disk full')));
  await gate.close();
  await assert.rejects(write, /disk full/);
});

test('once locked, nothing is handed the old value; a call waits for the reopened one', async () => {
  const gate = sessionGate<string>();
  gate.open('before the lock');
  await gate.close();
  assert.equal(gate.current, null);

  const touched: string[] = [];
  const queued = gate.run((value) => {
    touched.push(value);
    return Promise.resolve(value);
  });
  assert.equal(await settled(queued), false);
  gate.open('after the unlock');
  assert.equal(await queued, 'after the unlock');
  assert.deepEqual(touched, ['after the unlock']);
});

test('next() answers with the current value, and after a lock only with the next one', async () => {
  const gate = sessionGate<string>();
  gate.open('key one');
  assert.equal(await gate.next(), 'key one');
  await gate.close();
  const waiting = gate.next();
  assert.equal(await settled(waiting), false, 'a locked session hands out no key');
  gate.open('key two');
  assert.equal(await waiting, 'key two');
});

test('a call started while the lock is draining waits for the reopen rather than the closing value', async () => {
  const gate = sessionGate<string>();
  gate.open('old');
  let finish!: () => void;
  void gate.run(() => new Promise<void>((r) => (finish = r)));
  const locking = gate.close();
  const late = gate.run((value) => Promise.resolve(value));
  finish();
  await locking;
  gate.open('new');
  assert.equal(await late, 'new');
});

test('a queued call counts as in flight once it starts, so the next lock waits for it too', async () => {
  const gate = sessionGate<string>();
  let finish!: () => void;
  const queued = gate.run(() => new Promise<string>((r) => (finish = () => r('done'))));
  gate.open('journal');
  const locking = gate.close();
  assert.equal(await settled(locking), false);
  finish();
  await locking;
  assert.equal(await queued, 'done');
});
