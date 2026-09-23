/* The Android driver (ticket 11): the same SqliteDriver the web tier
   satisfies, over the local Capacitor plugin in
   android/app/src/main/java/dev/engender/app/sqlite/.

   Why a local plugin rather than @capacitor-community/sqlite is ADR-0020's
   ticket 11 amendment, and it comes down to the key: that plugin takes a
   passphrase and derives the database key itself, where ADR-0018 wants a
   random data key held by the Keystore and handed to SQLCipher raw. So
   `dataKey` here leaves as hex and nothing on either side of the bridge
   stretches it.

   The key is optional and unset for now. Ticket 11 lands the shell, the
   bridge and the driver; ticket 13 lands the Android Keystore that produces
   the key, and the only change it needs here is a caller that passes one.

   Calls are pipelined: each one crosses the bridge the moment it is made,
   without waiting for the one before it to come back (ux-carpet 200,
   ADR-0089). Waiting was a full round trip per statement, 9-11 ms on the
   Pixel against about 1 ms sent together, and a warm screen makes 85-130 of
   them. Order still matters as much as it did - post-order is what the
   migration runner's callback composition assumes, and what makes a BEGIN
   arrive before the statements written after it - so every call carries
   this driver's session and a sequence number counted from the open, and
   the plugin runs them strictly in that order on its own single thread,
   holding back any that arrive early (CallSequencer.java). Capacitor 8.5
   happens to deliver plugin calls in order, but that is a framework
   internal, and the order here is ours to own.

   What the ordering does not do - on either platform - is isolate a
   transaction. An unrelated call made while one is open still lands between
   its BEGIN and COMMIT, because both drivers have one connection and one
   order. That much is a property the two share rather than something
   Android introduces, and it is what lets a transaction's own callback
   reach the connection at all. What it cost until ticket 134 was a second
   *transaction* being able to start inside the first one's window;
   oneTransactionAtATime() below is where that no longer happens. */

import { registerPlugin } from '@capacitor/core';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import type { WebSqlite } from './sqlocal-driver.ts';
import { oneTransactionAtATime } from './transactor.ts';

/** What every sequenced call carries (ADR-0089). */
type Stamp = { session: string; seq: number };

/* Every method but the two that run with no driver open takes the stamp
   (ADR-0089); the plugin refuses a connection call without one. */
interface SqliteBridge {
  open(options: { name: string; hexKey?: string } & Stamp): Promise<void>;
  exec(options: { sql: string } & Stamp): Promise<void>;
  query(options: { sql: string; params: unknown[] } & Stamp): Promise<{ rows: Record<string, unknown>[] }>;
  run(options: { sql: string; params: unknown[] } & Stamp): Promise<{ changes: number; lastInsertRowid: number }>;
  getUserVersion(options: Stamp): Promise<{ version: number }>;
  setUserVersion(options: { version: number } & Stamp): Promise<void>;
  beginTransaction(options: Stamp): Promise<void>;
  commitTransaction(options: Stamp): Promise<void>;
  rollbackTransaction(options: Stamp): Promise<void>;
  preMigrationCopyIsUsable(options: Stamp): Promise<{ usable: boolean }>;
  copyDatabaseFile(options: Stamp): Promise<void>;
  restorePreMigrationCopy(options: Stamp): Promise<void>;
  cleanupPreMigrationCopy(options: Stamp): Promise<void>;
  deleteDatabase(): Promise<void>;
  isPlaintextDatabase(options: { name: string }): Promise<{ plaintext: boolean }>;
  close(options: Stamp): Promise<void>;
}

const Sqlite = registerPlugin<SqliteBridge>('Sqlite');

/** The reset path's wipe on Android (ticket 13, ADR-0014). The journal's
    files live in app-private storage, so emptying the OPFS root - which is
    all the web's reset has to do - does not touch them.

    Unnumbered, and safely so: the plugin holds one connection for the
    whole app, and the caller has already awaited the close that let go of
    it (data/reset.ts closes before it wipes). It still runs on the
    plugin's one worker thread, behind anything already there. */
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

