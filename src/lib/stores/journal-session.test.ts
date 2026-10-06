/* What a lock does to an open web journal and what unlocking undoes
   (after-release ticket 10). The ports are the parts that live in runes or
   in a worker; the session's own state - which driver is open, whether the
   key is handed out - is what these tests read. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { journalSession } from './journal-session.ts';
import { sessionGate } from '../data/live/sessionGate.ts';

const settled = <T>(promise: Promise<T>) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), 10))]);

type Key = Uint8Array<ArrayBuffer>;
const keyOf = (byte: number): Key => new Uint8Array(32).fill(byte);

function fakeDriver(name: string, log: string[]) {
  return {
    name,
    closed: false,
    async close() {
      this.closed = true;
      log.push(`close ${name}`);
    }
  };
}
type FakeDriver = ReturnType<typeof fakeDriver>;

function setup() {
  const log: string[] = [];
  const journals = sessionGate<string>();
  const opened: Key[] = [];
  let failOpen: Error | null = null;
  const session = journalSession<Key, FakeDriver>({
    async suspend() {
      await journals.close();
      log.push('suspended');
    },
    async open(key) {
      if (failOpen) throw failOpen;
      opened.push(key);
      const driver = fakeDriver(`driver ${opened.length + 1}`, log);
      journals.open(driver.name);
      return driver;
    },
    release() {
      log.push('released');
    },
    prewarm() {
      log.push('prewarmed');
    }
  });
  const first = fakeDriver('driver 1', log);
  return {
    log,
    journals,
    opened,
    session,
    first,
    failNextOpen(error: Error) {
      failOpen = error;
    },
    boot(key: Key) {
      journals.open(first.name);
      session.adopt(key, first);
    }
  };
}

test('after a lock the driver is closed and the session holds no usable key', async () => {
  const { session, boot, first } = setup();
  const key = keyOf(7);
  boot(key);
  assert.equal(session.key.current, key);

  await session.lock();

  assert.equal(first.closed, true, 'the database worker was asked to close');
  assert.equal(session.driver, null);
  assert.equal(session.key.current, null);
  assert.equal(await settled(session.key.next()), false, 'nothing waiting on the key is handed the old one');
  assert.equal(session.locked, true);
});

test('a save in flight when the lock starts lands before the database closes', async () => {
  const { session, boot, journals, log } = setup();
  boot(keyOf(1));
  let finishSave!: () => void;
  const save = journals.run(
    () =>
      new Promise<void>((r) => {
        finishSave = () => {
          log.push('save landed');
          r();
        };
      })
  );

  const locking = session.lock();
  assert.equal(await settled(locking), false);
  finishSave();
  await locking;
  await save;
  assert.deepEqual(log, ['save landed', 'suspended', 'close driver 1', 'released', 'prewarmed']);
});

test('a write made while locked waits and lands on the reopened journal', async () => {
  const { session, boot, journals } = setup();
  boot(keyOf(1));
  await session.lock();
  const write = journals.run((journal) => Promise.resolve(`written to ${journal}`));
  assert.equal(await settled(write), false);
  await session.unlock(keyOf(1));
  assert.equal(await write, 'written to driver 2');
});

test('unlocking opens the journal under the key just derived and hands it out again', async () => {
  const { session, boot, opened } = setup();
  boot(keyOf(3));
  await session.lock();
  const draftWaiting = session.key.next();

  const derived = keyOf(3);
  await session.unlock(derived);

  assert.deepEqual(opened, [derived]);
  assert.equal(session.key.current, derived);
  assert.equal(await draftWaiting, derived, 'a draft write held over the lock gets the key back');
  assert.equal(session.driver?.name, 'driver 2');
  assert.equal(session.locked, false);
});

test('an unlock that arrives while the lock is still closing waits for it to finish', async () => {
  const { session, boot, journals, log } = setup();
  boot(keyOf(1));
  let finish!: () => void;
  void journals.run(() => new Promise<void>((r) => (finish = r)));
  const locking = session.lock();
  const unlocking = session.unlock(keyOf(1));
  finish();
  await Promise.all([locking, unlocking]);
  assert.deepEqual(log, ['suspended', 'close driver 1', 'released', 'prewarmed']);
  assert.equal(session.driver?.name, 'driver 2');
  assert.equal(session.locked, false);
});

test('a reopen that fails leaves the session locked and holding no key', async () => {
  const { session, boot, failNextOpen } = setup();
  boot(keyOf(1));
  await session.lock();
  failNextOpen(new Error('the database worker stopped'));
  await assert.rejects(session.unlock(keyOf(1)), /worker stopped/);
  assert.equal(session.key.current, null);
  assert.equal(session.driver, null);
  assert.equal(session.locked, true);
});

test('a lock with no journal open, at a cold gate, closes nothing', async () => {
  const { session, log } = setup();
  await session.lock();
  assert.deepEqual(log, []);
  assert.equal(session.locked, false, 'nothing was open, so there is nothing to reopen');
});

test('an unlock without a lock before it reopens nothing', async () => {
  const { session, boot, opened, first } = setup();
  boot(keyOf(1));
  await session.unlock(keyOf(1));
  assert.deepEqual(opened, []);
  assert.equal(session.driver, first);
});

test('a lock that finds the database already gone still lets go of the key', async () => {
  const { session, boot, first } = setup();
  boot(keyOf(1));
  first.close = async () => {
    throw new Error('the database worker was closed');
  };
  await session.lock();
  assert.equal(session.key.current, null);
  assert.equal(session.driver, null);
});
