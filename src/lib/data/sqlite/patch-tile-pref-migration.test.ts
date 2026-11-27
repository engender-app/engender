/* The patch-schedule tile is folded into the dose panel, so version 116 drops the switch
   that turned it off. Every other preference stays as it was. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { preSquashChain } from './test-support/pre-squash-chain.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 116 drops the patch-schedule tile switch and keeps the dose panel one', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, preSquashChain.filter((m) => m.version <= 115));
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('patchScheduleTileEnabled', 'false'),
                                                   ('dosePanelEnabled', 'false')`);

  // Stops at 116: version 117 later folds the dose panel's own switch into surfaceOverrides.
  await runMigrations(db, fileOps, preSquashChain.filter((m) => m.version <= 116));

  assert.deepEqual(
    db.raw.prepare("SELECT key, value FROM pref WHERE key IN ('patchScheduleTileEnabled', 'dosePanelEnabled')")
      .all().map((row) => ({ ...(row as object) })),
    [{ key: 'dosePanelEnabled', value: 'false' }]
  );
});
