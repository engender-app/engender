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
    assert.equal(await result.driver.getUserVersion(), 10);
  }
});

test('runs steps in the documented order: prefs, then open+migrate, then persist, then reference data and photo sweep', async () => {
  const order: string[] = [];
  await boot({
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
    sweepOrphanPhotos: async () => {
      order.push('photoSweep');
    }
  });

  assert.deepEqual(order, ['prefs', 'open+migrate', 'persist', 'referenceData', 'photoSweep']);
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
});
