/* Boot in this order:

   1. Read localStorage boot preferences before first paint or unlock.
   2. Open and migrate the database.
   3. Load mirrored reference data into reactive state.
   4. After reporting ready, purge trash older than 30 days, sweep
      orphaned photos and auto-log outstanding doses.

   Inject the steps and driver so Node tests can verify ordering and
   errors. The app supplies the encrypted web driver. */

import { markJournalBusy, waitForJournalIdle } from '../journal-busy.ts';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import { runMigrations } from './migration-runner.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';

interface BootDeps {
  createDriver: () => SqliteDriver;
  /** Demo web boot can prepare the same database in its owning worker. */
  prepareDatabase?: (driver: SqliteDriver, fileOps: MigrationFileOps) => Promise<void>;
  fileOps: MigrationFileOps;
  applyBootPreferences?: () => void;
  requestPersistentStorage?: () => Promise<boolean>;
  loadReferenceData?: (driver: SqliteDriver) => Promise<void>;
  purgeExpiredTrash?: (driver: SqliteDriver) => Promise<void>;
  sweepOrphanPhotos?: (driver: SqliteDriver) => Promise<void>;
  shouldSweepOrphans?: () => boolean;
  /** The auto-log pass (ADR-0086): each schedule the
      person switched on gets a `taken` dose per slot it still owes, up to
      yesterday. Last of the three, and here rather than on a clock of its
      own, because a standing instruction has to be carried out on a device
      that was closed for a week just as much as on one opened every day, and
      boot is when the app finds out how long that was. */
  autoLogDueDoses?: (driver: SqliteDriver) => Promise<void>;
  /** When to run the housekeeping passes, given the work to run. The app
      passes an idle callback (whenIdle, ../../idle.ts); leave it out and they
      start as soon as ready is reported, which is what the probes want - the
      point is only that nothing waits for them. */
  scheduleHousekeeping?: (run: () => void) => void;
  sleep?: (ms: number) => Promise<void>;
}

export async function migrateJournal(driver: SqliteDriver, fileOps: MigrationFileOps): Promise<void> {
  await runMigrations(driver, fileOps, {
    latestVersion: LATEST_SCHEMA_VERSION,
    load: async () => (await import('./migrations.ts')).migrations
  });
}

function isDatabaseLockedError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  /* "Access Handles cannot be created" is the web driver's own version of the same fact the
     rest of this pattern already covers: something else still has the file. It shows up
     when a tab that just navigated away or reloaded held the OPFS SAH pool a worker of this
     tab's own is now trying to acquire, and the browser has not yet let go of the old
     worker's access handles - a race `mc-driver.ts`'s `pagehide` release narrows but cannot
     close, since nothing here can await another page's teardown. A moment is what it needs,
     the same as a locked SQLite file needing another connection's transaction to end. */
  const pattern =
    /database is locked|\bcode 5\b|sqlite_busy|database table is locked|SQLiteDatabaseLockedException|SQLiteBusyException|\bbusy\b|Access Handles cannot be created/i;
  if (pattern.test(message)) return true;
  if (error instanceof Error && error.cause) {
    const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause);
    if (pattern.test(causeMsg)) return true;
  }
  return false;
}

type BootResult =
  | {
      phase: 'ready';
      driver: SqliteDriver;
      /** Whether the persistence request came back denied, known whenever
          the browser answers - which for Firefox is only through a
          permission prompt, so nothing here awaits it before
          resolving. Whoever wants the answer awaits this on its own. */
      persistRequest: Promise<boolean>;
      /** Resolves when the housekeeping passes have finished, and never
          rejects - a failure in any of them is warned about and left for the
          next pass that is due. Nothing in the app awaits it; the benchmarks and the
          tests that prove the passes ran do. */
      housekeeping: Promise<void>;
    }
  | { phase: 'error'; error: unknown };

