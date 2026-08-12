/* The Android driver (ticket 11): the same SqliteDriver the web tier
   satisfies, over the local Capacitor plugin in
   android/app/src/main/java/dev/barankiewicz/genderdiary/sqlite/.

   Why a local plugin rather than @capacitor-community/sqlite is ADR-0020's
   ticket 11 amendment, and it comes down to the key: that plugin takes a
   passphrase and derives the database key itself, where ADR-0018 wants a
   random data key held by the Keystore and handed to SQLCipher raw. So
   `dataKey` here leaves as hex and nothing on either side of the bridge
   stretches it.

   The key is optional and unset for now. Ticket 11 lands the shell, the
   bridge and the driver; ticket 13 lands the Android Keystore that produces
   the key, and the only change it needs here is a caller that passes one.

   Calls are serialized. The web driver gets that free - a worker processes
   messages in the order they were posted - but Capacitor dispatches bridge
   calls on a thread pool, so two overlapping journal operations could
   otherwise have their statements interleave, and a BEGIN could commit work
   it never meant to wrap. The queue below restores post-order, which is the
   property the migration runner's callback composition and every
   journal transaction already assume. */

import { registerPlugin } from '@capacitor/core';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import type { WebSqlite } from './sqlocal-driver.ts';

interface SqliteBridge {
  open(options: { name: string; hexKey?: string }): Promise<void>;
  exec(options: { sql: string }): Promise<void>;
  query(options: { sql: string; params: unknown[] }): Promise<{ rows: Record<string, unknown>[] }>;
  run(options: { sql: string; params: unknown[] }): Promise<{ changes: number; lastInsertRowid: number }>;
  getUserVersion(): Promise<{ version: number }>;
  setUserVersion(options: { version: number }): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  copyDatabaseFile(): Promise<void>;
  cleanupPreMigrationCopy(): Promise<void>;
  close(): Promise<void>;
}

const Sqlite = registerPlugin<SqliteBridge>('Sqlite');

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** One call at a time, in the order they were made. */
function serializer() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    // The chain must not carry a rejection forward, or every later call
    // inherits this one's failure. The caller still sees its own.
    tail = result.catch(() => {});
    return result;
  };
}

export function createAndroidSqlite(databaseName: string, dataKey?: Uint8Array): WebSqlite {
  const enqueue = serializer();

  /* Queued like everything else rather than awaited here, so construction
     stays synchronous the way the web driver's is: a failure to open
     surfaces on the first statement, which is inside runMigrations, which
     is exactly where boot() already catches driver failures. */
  enqueue(() => Sqlite.open({ name: databaseName, hexKey: dataKey ? toHex(dataKey) : undefined })).catch(
    () => {}
  );

  const driver: SqliteDriver = {
    async exec(statements: string) {
      await enqueue(() => Sqlite.exec({ sql: statements }));
    },

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params: unknown[] = []
    ) {
      const { rows } = await enqueue(() => Sqlite.query({ sql: statement, params }));
      return rows as Row[];
    },

    async run(statement: string, params: unknown[] = []) {
      return enqueue(() => Sqlite.run({ sql: statement, params }));
    },

    async getUserVersion() {
      const { version } = await enqueue(() => Sqlite.getUserVersion());
      return version;
    },

    async setUserVersion(version: number) {
      await enqueue(() => Sqlite.setUserVersion({ version }));
    },

    /* The steps are queued individually, so a statement the callback makes
       lands between the BEGIN and the COMMIT rather than behind both. */
    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      await enqueue(() => Sqlite.beginTransaction());
      try {
        const result = await fn();
        await enqueue(() => Sqlite.commitTransaction());
        return result;
      } catch (err) {
        await enqueue(() => Sqlite.rollbackTransaction());
        throw err;
      }
    },

    async close() {
      await enqueue(() => Sqlite.close());
    }
  };

  const fileOps: MigrationFileOps = {
    async copyDatabaseFile() {
      await enqueue(() => Sqlite.copyDatabaseFile());
    },
    async cleanupPreMigrationCopy() {
      await enqueue(() => Sqlite.cleanupPreMigrationCopy());
    }
  };

  /* The web tier asks the browser not to evict OPFS. Android's app-private
     storage is not evictable - uninstalling the app is what removes it - so
     there is nothing to request and nothing to be denied. */
  const requestPersistentStorage = async () => true;

  return { driver, fileOps, requestPersistentStorage };
}
