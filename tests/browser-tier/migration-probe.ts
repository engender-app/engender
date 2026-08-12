/* Ticket 04's schema half, on the real platform: sqlite3mc over the OPFS
   SAHPool, the real migration runner, and the pre-migration copy as an
   actual file in the pool rather than a spy counting calls.

   The Node tier proves the runner's decisions against node:sqlite
   (migration-runner.test.ts). Three of this ticket's acceptance boxes are
   claims about files, and a fake file-ops object cannot be asked to keep one:

     - newer code migrates an older Journal forward and the data survives;
     - older code refuses a Journal a newer schema already touched, and leaves
       it exactly as it was;
     - a migration that fails leaves a copy that verifies, a retry does not
       spend it, and putting it back gets the previous visible Journal.

   "Newer code" and "older code" are migration arrays here rather than two
   builds: the runner takes the list it is given, so a list with one more step
   in it is precisely what a later release is, as far as a database is
   concerned. The extra steps are this probe's own - a column nothing reads,
   and one deliberately broken statement - so the real migrations stay the
   only thing that ever runs against a real Journal.

   Every driver is closed before the next opens: the pool's synchronous access
   handles belong to one worker at a time (ADR-0020). */

import { runMigrations, SchemaTooNewError } from '../../src/lib/data/sqlite/migration-runner.ts';
import { migrations, LATEST_SCHEMA_VERSION } from '../../src/lib/data/sqlite/migrations.ts';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

const DATABASE = 'gender-diary.sqlite3';

/** The release after this one, as a database sees it: everything shipped plus
    one more step. */
const NEXT_RELEASE = [
  ...migrations,
  { version: LATEST_SCHEMA_VERSION + 1, sql: 'ALTER TABLE entry ADD COLUMN probe_forward TEXT;' }
];

/** And a release whose last step cannot run - the failure ADR-0006's copy
    exists for. It adds the column the step before it already added, which is
    a real shape of the bug: a migration written against a schema its author
    thought was the one on the device.

    Not a syntax error, which was the first attempt and a trap: SQLite takes
    almost any word as a type name, so `ADD COLUMN wait DOUBLE PRECISION
    UNSIGNED` runs happily, the "failure" succeeded, and the next boot came up
    clean and retired the copy the rest of this probe was about to look for. */
const BROKEN_RELEASE = [
  ...NEXT_RELEASE,
  { version: LATEST_SCHEMA_VERSION + 2, sql: 'ALTER TABLE entry ADD COLUMN probe_forward TEXT;' }
];

/** One driver, one job, closed afterwards. Everything below opens the Journal
    through the same handle the app does (ADR-0017), so what it reads back is
    what a person would see on screen. */
async function withJournal<T>(
  use: (world: {
    driver: ReturnType<typeof createEncryptedWebSqlite>['driver'];
    fileOps: ReturnType<typeof createEncryptedWebSqlite>['fileOps'];
    journal: ReturnType<typeof openJournal>;
  }) => Promise<T>
): Promise<T> {
  const { driver, fileOps } = createEncryptedWebSqlite(DATABASE, PROBE_DATA_KEY);
  const files = encryptedFileStore(opfsPhotoFiles(), PROBE_DATA_KEY);
  try {
    return await use({ driver, fileOps, journal: openJournal(driver, files) });
  } finally {
    await driver.close().catch(() => {});
  }
}

/** The notes of every entry in the Journal, which is what "the previous
    visible Journal" comes down to for this probe. */
async function notes(journal: ReturnType<typeof openJournal>): Promise<string[]> {
  const entries = await journal.entries.recentDays(30);
  return entries
    .map((entry) => entry.note ?? '')
    .filter((note) => note.length > 0)
    .sort();
}

const FIRST = 'sentinel-migration-note-before-the-update-5514';
const AFTER_COPY = 'sentinel-migration-note-written-after-the-copy-8820';

