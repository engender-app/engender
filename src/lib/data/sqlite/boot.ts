/* The boot sequence (ticket 04). Order is load-bearing for later tickets
   and must not change without checking all four:

     1. Read boot-set preferences from localStorage (ticket 06 fills this
        in - theme/palette/language need to apply before first paint, and
        the lock screen needs to render before the database is even open).
     2. Open the database and run migrations (ticket 02) - this ticket's
        own job, fully implemented below.
     3. Load mirrored reference data into reactive state (ticket 08).
     4. Purge trash past its 30-day window, then run the photo orphan sweep
        (ticket 11; phase 5 ticket 19) - off the critical path since phase 5
        audit ticket 02: scheduled as boot reports ready rather than waited
        for, because no screen reads what either of them produces.

   Steps 1, 3 and 4 are dependency-injected no-ops until their tickets land
   - boot() still calls them in order so the shape doesn't change later,
   but nothing here decides what they do. Everything is injected (not
   imported directly) so this file's ordering and error handling can be
   unit-tested in the Node tier against a fake driver, while the real app
   supplies createWebSqlite() from sqlocal-driver.ts. */

import { markJournalBusy } from '../journal-busy.ts';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import { runMigrations } from './migration-runner.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';

interface BootDeps {
  createDriver: () => SqliteDriver;
  fileOps: MigrationFileOps;
  applyBootPreferences?: () => void;
  requestPersistentStorage?: () => Promise<boolean>;
  loadReferenceData?: (driver: SqliteDriver) => Promise<void>;
  purgeExpiredTrash?: (driver: SqliteDriver) => Promise<void>;
  sweepOrphanPhotos?: (driver: SqliteDriver) => Promise<void>;
  /** When to run the two housekeeping passes, given the work to run. The app
      passes an idle callback (whenIdle, ../../idle.ts); leave it out and they
      start as soon as ready is reported, which is what the probes want - the
      point is only that nothing waits for them. */
  scheduleHousekeeping?: (run: () => void) => void;
}

type BootResult =
  | {
      phase: 'ready';
      driver: SqliteDriver;
      persistDenied: boolean;
      /** Resolves when both housekeeping passes have finished, and never
          rejects - a failure in either is warned about and left for the next
          boot. Nothing in the app awaits it; the benchmarks and the tests
          that prove the passes ran do. */
      housekeeping: Promise<void>;
    }
  | { phase: 'error'; error: unknown };

export async function boot(deps: BootDeps): Promise<BootResult> {
  deps.applyBootPreferences?.();

  let driver: SqliteDriver;
  /* No service worker may activate over a migration in progress (ticket 04):
     the transaction covers a failed step, but nothing covers the code being
     replaced between two of them. Taken before createDriver() so the window
     starts where the file is first touched. */
  const migrating = markJournalBusy();
  try {
    // createDriver() itself isn't expected to be where a failure surfaces
    // (SQLocal defers real I/O to its worker, so constructing it doesn't
    // throw) - the try/catch is here for runMigrations()'s exec/
    // getUserVersion calls, which are where opening the database and
    // applying schema changes actually happen.
    driver = deps.createDriver();
    /* The list itself only where it is needed (phase 5 audit ticket 02): 27KB
       of SQL text across the full schema history, which a journal already on
       the current version has no use for. The dynamic import is what keeps it
       out of the first-load graph, so it has to stay inside this call. */
    await runMigrations(driver, deps.fileOps, {
      latestVersion: LATEST_SCHEMA_VERSION,
      load: async () => (await import('./migrations.ts')).migrations
    });
  } catch (error) {
    // Migrations run before anything reads or writes app data, so a
    // failure here means the caller must show a handled error state
    // instead of going on to render screens over a database that isn't
    // there (ticket 04's acceptance: not a blank screen).
    return { phase: 'error', error };
  } finally {
    /* The guard ends with the migrations, not with boot(). What follows is
       reconcileBuiltIns, which takes the guard itself on the way through the
       journal wrapper, and the photo sweep, which only ever deletes files no
       row references - so an update landing mid-sweep leaves orphans for the
       next boot to reclaim, which is what its own failure path already
       does. */
    migrating();
  }

  const persistDenied = deps.requestPersistentStorage ? !(await deps.requestPersistentStorage()) : false;

  await deps.loadReferenceData?.(driver);

  /* Step 4, scheduled rather than awaited (phase 5 audit ticket 02). Neither
     pass produces anything a screen reads, and both grow with the journal -
     the sweep lists the whole attachment directory, which is 886 files on the
     decade fixture - while the call that unparks every query in the app waits
     on boot() resolving.

     What changes for them is that they now run with the screens live, so each
     one takes the write watch its own module documents (watchJournalWrites,
     ../journal-busy.ts) and gives up rather than delete something a write is
     in the middle of. The update guard is deliberately not extended over them:
     it is the same counter the watch reads, so a pass holding it would see its
     own write and decline every time. What that costs is a service worker
     activating between the purge's commit and its file removals, which leaves
     orphan files for the sweep - and what it buys is the pass declining when a
     person is saving, which is the failure that would cost data.

     The order stays: the purge runs first so an entry whose 30 days are up is
     a real delete before the sweep asks what nothing references any more. */
  const housekeeping = new Promise<void>((resolve) => {
    const run = () => void housekeep(deps, driver).then(resolve);
    if (deps.scheduleHousekeeping) deps.scheduleHousekeeping(run);
    else run();
  });

  return { phase: 'ready', driver, persistDenied, housekeeping };
}

/** Both passes, in order, each one's failure its own. A failure is a warning
    and nothing more: the app is not withheld for either of these, since what
    they did not finish is still there for the next boot to retry. */
async function housekeep(deps: BootDeps, driver: SqliteDriver): Promise<void> {
  try {
    await deps.purgeExpiredTrash?.(driver);
  } catch (error) {
    console.warn('trash purge failed; expired entries stay trashed until the next boot', error);
  }

  try {
    await deps.sweepOrphanPhotos?.(driver);
  } catch (error) {
    console.warn('photo orphan sweep failed; unreferenced files stay until the next boot', error);
  }
}
