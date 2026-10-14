/* A Node stand-in for the Android Sqlite plugin (SqlitePlugin.java), for
   tests that drive createAndroidSqlite() through a real failure rather than
   a scripted one (last-audit ui 33).

   What it keeps from the plugin is the part a scripted bridge cannot fake:
   CallSequencer's rules (one ordered stream per session, early calls held,
   a closed session refusing everything after its close) and
   SqliteConnection's files - the journal, its pre-migration copy beside it,
   and a connection object that outlives any one session, the way the
   plugin's single connection does. SQL runs on node:sqlite over real files
   in `dir`, so a copy, a restore and a reopen are file operations here too.

   Use it behind a mocked registerPlugin. android-driver.ts registers its
   plugin once, when it loads, so the mock returns a forwarder to whichever
   fake the test made last - android-failed-migration.test.ts shows the
   shape.

   The hex key is accepted and ignored: node:sqlite has no SQLCipher. */

import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type Stamp = { session?: string; seq?: number };
type Options = Stamp & Record<string, unknown>;

const PRE_MIGRATION_SUFFIX = '.pre-migration-backup';

export interface FakeSqlitePlugin {
  open(options: Options): Promise<void>;
  exec(options: Options): Promise<void>;
  query(options: Options): Promise<{ rows: Record<string, unknown>[] }>;
  run(options: Options): Promise<{ changes: number; lastInsertRowid: number }>;
  getUserVersion(options: Options): Promise<{ version: number }>;
  setUserVersion(options: Options): Promise<void>;
  beginTransaction(options: Options): Promise<void>;
  commitTransaction(options: Options): Promise<void>;
  rollbackTransaction(options: Options): Promise<void>;
  preMigrationCopyIsUsable(options: Options): Promise<{ usable: boolean }>;
  copyDatabaseFile(options: Options): Promise<void>;
  restorePreMigrationCopy(options: Options): Promise<void>;
  cleanupPreMigrationCopy(options: Options): Promise<void>;
  deleteDatabase(options: { name: string }): Promise<void>;
  isPlaintextDatabase(options: { name: string }): Promise<{ plaintext: boolean }>;
  close(options: Options): Promise<void>;
  /** Every call that reached the plugin, with how it ended, for assertions. */
  readonly calls: { method: string; session?: string; seq?: number; refused?: string }[];
  /** Where the journal of that name lives, for seeding and inspecting it. */
  pathOf(name: string): string;
}