async function run() {
  await freshOrigin();
  const result: Record<string, unknown> = {};

  // A Journal on the schema this build ships, with something in it.
  await withJournal(async ({ driver, fileOps, journal }) => {
    await runMigrations(driver, fileOps, migrations);
    await journal.reconcileBuiltIns();
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: FIRST });
    result.startingVersion = await driver.getUserVersion();
    result.startingNotes = await notes(journal);
  });

  /* --- Newer code migrates it forward ---------------------------------- */
  await withJournal(async ({ driver, fileOps, journal }) => {
    await runMigrations(driver, fileOps, NEXT_RELEASE);
    result.forwardVersion = await driver.getUserVersion();
    result.notesAfterForward = await notes(journal);
    // ADR-0006: the copy stays through the boot that migrated, and goes on
    // the next boot that comes up clean.
    result.copyAfterForward = await fileOps.preMigrationCopyExists();
  });

  await withJournal(async ({ driver, fileOps }) => {
    await runMigrations(driver, fileOps, NEXT_RELEASE);
    result.copyAfterCleanBoot = await fileOps.preMigrationCopyExists();
  });

  /* --- Older code refuses it ------------------------------------------- */
  await withJournal(async ({ driver, fileOps, journal }) => {
    try {
      await runMigrations(driver, fileOps, migrations);
      result.refusal = 'nothing was thrown';
    } catch (error) {
      result.refusal =
        error instanceof SchemaTooNewError
          ? { found: error.foundVersion, known: error.knownVersion }
          : `a ${(error as Error)?.name} instead: ${(error as Error)?.message}`;
    }
    // Refused, not damaged: the Journal is still there and still readable by
    // the code that understands it.
    result.copyAfterRefusal = await fileOps.preMigrationCopyExists();
    result.notesAfterRefusal = await notes(journal);
  });

  /* --- A migration that fails, and the way back ------------------------ */
  await withJournal(async ({ driver, fileOps, journal }) => {
    try {
      await runMigrations(driver, fileOps, BROKEN_RELEASE);
      result.brokenMigration = 'nothing was thrown';
    } catch (error) {
      result.brokenMigration = String((error as Error)?.message ?? error);
    }
    result.versionAfterFailure = await driver.getUserVersion();
    result.copyAfterFailure = await fileOps.preMigrationCopyExists();

    /* Written after the copy was taken, so it is in the live Journal and not
       in the copy. Its absence afterwards is what tells a restore that moved
       bytes from one that quietly did nothing. */
    await journal.entries.upsertEntry({ epochDay: 20001, mood: 3, note: AFTER_COPY });
    result.notesBeforeRestore = await notes(journal);
  });

  // The retry, which must not spend the copy it did not make.
  await withJournal(async ({ driver, fileOps }) => {
    await runMigrations(driver, fileOps, BROKEN_RELEASE).catch(() => {});
    result.copyAfterRetry = await fileOps.preMigrationCopyExists();
  });

  await withJournal(async ({ fileOps }) => {
    await fileOps.restorePreMigrationCopy();
  });

  /* The release the copy came from, opening what was put back. Nothing is
     pending for it, so this is also the clean boot that retires the copy. */
  await withJournal(async ({ driver, fileOps, journal }) => {
    await runMigrations(driver, fileOps, NEXT_RELEASE);
    result.versionAfterRestore = await driver.getUserVersion();
    result.notesAfterRestore = await notes(journal);
    result.copyAfterRestoredBoot = await fileOps.preMigrationCopyExists();
  });

  return result;
}

run()
  .then((result) => {
    (window as unknown as Record<string, unknown>).__migrationProbeResult = result;
  })
  .catch((error) => {
    (window as unknown as Record<string, unknown>).__migrationProbeResult = {
      error: String((error as Error)?.message ?? error)
    };
  })
  .finally(() => {
    document.body.setAttribute('data-migration-probe-ready', '');
  });