let driversMade = 0;

/** Numbers this driver's calls in the order they are made. A session per
    driver, because a lock closes one and the unlock opens another, and the
    new one counts from 0 again. The number is taken at the moment a call is
    sent and never for a call that is not, or the plugin would hold every
    later one for a number that never comes. */
function sequencer(): () => Stamp {
  const session = `${Date.now().toString(36)}-${++driversMade}-${Math.random().toString(36).slice(2, 10)}`;
  let next = 0;
  return () => ({ session, seq: next++ });
}

export function createAndroidSqlite(databaseName: string, dataKey?: Uint8Array): WebSqlite {
  const stamp = sequencer();

  /* Sent here rather than awaited, so construction stays synchronous the
     way the web driver's is: a failure to open surfaces on the first
     statement, which is inside runMigrations, which is exactly where boot()
     already catches driver failures.

     The failure is kept rather than dropped. The statements sent behind the
     open reach the plugin anyway and fail there as "the database is not
     open", which describes the symptom and loses the cause - and the cause
     is the part worth having, since SQLITE_NOTADB on this path is a wrong
     key (ADR-0020) rather than a bug. So a call that fails reports the
     open's failure instead, if there was one. */
  const opened: Promise<Error | null> = Sqlite.open({
    name: databaseName,
    hexKey: dataKey ? toHex(dataKey) : undefined,
    ...stamp()
  }).then(
    () => null,
    (error: Error) => error
  );

  /** Sends a call now, numbered, and reports the open's failure over its own. */
  const afterOpen = <T>(send: (stamp: Stamp) => Promise<T>): Promise<T> =>
    send(stamp()).catch(async (error) => {
      throw (await opened) ?? error;
    });

  const driver: SqliteDriver = {
    async exec(statements: string) {
      await afterOpen((s) => Sqlite.exec({ sql: statements, ...s }));
    },

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      params: unknown[] = []
    ) {
      const { rows } = await afterOpen((s) => Sqlite.query({ sql: statement, params, ...s }));
      return rows as Row[];
    },

    async run(statement: string, params: unknown[] = []) {
      return afterOpen((s) => Sqlite.run({ sql: statement, params, ...s }));
    },

    async getUserVersion() {
      const { version } = await afterOpen((s) => Sqlite.getUserVersion(s));
      return version;
    },

    async setUserVersion(version: number) {
      await afterOpen((s) => Sqlite.setUserVersion({ version, ...s }));
    },

    /* The steps are numbered individually, so a statement the callback
       makes lands between the BEGIN and the COMMIT rather than behind both. */
    transaction: oneTransactionAtATime({
      begin: () => afterOpen((s) => Sqlite.beginTransaction(s)),
      commit: () => afterOpen((s) => Sqlite.commitTransaction(s)),
      rollback: () => afterOpen((s) => Sqlite.rollbackTransaction(s))
    }),

    async close() {
      await afterOpen((s) => Sqlite.close(s));
    }
  };

  const fileOps: MigrationFileOps = {
    async preMigrationCopyIsUsable() {
      const { usable } = await afterOpen((s) => Sqlite.preMigrationCopyIsUsable(s));
      return usable;
    },
    async copyDatabaseFile() {
      await afterOpen((s) => Sqlite.copyDatabaseFile(s));
    },
    /* Closes the connection on the way, like the web tier's does and for the
       same reason: it is holding the file being replaced. The caller reloads
       afterwards rather than carrying on over a driver whose database is
       gone (ticket 04). */
    async restorePreMigrationCopy() {
      await afterOpen((s) => Sqlite.restorePreMigrationCopy(s));
    },
    async cleanupPreMigrationCopy() {
      await afterOpen((s) => Sqlite.cleanupPreMigrationCopy(s));
    }
  };

  /* The web tier asks the browser not to evict OPFS. Android's app-private
     storage is not evictable - uninstalling the app is what removes it - so
     there is nothing to request and nothing to be denied. */
  const requestPersistentStorage = async () => true;

  return { driver, fileOps, requestPersistentStorage };
}
