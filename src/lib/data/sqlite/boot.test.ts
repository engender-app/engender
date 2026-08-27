/* Unit tests for the boot sequence's ordering and error handling (ticket
   04). Runs against a fake driver wrapping node:sqlite - the real
   createWebSqlite() (sqlocal-driver.ts) needs a browser and is proven
   separately in the browser tier. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SqliteDriver } from './driver.ts';
import { journalIsBusy } from '../journal-busy.ts';
import { boot } from './boot.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { LATEST_SCHEMA_VERSION } from './schema-version.ts';

function makeFakeDriver(): SqliteDriver {
  const raw = new DatabaseSync(':memory:');
  return {
    async exec(sql) {
      raw.exec(sql);
    },
    async getUserVersion() {
      return (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    },
    async setUserVersion(version) {
      raw.exec(`PRAGMA user_version = ${version}`);
    },
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        const result = await fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    async query() {
      throw new Error('boot() should never call query()');
    },
    async run() {
      throw new Error('boot() should never call run()');
    },
    async close() {}
  };
}

test('opens the database, runs migrations, and reports ready', async () => {
  const result = await boot({ createDriver: makeFakeDriver, fileOps: noopFileOps() });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') {
    assert.equal(await result.driver.getUserVersion(), LATEST_SCHEMA_VERSION);
  }
});

test('runs steps in the documented order: prefs, then open+migrate, then persist, then reference data, trash purge and photo sweep', async () => {
  const order: string[] = [];
  const result = await boot({
    createDriver: () => {
      order.push('open+migrate');
      return makeFakeDriver();
    },
    fileOps: noopFileOps(),
    applyBootPreferences: () => order.push('prefs'),
    requestPersistentStorage: async () => {
      order.push('persist');
      return true;
    },
    loadReferenceData: async () => {
      order.push('referenceData');
    },
    purgeExpiredTrash: async () => {
      order.push('trashPurge');
    },
    sweepOrphanPhotos: async () => {
      order.push('photoSweep');
    }
  });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') await result.housekeeping;
  assert.deepEqual(order, ['prefs', 'open+migrate', 'persist', 'referenceData', 'trashPurge', 'photoSweep']);
});

test('reports ready before either housekeeping pass has run', async () => {
  /* Phase 5 audit finding 03: journalIsOpen() unparks every liveQuery in the
     app, and it only runs once boot() resolves - so a screen's first read used
     to wait on two passes whose results no screen needs. The purge and the
     sweep both grow with the journal; what a screen waits for must not. */
  const order: string[] = [];
  let housekeepingScheduled = false;
  let runHousekeeping: (() => void) | null = null;

  const result = await boot({
    createDriver: makeFakeDriver,
    fileOps: noopFileOps(),
    loadReferenceData: async () => {
      order.push('referenceData');
    },
    purgeExpiredTrash: async () => {
      order.push('trashPurge');
    },
    sweepOrphanPhotos: async () => {
      order.push('photoSweep');
    },
    scheduleHousekeeping: (run) => {
      housekeepingScheduled = true;
      runHousekeeping = run;
    }
  });

  assert.equal(result.phase, 'ready');
  assert.ok(housekeepingScheduled, 'the passes have to be scheduled, not dropped');
  assert.deepEqual(order, ['referenceData'], 'reference data is still waited for; housekeeping is not');

  runHousekeeping!();
  if (result.phase === 'ready') await result.housekeeping;
  assert.deepEqual(order, ['referenceData', 'trashPurge', 'photoSweep'], 'and both still run, in order');
});

test('housekeeping runs on every boot even with no scheduler injected', async () => {
  // What the probes and the tests that ask nothing of the ordering get: off
  // the critical path, but started as soon as ready is reported.
  const order: string[] = [];
  const result = await boot({
    createDriver: makeFakeDriver,
    fileOps: noopFileOps(),
    purgeExpiredTrash: async () => {
      order.push('trashPurge');
    },
    sweepOrphanPhotos: async () => {
      order.push('photoSweep');
    }
  });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') await result.housekeeping;
  assert.deepEqual(order, ['trashPurge', 'photoSweep']);
});

