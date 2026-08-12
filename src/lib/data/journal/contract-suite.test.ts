/* The contract suite over node:sqlite (ticket 11).

   This is the baseline the Android tier has to match: the same suite runs on
   a phone from tests/android-tier/, over SQLCipher through the Capacitor
   bridge, and both are expected to report every check passing. Running it
   here as well is what keeps it honest - a suite that only ever runs on the
   slow tier rots between the runs that would have caught it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { runJournalContract } from './contract-suite.ts';

test('every driver contract check passes over node:sqlite', async () => {
  const db = await migratedDb();

  const checks = await runJournalContract(db, fakeFileStore());

  const failed = checks.filter((c) => !c.ok);
  assert.deepEqual(
    failed.map((c) => `${c.name}: ${c.detail}`),
    []
  );
  // A suite that silently stopped collecting would otherwise pass here.
  assert.ok(checks.length >= 20, `expected the whole suite to run, got ${checks.length} checks`);
});
