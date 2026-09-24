/* The database worker started ahead of the key (ux-carpet ticket 209), over
   a stand-in Worker: what reaches the worker and when, not what SQLite does
   with it (the browser tier opens real databases). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createConversionTarget,
  createEncryptedWebSqlite,
  prewarmJournalWorker,
  releaseOnPageHide,
  releasePrewarmedJournalWorker
} from './mc-driver';

type Posted = { id: number; op: string; args: Record<string, unknown> };

class FakeWorker {
  static made: FakeWorker[] = [];
  static silent = false;
  posted: Posted[] = [];
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(message: Posted) {
    this.posted.push(message);
    /* A terminated worker answers nothing, as a real one does. */
    if (FakeWorker.silent || this.terminated) return;
    /* Answers every message at once, the way a worker that has already
       attached does. */
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true, result: undefined } }));
  }
  terminate() {
    this.terminated = true;
  }
}

const g = globalThis as Record<string, unknown>;
let prior: unknown;

beforeEach(() => {
  prior = g.Worker;
  g.Worker = FakeWorker;
  FakeWorker.made = [];
  FakeWorker.silent = false;
});

afterEach(async () => {
  FakeWorker.silent = false;
  await releasePrewarmedJournalWorker();
  g.Worker = prior;
});

const key = new Uint8Array([1, 2, 3]);

describe('the database worker started ahead of the key', () => {
  it('attaches the pool and holds no key', () => {
    void prewarmJournalWorker('journal.sqlite3');
    const [worker] = FakeWorker.made;
    expect(worker.posted.map((m) => m.op)).toEqual(['attach']);
    expect(JSON.stringify(worker.posted)).not.toMatch(/hexKey/i);
  });

  it('is the worker the journal opens through, once the key exists', () => {
    void prewarmJournalWorker('journal.sqlite3');
    createEncryptedWebSqlite('journal.sqlite3', key);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].posted.map((m) => m.op)).toEqual(['attach', 'open']);
    expect(FakeWorker.made[0].posted[1].args.hexKey).toBe('010203');
  });

  it('is not handed to a different database', () => {
    void prewarmJournalWorker('journal.sqlite3');
    createEncryptedWebSqlite('other.sqlite3', key);
    expect(FakeWorker.made).toHaveLength(2);
  });

  it('lets go of the pool before a conversion asks for it', async () => {
    void prewarmJournalWorker('journal.sqlite3');
    const target = createConversionTarget('journal.sqlite3', key);
    await target.writeFrom(new Uint8Array([9]));
    const [early, conversion] = FakeWorker.made;
    expect(early.posted.map((m) => m.op)).toEqual(['attach', 'close']);
    expect(early.terminated).toBe(true);
    expect(conversion.posted.map((m) => m.op)).toEqual(['convert']);
  });

  it('fails what is posted after it died instead of leaving it waiting', async () => {
    FakeWorker.silent = true;
    const attached = prewarmJournalWorker('journal.sqlite3');
    /* Dies before answering: the attach fails, and so does the open that
       arrives with the key later, with the same cause - a boot error, not a
       boot that waits forever. */
    FakeWorker.made[0].onerror?.({ message: 'wasm failed to compile' });
    await expect(attached).rejects.toThrow(/wasm failed to compile/);
    const { driver } = createEncryptedWebSqlite('journal.sqlite3', key);
    await expect(driver.query('SELECT 1')).rejects.toThrow(/wasm failed to compile/);
  });

  it('keeps nothing when a worker cannot be constructed, so boot can still start', async () => {
    g.Worker = class {
      constructor() {
        throw new Error('module workers are not allowed here');
      }
    };
    await expect(prewarmJournalWorker('journal.sqlite3')).rejects.toThrow(/not allowed/);
    g.Worker = FakeWorker;
    createEncryptedWebSqlite('journal.sqlite3', key);
    expect(FakeWorker.made[0].posted.map((m) => m.op)).toEqual(['open']);
  });
});

/* ux-carpet 215: a boot that failed closes its driver twice - once in boot()
   and once in closeActiveDriver() - and the second close went to a worker
   the first had terminated, which answers nothing. The boot waited on it
   forever and never showed the failure. */
describe('a closed worker', () => {
  it('refuses what is sent to it after close instead of leaving it unanswered', async () => {
    const { driver } = createEncryptedWebSqlite('journal.sqlite3', key);
    await driver.close();
    const settled = await Promise.race([
      driver.close().then(
        () => 'resolved',
        () => 'rejected'
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50))
    ]);
    expect(settled).toBe('rejected');
  });
});