test('reports persistDenied when persistent storage is refused', async () => {
  const result = await boot({
    createDriver: makeFakeDriver,
    fileOps: noopFileOps(),
    requestPersistentStorage: async () => false
  });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') assert.equal(result.persistDenied, true);
});

test('does not ask for persistent storage when no hook is given', async () => {
  const result = await boot({ createDriver: makeFakeDriver, fileOps: noopFileOps() });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') assert.equal(result.persistDenied, false);
});

test('a migration failure surfaces as a handled error result, not a thrown exception', async () => {
  const brokenDriver = (): SqliteDriver => {
    const driver = makeFakeDriver();
    return { ...driver, getUserVersion: async () => { throw new Error('disk full'); } };
  };

  const result = await boot({ createDriver: brokenDriver, fileOps: noopFileOps() });

  assert.equal(result.phase, 'error');
  if (result.phase === 'error') assert.match(String(result.error), /disk full/);
});

test('does not load reference data or sweep photos after a failed migration', async () => {
  let touchedAfterFailure = false;
  const brokenDriver = (): SqliteDriver => {
    const driver = makeFakeDriver();
    return { ...driver, getUserVersion: async () => { throw new Error('disk full'); } };
  };

  await boot({
    createDriver: brokenDriver,
    fileOps: noopFileOps(),
    loadReferenceData: async () => { touchedAfterFailure = true; },
    purgeExpiredTrash: async () => { touchedAfterFailure = true; },
    sweepOrphanPhotos: async () => { touchedAfterFailure = true; }
  });

  assert.equal(touchedAfterFailure, false);
});

test('migrations hold the update guard, so a waiting worker cannot take over mid-migration', async () => {
  // The dangerous one of the four (ticket 04): a save interrupted costs a
  // spinner, a migration interrupted can cost the journal.
  const duringMigration: boolean[] = [];
  const watchingDriver = (): SqliteDriver => {
    const driver = makeFakeDriver();
    return {
      ...driver,
      async exec(sql) {
        duringMigration.push(journalIsBusy());
        return driver.exec(sql);
      }
    };
  };

  await boot({ createDriver: watchingDriver, fileOps: noopFileOps() });

  assert.ok(duringMigration.length > 0, 'the migration runner has to have run for this to prove anything');
  assert.ok(
    duringMigration.every((busy) => busy),
    'every statement a migration ran must have been under the guard'
  );
  assert.equal(journalIsBusy(), false, 'and the guard has to be back down once boot is finished');
});

test('a failed migration lets the update guard go, so the app is not stuck on this release', async () => {
  const brokenDriver = (): SqliteDriver => {
    const driver = makeFakeDriver();
    return { ...driver, getUserVersion: async () => { throw new Error('disk full'); } };
  };

  await boot({ createDriver: brokenDriver, fileOps: noopFileOps() });

  assert.equal(journalIsBusy(), false);
});

test('a failing photo sweep still boots: housekeeping must not cost the app its screens', async () => {
  // Ticket 11 made this reachable - the sweep hits OPFS, which can fail on
  // quota or in a browser without it. Reference data is different: a screen
  // cannot render without it, so that failure is still the caller's.
  const result = await boot({
    createDriver: makeFakeDriver,
    fileOps: noopFileOps(),
    sweepOrphanPhotos: async () => {
      throw new Error('OPFS unavailable');
    }
  });

  assert.equal(result.phase, 'ready');
  // And the deferred pass swallows it the same way, rather than surfacing as
  // an unhandled rejection now that nothing awaits it on the way to a screen.
  if (result.phase === 'ready') await assert.doesNotReject(() => result.housekeeping);
});

test('a failing trash purge still boots: housekeeping must not cost the app its screens', async () => {
  // Phase 5 ticket 19, the same reasoning the photo sweep above gets: a
  // failed purge leaves the trash for the next boot to try again.
  let sweptAnyway = false;
  const result = await boot({
    createDriver: makeFakeDriver,
    fileOps: noopFileOps(),
    purgeExpiredTrash: async () => {
      throw new Error('disk full');
    },
    sweepOrphanPhotos: async () => {
      sweptAnyway = true;
    }
  });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') await assert.doesNotReject(() => result.housekeeping);
  assert.ok(sweptAnyway, 'and the pass behind it still runs: one failing does not cancel the other');
});
