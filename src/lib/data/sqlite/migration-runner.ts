/* Forward-only migration runner (ADR-0006). Driver-agnostic: both the web
   driver (sqlite3mc over an OPFS SAHPool) and the Android one (SQLCipher
   behind a local Capacitor plugin) sit behind MigrationDb, and the
   pre-migration file copy behind MigrationFileOps. */

export interface Migration {
  version: number;
  sql: string;
}

export interface MigrationDb {
  exec(sql: string): void | Promise<void>;
  getUserVersion(): number | Promise<number>;
  setUserVersion(version: number): void | Promise<void>;
  transaction<T>(fn: () => T | Promise<T>): T | Promise<T>;
}

export interface MigrationFileOps {
  /** Whether a copy from an earlier boot is on disk *and* holds a journal.
      Both halves matter: a boot that finds one is a boot whose predecessor did
      not come up clean, and a copy that cannot be read back is not a recovery
      point however much of it is there. */
  preMigrationCopyIsUsable(): boolean | Promise<boolean>;
  copyDatabaseFile(): void | Promise<void>;
  /** Puts the copy back as the live database, discarding whatever the failed
      migration left (ticket 04). Never called from here - the caller does it,
      because on the web it closes the connection this runner is holding. */
  restorePreMigrationCopy(): void | Promise<void>;
  cleanupPreMigrationCopy(): void | Promise<void>;
}

/** Thrown when the database's user_version is newer than any migration the
    running code knows about - a stale service worker or a lagging Android
    build opening a database a newer version of the app already migrated. */
export class SchemaTooNewError extends Error {
  foundVersion: number;
  knownVersion: number;

  constructor(foundVersion: number, knownVersion: number) {
    super(
      `Database schema version ${foundVersion} is newer than this build knows (${knownVersion}). Refusing to open it.`
    );
    this.name = 'SchemaTooNewError';
    this.foundVersion = foundVersion;
    this.knownVersion = knownVersion;
  }
}

/** Thrown when the live database has no schema at all while a readable copy is
    sitting beside it (ticket 04) - the window inside restorePreMigrationCopy,
    where the database has been unlinked and the copy is being written over it.

    Refusing matters because the alternative is silent: every migration applies
    cleanly to an empty file, the app reaches its journal screen holding
    nothing, and the boot after that comes up clean and retires the copy. That
    is the whole journal gone, of exactly the kind ADR-0006's copy insures.

    The caller finishes the restore and starts again, so this is a state that
    heals rather than one to be shown to anybody. A first-ever migration that
    failed leaves an empty database beside an empty copy, which is why the
    question asked is whether the copy holds a journal and not whether it is
    there: that case is a real first run and must not be caught here. */
export class InterruptedRestoreError extends Error {
  constructor() {
    super('The journal is empty and a readable pre-migration copy is beside it: a restore was interrupted.');
    this.name = 'InterruptedRestoreError';
  }
}

/** Thrown when the running SQLite build lacks FTS5. The schema depends on it
    (`entry_fts`); there is no degraded search mode to fall back to. */
export class Fts5UnavailableError extends Error {
  constructor(cause: unknown) {
    super('FTS5 is not available in this SQLite build. The schema requires it.');
    this.name = 'Fts5UnavailableError';
    this.cause = cause;
  }
}

/** Proves FTS5 is compiled in before anything else touches the database, so
    a missing module fails as one clear error rather than as a cryptic
    "no such module" thrown from deep inside a migration step. */
export async function assertFts5Available(db: MigrationDb): Promise<void> {
  try {
    await db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS __fts5_probe USING fts5(x)");
    await db.exec('DROP TABLE IF EXISTS __fts5_probe');
  } catch (err) {
    throw new Fts5UnavailableError(err);
  }
}

export async function runMigrations(
  db: MigrationDb,
  fileOps: MigrationFileOps,
  migrations: Migration[]
): Promise<void> {
  await assertFts5Available(db);

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const latestKnown = sorted.length > 0 ? sorted[sorted.length - 1].version : 0;
  const current = await db.getUserVersion();

  /* Whether this file is the journal at all, asked before what schema it is
     on. An unmigrated database with a readable copy beside it is a restore
     that was interrupted, not a first run (see InterruptedRestoreError). */
  if (current === 0 && (await fileOps.preMigrationCopyIsUsable())) {
    throw new InterruptedRestoreError();
  }

  if (current > latestKnown) {
    throw new SchemaTooNewError(current, latestKnown);
  }

  const pending = sorted.filter((m) => m.version > current);

  if (pending.length === 0) {
    // A clean boot: nothing to migrate, so any copy left over from a past
    // migration has been proven safe and can go.
    await fileOps.cleanupPreMigrationCopy();
    return;
  }

  /* Unless one is already there (ticket 04). A copy on disk at this point was
     left by a boot that tried these same steps and did not finish them, and it
     is the better of the two: taken before the attempt that failed, from a
     file nothing had been at. Copying again would spend it - and if the
     failure damaged the database, the copy could not be written at all, so the
     retry would destroy the only way back and put nothing in its place. */
  if (!(await fileOps.preMigrationCopyIsUsable())) {
    await fileOps.copyDatabaseFile();
  }

  for (const migration of pending) {
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.setUserVersion(migration.version);
    });
  }
  // The copy stays on disk through this boot even though migration
  // succeeded; ADR-0006 only retires it once a later boot comes up clean.
}