/* ux-carpet 219: the copy check and the restore are what a failed boot does
   after it has closed its driver, so they cannot go to that driver's worker. */
describe('the pre-migration copy after the driver has closed', () => {
  it('is asked of a worker of its own, pointed at the files without opening them, and closed after', async () => {
    const { driver, fileOps } = createEncryptedWebSqlite('journal.sqlite3', key);
    await driver.close();
    await fileOps.preMigrationCopyIsUsable();
    expect(FakeWorker.made).toHaveLength(2);
    const [, own] = FakeWorker.made;
    expect(own.posted.map((m) => m.op)).toEqual(['target', 'preMigrationCopyIsUsable', 'close']);
    expect(own.posted[0].args).toMatchObject({ path: 'journal.sqlite3' });
    expect(own.terminated).toBe(true);
  });

  it('restores through a worker of its own too', async () => {
    const { driver, fileOps } = createEncryptedWebSqlite('journal.sqlite3', key);
    await driver.close();
    await fileOps.restorePreMigrationCopy();
    expect(FakeWorker.made[1].posted.map((m) => m.op)).toEqual(['target', 'restorePreMigrationCopy', 'close']);
  });

  it('still goes through the open driver while it is open, since the pool is its', async () => {
    const { fileOps } = createEncryptedWebSqlite('journal.sqlite3', key);
    await fileOps.preMigrationCopyIsUsable();
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].posted.map((m) => m.op)).toEqual(['open', 'preMigrationCopyIsUsable']);
  });
});

/* ux-carpet 222: a retry pressed while the copy check's worker still holds
   the pool asked for it at once and failed with "Access Handles cannot be
   created". A new connection waits for that worker to close. */
describe('a connection made while a recovery worker is running', () => {
  it('sends nothing until the recovery worker has closed', async () => {
    const { driver, fileOps } = createEncryptedWebSqlite('journal.sqlite3', key);
    await driver.close();
    FakeWorker.silent = true;
    const check = fileOps.preMigrationCopyIsUsable();
    await Promise.resolve();
    FakeWorker.silent = false;
    createEncryptedWebSqlite('journal.sqlite3', key);
    const [, recovery, retry] = FakeWorker.made;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(retry.posted).toEqual([]);

    /* The recovery worker answers its target, its check and its close. */
    for (const message of recovery.posted) recovery.onmessage?.({ data: { id: message.id, ok: true, result: false } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const message of recovery.posted.slice(2)) recovery.onmessage?.({ data: { id: message.id, ok: true } });
    await check;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(retry.posted.map((m) => m.op)).toEqual(['open']);
  });
});

/* ux-carpet 243: a tab that reloads or navigates away leaves its own
   worker's pool for the browser to reclaim from a worker it is about to
   kill outright, which can race the next boot's own `attach()`. Posting a
   `close` on this tab's own `pagehide` ahead of that is what narrows it. */
describe('releasing every live connection on pagehide', () => {
  it('posts close to a worker still holding the pool', () => {
    void prewarmJournalWorker('journal.sqlite3');
    const [worker] = FakeWorker.made;

    releaseOnPageHide();

    expect(worker.posted.map((m) => m.op)).toEqual(['attach', 'close']);
    /* Fire-and-forget: the worker is left to answer in its own time, not
       terminated by the tab that is on its way out either way. */
    expect(worker.terminated).toBe(false);
  });

  it('reaches every connection this tab holds, not only the prewarmed one', () => {
    void prewarmJournalWorker('journal.sqlite3');
    createEncryptedWebSqlite('other.sqlite3', key);
    expect(FakeWorker.made).toHaveLength(2);

    releaseOnPageHide();

    for (const worker of FakeWorker.made) {
      expect(worker.posted.map((m) => m.op)).toEqual(expect.arrayContaining(['close']));
    }
  });

  it('leaves a connection that is already closed alone', async () => {
    const { driver } = createEncryptedWebSqlite('journal.sqlite3', key);
    await driver.close();
    const [worker] = FakeWorker.made;
    expect(worker.posted.map((m) => m.op)).toEqual(['open', 'close']);

    releaseOnPageHide();

    /* terminate() already dropped this connection from the tracked set
       (mc-driver.ts), so there is nothing left here to post a second
       close to. */
    expect(worker.posted.map((m) => m.op)).toEqual(['open', 'close']);
  });
});
