import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runBootHousekeepingContract } from '../journal/contract-suite';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { migratedDb } from './test-support/migrated-db';

test('boot waits for admitted stock reconciliation after Replace, then purges trash and sweeps proven orphans', async () => {
  const db = await migratedDb();
  try {
    const checks = await runBootHousekeepingContract(db, fakeFileStore());
    assert.equal(checks.length, 7, 'the complete Replace/boot fixture must run');
    assert.deepEqual(checks.filter((check) => !check.ok), []);
  } finally {
    await db.close();
  }
});