export function createFakeSqlitePlugin(dir: string): FakeSqlitePlugin {
  /* SqliteConnection: one for the whole plugin, and its file outlives a close. */
  let database: DatabaseSync | null = null;
  let databaseFile: string | null = null;

  const requireOpen = () => {
    if (!database) throw new Error('the database is not open');
    return database;
  };
  const requireFile = () => {
    if (!databaseFile) throw new Error('the database is not open');
    return databaseFile;
  };
  const copyPath = () => requireFile() + PRE_MIGRATION_SUFFIX;

  const closeConnection = () => {
    if (!database) return;
    try {
      database.exec('ROLLBACK');
    } catch {
      /* nothing was open */
    }
    database.close();
    database = null;
  };

  const copyIsUsable = (): boolean => {
    if (!databaseFile) return false;
    const copy = copyPath();
    if (!existsSync(copy) || statSync(copy).size === 0) return false;
    try {
      const check = new DatabaseSync(copy, { readOnly: true });
      try {
        const row = check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
        return row.n > 0;
      } finally {
        check.close();
      }
    } catch {
      return false;
    }
  };

  /* CallSequencer: the same rules, on a promise chain standing in for the
     plugin's one worker thread. */
  type Held = { run: () => void; refuse: (message: string) => void };
  const sessions = new Map<string, { next: number; held: Map<number, Held> }>();
  const closedSessions = new Set<string>();
  let worker: Promise<void> = Promise.resolve();
  const calls: FakeSqlitePlugin['calls'] = [];

  const onWorker = (work: () => void) => {
    worker = worker.then(work);
  };

  function sequenced<T>(method: string, options: Options, work: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const record: FakeSqlitePlugin['calls'][number] = { method, session: options.session, seq: options.seq };
      calls.push(record);
      const refuse = (message: string) => {
        record.refused = message;
        reject(new Error(message));
      };
      const { session, seq } = options;
      if (!session || typeof seq !== 'number') {
        refuse(`${method} requires a session and a sequence number`);
        return;
      }
      const run = () => {
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      };
      onWorker(() => {
        if (closedSessions.has(session)) {
          refuse('sqlite session is closed');
          return;
        }
        let state = sessions.get(session);
        if (!state) sessions.set(session, (state = { next: 0, held: new Map() }));
        if (seq < state.next || state.held.has(seq)) {
          refuse(`sqlite call ${seq} of session ${session} arrived twice`);
          return;
        }
        if (seq !== state.next) {
          state.held.set(seq, { run, refuse });
          return;
        }
        run();
        state.next++;
        let following: Held | undefined;
        while ((following = state.held.get(state.next))) {
          state.held.delete(state.next);
          following.run();
          state.next++;
        }
      });
    });
  }

  function unsequenced<T>(method: string, work: () => T): Promise<T> {
    calls.push({ method });
    return new Promise<T>((resolve, reject) => {
      onWorker(() => {
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /** CallSequencer.finish: drops the session and refuses its held calls. */
  const finish = (session: string) => {
    for (const pending of sessions.get(session)?.held.values() ?? []) pending.refuse('sqlite session is closed');
    sessions.delete(session);
    closedSessions.add(session);
  };

  const pathOf = (name: string) => join(dir, name);

  return {
    calls,
    pathOf,

    open: (o) =>
      sequenced('open', o, () => {
        const name = o.name as string | undefined;
        if (!name) throw new Error('open requires a database name');
        closeConnection();
        databaseFile = pathOf(name);
        database = new DatabaseSync(databaseFile);
        database.exec('PRAGMA foreign_keys = ON');
      }),
    exec: (o) =>
      sequenced('exec', o, () => {
        requireOpen().exec(o.sql as string);
      }),
    query: (o) =>
      sequenced('query', o, () => ({
        rows: requireOpen()
          .prepare(o.sql as string)
          .all(...((o.params as never[]) ?? [])) as Record<string, unknown>[]
      })),
    run: (o) =>
      sequenced('run', o, () => {
        const result = requireOpen()
          .prepare(o.sql as string)
          .run(...((o.params as never[]) ?? []));
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
      }),
    getUserVersion: (o) =>
      sequenced('getUserVersion', o, () => ({
        version: (requireOpen().prepare('PRAGMA user_version').get() as { user_version: number }).user_version
      })),
    setUserVersion: (o) =>
      sequenced('setUserVersion', o, () => {
        requireOpen().exec(`PRAGMA user_version = ${Number(o.version)}`);
      }),
    beginTransaction: (o) => sequenced('beginTransaction', o, () => void requireOpen().exec('BEGIN')),
    commitTransaction: (o) => sequenced('commitTransaction', o, () => void requireOpen().exec('COMMIT')),
    rollbackTransaction: (o) => sequenced('rollbackTransaction', o, () => void requireOpen().exec('ROLLBACK')),

    copyDatabaseFile: (o) =>
      sequenced('copyDatabaseFile', o, () => {
        const source = requireFile();
        if (existsSync(source)) copyFileSync(source, copyPath());
      }),
    preMigrationCopyIsUsable: (o) => sequenced('preMigrationCopyIsUsable', o, () => ({ usable: copyIsUsable() })),
    restorePreMigrationCopy: (o) =>
      sequenced('restorePreMigrationCopy', o, () => {
        if (!existsSync(copyPath())) throw new Error('there is no pre-migration copy to restore');
        if (!copyIsUsable()) throw new Error('the pre-migration copy cannot be opened; it is not a recovery point');
        closeConnection();
        const live = requireFile();
        for (const suffix of ['-wal', '-shm', '-journal']) rmSync(live + suffix, { force: true });
        copyFileSync(copyPath(), live);
      }),
    cleanupPreMigrationCopy: (o) =>
      sequenced('cleanupPreMigrationCopy', o, () => {
        if (databaseFile) rmSync(copyPath(), { force: true });
      }),

    deleteDatabase: ({ name }) =>
      unsequenced('deleteDatabase', () => {
        closeConnection();
        for (const suffix of ['', '-wal', '-shm', '-journal', PRE_MIGRATION_SUFFIX]) {
          rmSync(pathOf(name) + suffix, { force: true });
        }
      }),
    isPlaintextDatabase: () => unsequenced('isPlaintextDatabase', () => ({ plaintext: false })),

    close: (o) =>
      sequenced('close', o, () => {
        closeConnection();
        finish(o.session as string);
      })
  };
}
