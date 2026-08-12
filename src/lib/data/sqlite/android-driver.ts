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

   Calls are serialized, and the queue below is what does it. The web driver
   gets the same property free, because a worker processes messages in the
   order they were posted; Capacitor dispatches bridge calls on a thread pool
   and guarantees no order at all, so without the queue two statements issued
   back to back could reach SQLite the other way round. Post-order is what the
   migration runner's callback composition assumes, and what makes a BEGIN
   arrive before the statements written after it.

   What the queue does not do - on either platform - is isolate a
   transaction. An unrelated call made while one is open still lands between
   its BEGIN and COMMIT, because both drivers have one connection and one
   queue. Nothing today issues journal work concurrently with a transaction,
   and the web driver has the same exposure, so this is a property the two
   share rather than something Android introduces. */

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
  preMigrationCopyIsUsable(): Promise<{ usable: boolean }>;
  copyDatabaseFile(): Promise<void>;
  restorePreMigrationCopy(): Promise<void>;
  cleanupPreMigrationCopy(): Promise<void>;
  deleteDatabase(): Promise<void>;
  isPlaintextDatabase(options: { name: string }): Promise<{ plaintext: boolean }>;
  close(): Promise<void>;
}

const Sqlite = registerPlugin<SqliteBridge>('Sqlite');

/** The reset path's wipe on Android (ticket 13, ADR-0014). The journal's
    files live in app-private storage, so emptying the OPFS root - which is
    all the web's reset has to do - does not touch them.

    Outside the queue below, and safely so: the plugin holds one connection
    for the whole app, and the caller has already awaited the close that let
    go of it (data/reset.ts closes before it wipes). */
export async function deleteAndroidDatabase(): Promise<void> {
  await Sqlite.deleteDatabase();
}

/** Whether app storage holds a journal from the pre-encryption Android build
    (ticket 13). Asked before the driver opens anything: a raw-key open of a
    plaintext file fails as SQLITE_NOTADB, which is the same error a corrupt
    journal gives, and the two deserve different sentences. */
export async function androidJournalIsPlaintext(databaseName: string): Promise<boolean> {
  const { plaintext } = await Sqlite.isPlaintextDatabase({ name: databaseName });
  return plaintext;
}

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
     is exactly where boot() already catches driver failures.

     The failure is kept rather than dropped. Without this the next statement
     reports "the database is not open", which describes the symptom and
     loses the cause - and the cause is the part worth having, since
     SQLITE_NOTADB on this path is a wrong key (ADR-0020) rather than a bug. */
  let openFailure: Error | null = null;
  enqueue(() => Sqlite.open({ name: databaseName, hexKey: dataKey ? toHex(dataKey) : undefined })).catch(
    (error: Error) => {
      openFailure = error;
    }
  );

  /** Wraps a call so the open failure, if there was one, is what surfaces. */
  const afterOpen = <T>(work: () => Promise<T>): Promise<T> =>
    enqueue(() => {
      if (openFailure) return Promise.reject(openFailure);
      return work();
    });

  const driver: SqliteDriver = {
    async exec(statements: string) {
      await afterOpen(() => Sqlite.exec({ sql: statements }));
    },

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params: unknown[] = []
    ) {
      const { rows } = await afterOpen(() => Sqlite.query({ sql: statement, params }));
      return rows as Row[];
    },

    async run(statement: string, params: unknown[] = []) {
      return afterOpen(() => Sqlite.run({ sql: statement, params }));
    },

    async getUserVersion() {
      const { version } = await afterOpen(() => Sqlite.getUserVersion());
      return version;
    },

    async setUserVersion(version: number) {
      await afterOpen(() => Sqlite.setUserVersion({ version }));
    },

    /* The steps are queued individually, so a statement the callback makes
       lands between the BEGIN and the COMMIT rather than behind both. */
    async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
      await afterOpen(() => Sqlite.beginTransaction());
      try {
        const result = await fn();
        await afterOpen(() => Sqlite.commitTransaction());
        return result;
      } catch (err) {
        await afterOpen(() => Sqlite.rollbackTransaction());
        throw err;
      }
    },

    async close() {
      await afterOpen(() => Sqlite.close());
    }
  };

  const fileOps: MigrationFileOps = {
    async preMigrationCopyIsUsable() {
      const { usable } = await afterOpen(() => Sqlite.preMigrationCopyIsUsable());
      return usable;
    },
    async copyDatabaseFile() {
      await afterOpen(() => Sqlite.copyDatabaseFile());
    },
    /* Closes the connection on the way, like the web tier's does and for the
       same reason: it is holding the file being replaced. The caller reloads
       afterwards rather than carrying on over a driver whose database is
       gone (ticket 04). */
    async restorePreMigrationCopy() {
      await afterOpen(() => Sqlite.restorePreMigrationCopy());
    },
    async cleanupPreMigrationCopy() {
      await afterOpen(() => Sqlite.cleanupPreMigrationCopy());
    }
  };

  /* The web tier asks the browser not to evict OPFS. Android's app-private
     storage is not evictable - uninstalling the app is what removes it - so
     there is nothing to request and nothing to be denied. */
  const requestPersistentStorage = async () => true;

  return { driver, fileOps, requestPersistentStorage };
}
