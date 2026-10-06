/* The encrypted web driver implements WebSqlite over sqlite3mc in
   mc-worker.ts (ADR-0020).

   The data key arrives as bytes and leaves this file only as the hex the
   worker feeds to PRAGMA hexkey. Nothing here persists it - that is the
   keystore's job (crypto/keystore.ts), and the whole point of ADR-0018 is
   that no usable key sits beside the ciphertext.

   Construction is synchronous: the worker queues
   the open behind its own message chain, so a failure to initialize or a
   wrong key surfaces on the first statement - which is inside
   runMigrations, exactly where boot() already catches driver failures.

   Transactions are manual BEGIN/COMMIT/ROLLBACK for the same reason as in
   driver.ts: the migration runner's callback calls back into the
   driver's own exec, and the worker serializes every statement, so the
   composition holds. What the worker's ordering does not give is one
   transaction at a time - a transaction spans several messages with the
   caller's own awaits between them - so that comes from
   oneTransactionAtATime() (ticket 134). */

import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import type { WebSqlite } from './driver.ts';
import { oneTransactionAtATime, withReadSnapshots } from './transactor.ts';
import { InterruptedRestoreError, JournalBelowBaselineError, SchemaTooNewError } from './migration-runner';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/* The recovery worker in flight, if any (ux-carpet 222). The pool's access
   handles belong to one worker at a time, and after a failed boot the copy
   check holds them on a worker of its own for a few hundred ms (219). A
   "Try opening again" pressed in that window started a new worker that
   asked for the pool at once and failed with "Access Handles cannot be
   created" - every time, measured, while a retry a moment later worked. So
   a new connection holds its messages until that worker has closed. Settled
   either way: a recovery that failed has still let the pool go. */
let recovering: Promise<void> | null = null;

/* Every connection this tab has open, so `releaseOnPageHide` below can reach
   all of them without each caller (prewarm, the live driver,
   a recovery worker) remembering to register its own. Removed in
   `terminate()`, the one place a connection stops being any of this tab's
   business. */
const liveConnections = new Set<Connection>();

/** One worker and the message plumbing for the driver and prewarming. */
function connectWorker(wasmBinary?: Promise<ArrayBuffer>) {
  const worker = new Worker(new URL('./mc-worker.ts', import.meta.url), { type: 'module' });
  /* Taken now rather than read at each post, so a connection waits only for
     the recoveries started before it - which is also what keeps a recovery
     worker from waiting for itself. */
  // Demo HTML can supply the same module bytes before the worker fetches them.
  // Hold every message so attach still precedes open, even while fetching.
  let suppliedWasm: ArrayBuffer | undefined;
  const binaryReady = wasmBinary?.then((bytes) => { suppliedWasm = bytes; });
  const poolFree = binaryReady ? Promise.all([recovering, binaryReady]) : recovering;

  let nextId = 0;
  const pending = new Map<number, { resolve: (value: never) => void; reject: (reason: Error) => void }>();

  worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const { id, ok, result, error } = event.data;
    const waiter = pending.get(id);
    pending.delete(id);
    if (ok) waiter?.resolve(result as never);
    else waiter?.reject(new Error(error));
  };

  /* A worker that dies outside its own try/catch - a wasm module that
     fails to initialize, a pool it cannot acquire - answers nothing, and
     every caller waiting on it would wait for the rest of the session.
     Failing them all is the only honest answer, and it is what turns that
     class of fault into a boot error the layout can show. */
  /* And every caller after it: a worker started ahead of the key (ticket
     209, `prewarmJournalWorker`) can die before anything but `attach` has
     been posted, and a message posted to a dead worker is never answered.
     Remembered, so the `open` that comes later fails with the same cause
     and boot reports it rather than waiting forever. */
  let stopped: Error | null = null;
  function fail(failure: Error) {
    stopped = failure;
    for (const waiter of pending.values()) waiter.reject(failure);
    pending.clear();
  }
  worker.onerror = (event: ErrorEvent) =>
    fail(new Error(`the database worker stopped: ${event.message || 'no message'}`));
  void poolFree?.catch((error) => fail(error instanceof Error ? error : new Error(String(error))));

  function post<T>(op: string, args: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
    if (stopped) return Promise.reject(stopped);
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      /* In the order posted: every post waits on the same promise, and its
         callbacks run in the order they were attached. Straight through when
         no recovery or supplied module is pending. */
      /* postMessage throws when it cannot clone what it is given. The worker
         never sees that message, so the statement fails here rather than
         waiting for an answer, and a throw inside the deferred send below
         is not left as an unhandled error. */
      function send() {
        if (op === 'attach' && suppliedWasm) {
          args = { ...args, wasmBinary: suppliedWasm };
          transfer = [suppliedWasm];
          suppliedWasm = undefined;
        }
        try {
          worker.postMessage({ id, op, args }, transfer);
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      }
      if (!poolFree) send();
      else
        void poolFree.then(() => {
          if (!stopped) send();
        }, () => {});
    });
  }

  /* Closed is stopped too (ux-carpet 215). A terminated worker answers
     nothing, so a message posted after terminate() waited for the rest of
     the session - and a failed boot closes its driver twice, once in boot()
     and once in closeActiveDriver(), so the second close never came back
     and the boot sat at 'booting' with no notice. */
  function terminate() {
    worker.terminate();
    stopped ??= new Error('the database worker was closed');
    for (const waiter of pending.values()) waiter.reject(stopped);
    pending.clear();
    liveConnections.delete(connection);
  }

  const connection = { post, terminate, gone: () => stopped !== null };
  liveConnections.add(connection);
  return connection;
}

