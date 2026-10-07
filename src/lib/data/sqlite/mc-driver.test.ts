/* The database worker started ahead of the key (ux-carpet ticket 209), over
   a stand-in Worker: what reaches the worker and when, not what SQLite does
   with it (the browser tier opens real databases). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEncryptedWebSqlite,
  prewarmJournalWorker,
  releaseOnPageHide,
  releasePrewarmedJournalWorker
} from './mc-driver';
import { InterruptedRestoreError, SchemaTooNewError } from './migration-runner';

type Posted = { id: number; op: string; args: Record<string, unknown> };

class FakeWorker {
  static made: FakeWorker[] = [];
  static silent = false;
  static seedResult: unknown = true;
  posted: Posted[] = [];
  terminated = false;
  transferred: Transferable[][] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(message: Posted, transfer: Transferable[] = []) {
    this.posted.push(message);
    this.transferred.push(transfer);
    /* A terminated worker answers nothing, as a real one does. */
    if (FakeWorker.silent || this.terminated) return;
    /* Answers every message at once, the way a worker that has already
       attached does. */
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true, result: message.op === 'seedDemoPersona' ? FakeWorker.seedResult : undefined } }));
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
  FakeWorker.seedResult = true;
});

afterEach(async () => {
  FakeWorker.silent = false;
  await releasePrewarmedJournalWorker();
  g.Worker = prior;
  vi.unstubAllGlobals();
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

  it('shares an early HTML prewarm with the later boot prewarm', () => {
    const early = prewarmJournalWorker('journal.sqlite3');
    const later = prewarmJournalWorker('journal.sqlite3');
    expect(later).toBe(early);
    createEncryptedWebSqlite('journal.sqlite3', key);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].posted.map((m) => m.op)).toEqual(['attach', 'open']);
  });

  it('attaches supplied module bytes before any boot message reaches the worker', async () => {
    let supply!: (bytes: ArrayBuffer) => void;
    const bytes = new ArrayBuffer(8);
    const early = prewarmJournalWorker('journal.sqlite3', new Promise((resolve) => { supply = resolve; }));
    expect(prewarmJournalWorker('journal.sqlite3')).toBe(early);
    createEncryptedWebSqlite('journal.sqlite3', key);
    const [worker] = FakeWorker.made;
    expect(worker.posted).toHaveLength(0);
    supply(bytes);
    await early;
    expect(worker.posted.map((m) => m.op)).toEqual(['attach', 'open']);
    expect(worker.posted[0].args.wasmBinary).toBe(bytes);
    expect(worker.transferred[0]).toEqual([bytes]);
    expect(worker.transferred[1]).toEqual([]);
  });

  /* With module bytes supplied, every post waits on them and is sent from a
     .then callback. A postMessage that throws there (a value that will not
     clone) used to escape as an uncaught error and leave the caller waiting
     forever: the entry editor's failed delete never said so. */
  it('rejects a post whose message cannot be sent, after the module bytes arrived', async () => {
    const early = prewarmJournalWorker('journal.sqlite3', Promise.resolve(new ArrayBuffer(8)));
    const { driver } = createEncryptedWebSqlite('journal.sqlite3', key);
    await early;
    const [worker] = FakeWorker.made;
    const send = worker.postMessage.bind(worker);
    worker.postMessage = (message: Posted, transfer?: Transferable[]) => {
      if (message.op === 'run') throw new Error('could not clone');
      send(message, transfer);
    };
    await expect(driver.run('UPDATE entry SET trashed_at = 1')).rejects.toThrow('could not clone');
    /* The connection is still usable: the next post goes through. */
    worker.postMessage = send;
    await driver.run('UPDATE entry SET trashed_at = 1');
    expect(worker.posted.at(-1)?.op).toBe('run');
  });

  it('reports a failed module download through later boot reads', async () => {
    const early = prewarmJournalWorker('journal.sqlite3', Promise.reject(new Error('download failed')));
    const { driver } = createEncryptedWebSqlite('journal.sqlite3', key);
    await expect(early).rejects.toThrow('download failed');
    await expect(driver.query('SELECT 1')).rejects.toThrow('download failed');
    expect(FakeWorker.made[0].posted).toHaveLength(0);
  });

  it('is not handed to a different database', () => {
    void prewarmJournalWorker('journal.sqlite3');
    createEncryptedWebSqlite('other.sqlite3', key);
    expect(FakeWorker.made).toHaveLength(2);
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

describe('demo preparation migration errors', () => {
  it('preserves the newer-schema error and its versions for the boot reducer', async () => {
    vi.stubGlobal('__DEMO__', true);
    vi.stubGlobal('OffscreenCanvas', class {});
    FakeWorker.seedResult = { foundVersion: 85, knownVersion: 84 };
    const { prepareDemoPersona } = createEncryptedWebSqlite('journal.sqlite3', key);
    await expect(prepareDemoPersona!({} as never)).rejects.toBeInstanceOf(SchemaTooNewError);
    await expect(prepareDemoPersona!({} as never)).rejects.toMatchObject({ foundVersion: 85, knownVersion: 84 });
  });

  it('preserves the interrupted-restore error for automatic recovery', async () => {
    vi.stubGlobal('__DEMO__', true);
    vi.stubGlobal('OffscreenCanvas', class {});
    FakeWorker.seedResult = { interruptedRestore: true };
    const { prepareDemoPersona } = createEncryptedWebSqlite('journal.sqlite3', key);
    await expect(prepareDemoPersona!({} as never)).rejects.toBeInstanceOf(InterruptedRestoreError);
  });
});
