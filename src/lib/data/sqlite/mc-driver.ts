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

export function createEncryptedWebSqlite(databasePath: string, dataKey: Uint8Array): WebSqlite {
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

  function post<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, args });
    });
  }

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
      worker.terminate();
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