type Connection = ReturnType<typeof connectWorker>;

/* A tab that navigates away or reloads while a connection is open leaves its
   access handles for the browser to reclaim from a worker it is about to
   kill outright - which a moment later is late enough for the next boot's
   own `attach()` (ux-carpet 243): "Access Handles cannot be created if there
   is another open Access Handle", thrown while the handles this tab's own
   worker held are still being torn down. Real, not a fixture of one probe -
   `pagehide` fires for exactly this tab's own reload or navigation, on both
   the archive-restore path this was found on and any ordinary reload of an
   open Journal.

   `pauseVfs()` (mc-worker.ts's `close`) is what actually lets go of the pool,
   synchronously once the worker's message reaches it - so posting `close` to
   every live connection here, ahead of the browser's own teardown, is what
   the next `attach()` needs already done rather than raced. Fire-and-forget
   deliberately: a page hiding for good has nothing to wait for an answer
   with, and one still open in another tab (`gone()` false, not yet asked to
   close otherwise) tolerates a second `close` later - the worker's own
   handler is idempotent, `db` and `poolUtil` already null.

   Exported only for its own test: nothing above this file calls it by
   name, `window`'s own `pagehide` is what fires it, and the Node tier has
   no `window` to dispatch one on. */
export function releaseOnPageHide(): void {
  for (const connection of liveConnections) {
    if (!connection.gone()) connection.post('close').catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', releaseOnPageHide);
}

/* A worker started at boot start, before any key exists (ux-carpet ticket
   209). Worker start, the wasm compile and the pool install took 65-70ms
   and began only once the key was ready, though none of them needs it. So
   the boot starts one at once, with the survey and the key derivation, and
   the driver that opens the Journal takes it over.

   `attach` brings up the module, the pool and the encryption shim and opens
   nothing: there is no database handle in the worker until `open` arrives
   with the key (ADR-0018), and nothing here or in the worker holds a key
   before then. A failure to start is kept on the promise, and the worker's
   own `stopped` makes the `open` behind it fail with the same cause, which
   boot() reports as the journal failing to open. */
let prewarmed: { path: string; connection: Connection; attached: Promise<void> } | null = null;

export function prewarmJournalWorker(databasePath: string, wasmBinary?: Promise<ArrayBuffer>): Promise<void> {
  if (!prewarmed) {
    /* A worker that cannot even be constructed (a policy that refuses
       module workers throws on `new Worker`) must not take startBoot down
       with it: nothing is kept, and the driver made once the key exists
       constructs its own inside boot(), where that failure is a boot error. */
    let connection: Connection;
    try {
      connection = connectWorker(wasmBinary);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const attached = connection.post<void>('attach', { path: databasePath });
    attached.catch(() => {});
    prewarmed = { path: databasePath, connection, attached };
  }
  return prewarmed.attached;
}

/** Lets go of a worker started ahead of the key without it ever opening
    anything. The pool's access handles belong to one worker at a time, so
    a reset deleting the Journal's files has to have this worker gone first. */
export async function releasePrewarmedJournalWorker(): Promise<void> {
  const held = prewarmed;
  prewarmed = null;
  if (!held) return;
  await held.connection.post('close').catch(() => {});
  held.connection.terminate();
}

/* Only ever handed to its own path. A driver for another database leaves it
   where it is, for the Journal's open still to come: it holds no key, and
   its pool directory is its own path's (mc-worker.ts, poolDirectory), so it
   holds nothing another database's worker needs. */
function takePrewarmed(databasePath: string): Connection | null {
  if (!prewarmed || prewarmed.path !== databasePath) return null;
  const { connection } = prewarmed;
  prewarmed = null;
  return connection;
}

export function createEncryptedWebSqlite(databasePath: string, dataKey: Uint8Array): WebSqlite {
  const connection = takePrewarmed(databasePath) ?? connectWorker();
  const { post, terminate } = connection;

  // Fire-and-queue: every later message waits behind this in the worker's
  // chain, and its failure resurfaces on the first statement (mc-worker.ts
  // rejects every queued statement with this same error once open() has
  // failed, rather than letting one crash on a null database instead).
  post('open', { path: databasePath, hexKey: toHex(dataKey) }).catch(() => {});

  const driver: SqliteDriver = withReadSnapshots({
    async exec(statements: string) {
      await post('exec', { sql: statements });
    },

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params: unknown[] = []
    ) {
      return post<Row[]>('query', { sql: statement, params });
    },

    async run(statement: string, params: unknown[] = []) {
      return post<{ changes: number; lastInsertRowid: number }>('run', { sql: statement, params });
    },

    async getUserVersion() {
      const [row] = await post<{ user_version: number }[]>('query', { sql: 'PRAGMA user_version', params: [] });
      return row.user_version;
    },

    async setUserVersion(version: number) {
      // PRAGMA does not accept a bound parameter, and version numbers here
      // only ever come from this codebase's own migrations array.
      await post('exec', { sql: `PRAGMA user_version = ${version}` });
    },

    transaction: oneTransactionAtATime({
      begin: () => post('exec', { sql: 'BEGIN' }),
      commit: () => post('exec', { sql: 'COMMIT' }),
      rollback: () => post('exec', { sql: 'ROLLBACK' })
    }),

    async close() {
      await post('close');
      terminate();
    }
  });

  /* The copy check and the restore, which are what a failed boot does next
     (ux-carpet 219). boot() closes this driver when migrating fails, and
     closing terminates the worker, so the failure screen's question - is
     there a copy to go back to? - and the restore itself were both sent to
     a worker that was gone: the answer was always "no copy", and the safety
     net ticket 04 built never caught anything on the web. Once this
     driver's worker has gone they run on one of their own, pointed at the
     same files and key without opening the live database, and closed again
     before the answer is handed back so the next boot's worker can take
     the pool. While it is still alive - the runner asks before migrating -
     they go through it as before, since the pool is its. */
  async function recover<T>(op: string): Promise<T> {
    if (!connection.gone()) return post<T>(op);
    const own = connectWorker();
    const run = (async () => {
      try {
        await own.post('target', { path: databasePath, hexKey: toHex(dataKey) });
        return await own.post<T>(op);
      } finally {
        await own.post('close').catch(() => {});
        own.terminate();
      }
    })();
    const settled: Promise<void> = run.then(
      () => {},
      () => {}
    );
    recovering = settled;
    void settled.then(() => {
      if (recovering === settled) recovering = null;
    });
    return run;
  }

  const fileOps: MigrationFileOps = {
    async preMigrationCopyIsUsable() {
      return recover<boolean>('preMigrationCopyIsUsable');
    },
    async copyDatabaseFile() {
      await post('copyDatabaseFile');
    },
    /* Leaves this driver closed (mc-worker.ts): the file it had open has just
       been replaced, so there is nothing sensible for a later statement to
       run against. The caller reloads the page - boot.svelte.ts does - rather
       than carrying on over a connection that is gone. */
    async restorePreMigrationCopy() {
      await recover('restorePreMigrationCopy');
    },
    async cleanupPreMigrationCopy() {
      await post('cleanupPreMigrationCopy');
    }
  };

  async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  return {
    driver,
    fileOps,
    requestPersistentStorage,
    ...(typeof __DEMO__ !== 'undefined' && __DEMO__ && typeof OffscreenCanvas !== 'undefined' ? {
      prepareDemoPersona: (source: ReturnType<typeof import('../demo/persona').persona>) =>
      post<
        | boolean
        | { foundVersion: number; knownVersion: number }
        | { interruptedRestore: true }
        | { belowBaseline: number; baselineVersion: number }
      >('seedDemoPersona', { source })
        .then((result) => {
          if (typeof result === 'boolean') return result;
          if ('foundVersion' in result) throw new SchemaTooNewError(result.foundVersion, result.knownVersion);
          if ('belowBaseline' in result) throw new JournalBelowBaselineError(result.belowBaseline, result.baselineVersion);
          throw new InterruptedRestoreError();
        }) } : {})
  };
}
