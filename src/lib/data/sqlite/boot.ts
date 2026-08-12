/* The boot sequence (ticket 04). Order is load-bearing for later tickets
   and must not change without checking all four:

     1. Read boot-set preferences from localStorage (ticket 06 fills this
        in - theme/palette/language need to apply before first paint, and
        the lock screen needs to render before the database is even open).
     2. Open the database and run migrations (ticket 02) - this ticket's
        own job, fully implemented below.
     3. Load mirrored reference data into reactive state (ticket 08).
     4. Run the photo orphan sweep (ticket 11).

   Steps 1, 3 and 4 are dependency-injected no-ops until their tickets land
   - boot() still calls them in order so the shape doesn't change later,
   but nothing here decides what they do. Everything is injected (not
   imported directly) so this file's ordering and error handling can be
   unit-tested in the Node tier against a fake driver, while the real app
   supplies createWebSqlite() from sqlocal-driver.ts. */

import { enterWriteInFlight } from '../../pwa/writes-in-flight.ts';
import type { SqliteDriver } from './driver.ts';
import type { MigrationFileOps } from './migration-runner.ts';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';

export interface BootDeps {
  createDriver: () => SqliteDriver;
  fileOps: MigrationFileOps;
  applyBootPreferences?: () => void;
  requestPersistentStorage?: () => Promise<boolean>;
  loadReferenceData?: (driver: SqliteDriver) => Promise<void>;
  sweepOrphanPhotos?: (driver: SqliteDriver) => Promise<void>;
}

export type BootResult =
  | { phase: 'ready'; driver: SqliteDriver; persistDenied: boolean }
  | { phase: 'error'; error: unknown };

export async function boot(deps: BootDeps): Promise<BootResult> {
  deps.applyBootPreferences?.();

  let driver: SqliteDriver;
  /* No service worker may activate over a migration in progress (ticket 04):
     the transaction covers a failed step, but nothing covers the code being
     replaced between two of them. Taken before createDriver() so the window
     starts where the file is first touched. */
  const migrating = enterWriteInFlight();
  try {
    // createDriver() itself isn't expected to be where a failure surfaces
    // (SQLocal defers real I/O to its worker, so constructing it doesn't
    // throw) - the try/catch is here for runMigrations()'s exec/
    // getUserVersion calls, which are where opening the database and
    // applying schema changes actually happen.
    driver = deps.createDriver();
    await runMigrations(driver, deps.fileOps, migrations);
  } catch (error) {
    // Migrations run before anything reads or writes app data, so a
    // failure here means the caller must show a handled error state
    // instead of going on to render screens over a database that isn't
    // there (ticket 04's acceptance: not a blank screen).
    return { phase: 'error', error };
  } finally {
    migrating();
  }

  const persistDenied = deps.requestPersistentStorage ? !(await deps.requestPersistentStorage()) : false;

  await deps.loadReferenceData?.(driver);

  /* The sweep is housekeeping: it reclaims photo files no row references
     (ticket 11). It touches OPFS, which can fail on quota or in a browser
     without it, and none of that is a reason to withhold the app - the
     files it did not reclaim are still there for the next boot to try
     again. Reference data above is not like this: a screen cannot render
     without it, so its failure stays the caller's. */
  try {
    await deps.sweepOrphanPhotos?.(driver);
  } catch (error) {
    console.warn('photo orphan sweep failed; unreferenced files stay until the next boot', error);
  }

  return { phase: 'ready', driver, persistDenied };
}
