/* Unit tests for the boot sequence's ordering and error handling (ticket
   04). Runs against a fake driver wrapping node:sqlite - the real
   createWebSqlite() (sqlocal-driver.ts) needs a browser and is proven
   separately in the browser tier. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SqliteDriver } from './driver.ts';
import { boot } from './boot.ts';

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

function noopFileOps() {
  return { copyDatabaseFile() {}, cleanupPreMigrationCopy() {} };
}

test('opens the database, runs migrations, and reports ready', async () => {
  const result = await boot({ createDriver: makeFakeDriver, fileOps: noopFileOps() });

  assert.equal(result.phase, 'ready');
  if (result.phase === 'ready') {
    assert.equal(await result.driver.getUserVersion(), 2);
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