export async function boot(deps: BootDeps): Promise<BootResult> {
  deps.applyBootPreferences?.();

  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRetries = 4;

  let driver!: SqliteDriver;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    /* No service worker may activate over a migration in progress:
       the transaction covers a failed step, but nothing covers the code being
       replaced between two of them. Taken before createDriver() so the window
       starts where the file is first touched. */
    const migrating = markJournalBusy();
    let failed = false;
    try {
      // createDriver() itself isn't expected to be where a failure surfaces
      // (the web driver defers real I/O to its worker, so constructing it doesn't
      // throw) - the try/catch is here for runMigrations()'s exec/
      // getUserVersion calls, which are where opening the database and
      // applying schema changes actually happen.
      driver = deps.createDriver();
      /* The list itself only where it is needed: 27KB
         of SQL text across the full schema history, which a journal already on
         the current version has no use for. The dynamic import is what keeps it
         out of the first-load graph, so it has to stay inside this call. */
      await (deps.prepareDatabase ?? migrateJournal)(driver, deps.fileOps);
      break;
    } catch (error) {
      if (driver) {
        await driver.close().catch(() => {});
      }
      if (attempt < maxRetries && isDatabaseLockedError(error)) {
        const delay = Math.min(1000, 50 * Math.pow(2, attempt));
        await sleep(delay);
        continue;
      }
      // Migrations run before anything reads or writes app data, so a
      // failure here means the caller must show a handled error state
      // instead of going on to render screens over a database that isn't
      // there.
      failed = true;
      return { phase: 'error', error };
    } finally {
      /* The guard ends with the migrations, not with boot(). What follows is
         reconcileBuiltIns, which takes the guard itself on the way through the
         journal wrapper, and the photo sweep, which only ever deletes files no
         row references - so an update landing mid-sweep leaves orphans for the
         next due sweep to reclaim (weekly, after a restore or after a failed
         delete), which is what its own failure path already does. */
      migrating(!failed);
    }
  }

  /* Asked, not awaited: Firefox answers navigator.storage.
     persist() only through a permission prompt, so a headless run (and a
     LibreWolf that clears site permissions) waited here with no bound
     before any journal read. The request still goes out; the reads go on
     without it, and persistRequest is there for whoever wants the answer. */
  const persistRequest: Promise<boolean> = deps.requestPersistentStorage
    ? deps.requestPersistentStorage().then((granted) => !granted)
    : Promise.resolve(false);

  await deps.loadReferenceData?.(driver);

  /* Schedule trash purge and orphan sweep after boot reports ready.
     Both grow with the journal; the decade fixture has 886 attachments.

     Each pass watches journal writes and yields if someone saves.
     Holding the update guard would trip its own write watch. A worker
     change after the purge commit can leave files for the sweep. Purge
     first so the sweep sees rows deleted after the 30-day trash window. */
  const housekeeping = new Promise<void>((resolve) => {
    const run = () => void housekeep(deps, driver).then(resolve);
    if (deps.scheduleHousekeeping) deps.scheduleHousekeeping(run);
    else run();
  });

  return { phase: 'ready', driver, persistRequest, housekeeping };
}

/** All three passes, in order, each one's failure its own. A failure is a
    warning and nothing more: the app is not withheld for any of these, since
    what they did not finish is still there for the next boot to retry. */
async function housekeep(deps: BootDeps, driver: SqliteDriver): Promise<void> {
  try {
    await waitForJournalIdle();
    await deps.purgeExpiredTrash?.(driver);
  } catch (error) {
    console.warn('trash purge failed; expired entries stay trashed until the next boot', error);
  }

  try {
    await waitForJournalIdle();
    if (deps.shouldSweepOrphans?.() !== false) await deps.sweepOrphanPhotos?.(driver);
  } catch (error) {
    console.warn('photo orphan sweep failed; unreferenced files stay until the next due sweep (weekly, after a restore or after a failed delete)', error);
  }

  try {
    await waitForJournalIdle();
    await deps.autoLogDueDoses?.(driver);
  } catch (error) {
    console.warn('auto-logging doses failed; the slots stay open until the next boot', error);
  }
}
