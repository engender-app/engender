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
    /** One database call, the way a repository makes them: refused once
        the worker is closed, as the real driver refuses. */
    async query() {
      if (this.closed) throw new Error('the database worker was closed');
      return name;
    },
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

test('a lock whose suspend fails still closes the database and lets go of the key', async () => {
  const log: string[] = [];
  const first = fakeDriver('driver 1', log);
  const session = journalSession<Key, FakeDriver>({
    suspend: () => Promise.reject(new Error('a preference write would not flush')),
    open: async () => fakeDriver('driver 2', log),
    release: () => log.push('released'),
    prewarm: () => log.push('prewarmed')
  });
  session.adopt(keyOf(1), first);
  await session.lock();
  assert.equal(first.closed, true);
  assert.equal(session.key.current, null);
  assert.equal(session.locked, true);
  await session.unlock(keyOf(1));
  assert.equal(session.driver?.name, 'driver 2', 'and the unlock can still reopen');
});

test('a call that never settles does not hold the key past the limit', async () => {
  const log: string[] = [];
  const first = fakeDriver('driver 1', log);
  const journals = sessionGate<string>();
  journals.open('driver 1');
  void journals.run(() => new Promise<void>(() => {}));
  const session = journalSession<Key, FakeDriver>(
    {
      suspend: () => journals.close(),
      open: async () => fakeDriver('driver 2', log),
      release: () => log.push('released'),
      prewarm: () => log.push('prewarmed')
    },
    { suspendLimitMs: 20 }
  );
  session.adopt(keyOf(1), first);
  await session.lock();
  assert.equal(first.closed, true, 'closing the worker is what rejects the hung call');
  assert.equal(session.key.current, null);
});

test('a save still staging photos when the drain runs out lands on the reopened database', async () => {
  /* The pending-save guard's third scenario: the save is inside its facade
     call, encrypting a photo, when the lock comes. It is still there when
     the drain gives up and the worker closes, and only after the unlock does
     it reach its transaction. The database it reaches has to be the open
     one, not the one it could see when it started. */
  const log: string[] = [];
  const first = fakeDriver('driver 1', log);
  const journals = sessionGate<string>();
  journals.open('journal 1');
  const session = journalSession<Key, FakeDriver>(
    {
      suspend: () => journals.close(),
      open: async () => fakeDriver('driver 2', log),
      release: () => {},
      prewarm: () => {}
    },
    { suspendLimitMs: 20 }
  );
  session.adopt(keyOf(1), first);
  let photoStaged!: () => void;
  const save = journals.run(async () => {
    await new Promise<void>((r) => (photoStaged = r));
    return session.connection.run((driver) => driver.query());
  });

  await session.lock();
  assert.equal(first.closed, true);
  await session.unlock(keyOf(1));
  photoStaged();

  assert.equal(await save, 'driver 2');
});

test('a database call made while locked waits for the unlock rather than failing', async () => {
  const { session, boot } = setup();
  boot(keyOf(1));
  await session.lock();
  const call = session.connection.run((driver) => driver.query());
  assert.equal(await settled(call), false);
  await session.unlock(keyOf(1));
  assert.equal(await call, 'driver 2');
});

test('a database call already running when the lock comes finishes before the worker closes', async () => {
  const { session, boot, first, log } = setup();
  boot(keyOf(1));
  let finish!: () => void;
  const call = session.connection.run(async (driver) => {
    await new Promise<void>((r) => (finish = r));
    log.push('call finished');
    return driver.query();
  });
  const locking = session.lock();
  assert.equal(await settled(locking), false);
  finish();
  await locking;
  assert.equal(await call, 'driver 1');
  assert.equal(first.closed, true);
  assert.deepEqual(log.slice(0, 3), ['suspended', 'call finished', 'close driver 1']);
});

test('an unlock that arrives while the lock waits on a slow save stops the wait', async () => {
  /* The save lands on the reopened database whenever it gets there, so
     holding the person at "Decrypting..." until the limit buys nothing. */
  const log: string[] = [];
  const journals = sessionGate<string>();
  journals.open('journal 1');
  const session = journalSession<Key, FakeDriver>(
    {
      suspend: () => journals.close(),
      open: async () => fakeDriver('driver 2', log),
      release: () => {},
      prewarm: () => {}
    },
    { suspendLimitMs: 60_000 }
  );
  session.adopt(keyOf(1), fakeDriver('driver 1', log));
  void journals.run(() => new Promise<void>(() => {}));
  const locking = session.lock();
  assert.equal(await settled(locking), false);
  const unlocking = session.unlock(keyOf(1));
  assert.equal(await settled(Promise.all([locking, unlocking])), true);
  assert.equal(session.driver?.name, 'driver 2');
  assert.equal(session.locked, false);
});
