/* The encrypted web driver (ticket 09): the same WebSqlite bundle
   sqlocal-driver.ts builds, implemented over sqlite3mc in mc-worker.ts
   instead of SQLocal - ADR-0020 replaces the web driver rather than
   reconfiguring it, because SQLocal hard-codes the async OPFS VFS that
   sqlite3mc cannot encrypt on. SQLocal itself stays in the tree for
   ticket 10, which needs to read a plaintext journal during conversion.

   The data key arrives as bytes and leaves this file only as the hex the
   worker feeds to PRAGMA hexkey. Nothing here persists it - that is the
   keystore's job (crypto/keystore.ts), and the whole point of ADR-0018 is
   that no usable key sits beside the ciphertext.

   Construction is synchronous like createWebSqlite's: the worker queues
   the open behind its own message chain, so a failure to initialize or a
   wrong key surfaces on the first statement - which is inside
   runMigrations, exactly where boot() already catches driver failures.

   Transactions are manual BEGIN/COMMIT/ROLLBACK for the same reason as in
   sqlocal-driver.ts: the migration runner's callback calls back into the
   driver's own exec, and the worker serializes every statement, so the
   composition holds. */

import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import type { WebSqlite } from './sqlocal-driver.ts';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** One worker and the message plumbing over it. Two things are built on
    this: the driver below, and ticket 10's conversion, which needs the same
    pool and the same encryption shim but no open database. */
function connectWorker() {
  const worker = new Worker(new URL('./mc-worker.ts', import.meta.url), { type: 'module' });

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
  worker.onerror = (event: ErrorEvent) => {
    const failure = new Error(`the database worker stopped: ${event.message || 'no message'}`);
    for (const waiter of pending.values()) waiter.reject(failure);
    pending.clear();
  };

  function post<T>(op: string, args: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, args }, transfer);
    });
  }

  return { post, terminate: () => worker.terminate() };
}

/** Writes an encrypted copy of a plaintext-era database as the live
    Journal (ticket 10). Its own worker, because the pool's sync access
    handles belong to one at a time and the app's driver must not be
    holding the file this is about to replace - so a conversion runs, closes
    and only then lets boot open what it wrote. */
export interface ConversionTarget {
  writeFrom(plaintext: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export function createConversionTarget(databasePath: string, dataKey: Uint8Array): ConversionTarget {
  const { post, terminate } = connectWorker();

  return {
    async writeFrom(plaintext: Uint8Array) {
      /* Transferred rather than cloned: this is the whole Journal, and a
         structured clone would hold two copies of it in memory at once on
         a phone. The caller's view is detached afterwards, which is what
         the port's contract already says - it hands the bytes over. */
      await post('convert', { path: databasePath, hexKey: toHex(dataKey), bytes: plaintext }, [plaintext.buffer]);
    },
    async close() {
      await post('close');
      terminate();
    }
  };
}

export function createEncryptedWebSqlite(databasePath: string, dataKey: Uint8Array): WebSqlite {
  const { post, terminate } = connectWorker();

  // Fire-and-queue: every later message waits behind this in the worker's
  // chain, and its failure resurfaces on the first statement (see above).
  post('open', { path: databasePath, hexKey: toHex(dataKey) }).catch(() => {});

  const driver: SqliteDriver = {
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

    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      await post('exec', { sql: 'BEGIN' });
      try {
        const result = await fn();
        await post('exec', { sql: 'COMMIT' });
        return result;
      } catch (err) {
        await post('exec', { sql: 'ROLLBACK' });
        throw err;
      }
    },

    async close() {
      await post('close');
      terminate();
    }
  };

  const fileOps: MigrationFileOps = {
    async copyDatabaseFile() {
      await post('copyDatabaseFile');
    },
    async cleanupPreMigrationCopy() {
      await post('cleanupPreMigrationCopy');
    }
  };

  async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  return { driver, fileOps, requestPersistentStorage };
}
