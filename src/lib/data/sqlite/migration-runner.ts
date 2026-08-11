/* Forward-only migration runner (ADR-0006). Driver-agnostic: ticket 04 wires
   SQLocal (web/OPFS) and @capacitor-community/sqlite (Android) behind
   MigrationDb, and the pre-migration file copy behind MigrationFileOps. */

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
  copyDatabaseFile(): void | Promise<void>;
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

  await fileOps.copyDatabaseFile();

  for (const migration of pending) {
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.setUserVersion(migration.version);
    });
  }
  // The copy stays on disk through this boot even though migration
  // succeeded; ADR-0006 only retires it once a later boot comes up clean.
}
