/* Functional audit ticket 44: version 118 rewrites stored preferences so the
   catalogue can drop keys without a permanent read-across. Every choice a
   person made has to come out the other side. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

async function migrateFrom117(rows: [string, string][]) {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 117));
  for (const [key, value] of rows) db.raw.prepare('INSERT INTO pref (key, value) VALUES (?, ?)').run(key, value);
  await runMigrations(db, fileOps, migrations);
  const out: Record<string, unknown> = {};
  for (const row of db.raw.prepare('SELECT key, value FROM pref').all() as { key: string; value: string }[]) {
    out[row.key] = JSON.parse(row.value);
  }
  return out;
}

test('version 118 folds the eight surface switches into one map, keeping only the offs', async () => {
  const prefs = await migrateFrom117([
    ['wearTimerEnabled', 'false'],
    ['dosePanelEnabled', 'true'],
    ['readyLetterEnabled', 'false'],
    ['surgeryCountdownEnabled', 'true'],
    ['safeSpaceNudgeEnabled', 'false'],
    ['stockNoticeEnabled', 'true'],
    ['wrappedEnabled', 'false'],
    ['onThisDayEnabled', 'true']
  ]);

  assert.deepEqual(prefs.surfaceOverrides, {
    'wear-timer': false,
    'ready-letter': false,
    'safe-space-nudge': false,
    wrapped: false
  });
  for (const key of ['wearTimerEnabled', 'dosePanelEnabled', 'readyLetterEnabled', 'surgeryCountdownEnabled',
    'safeSpaceNudgeEnabled', 'stockNoticeEnabled', 'wrappedEnabled', 'onThisDayEnabled']) {
    assert.equal(key in prefs, false, key);
  }
});

test('a journal that never touched a surface switch gets no map row', async () => {
  const prefs = await migrateFrom117([['theme', '"dark"']]);

  assert.equal('surfaceOverrides' in prefs, false);
  assert.equal(prefs.theme, 'dark');
});

test('version 118 reads lock on leave into lock timing, and removes the old row', async () => {
  assert.equal((await migrateFrom117([['lockOnLeave', 'true']])).lockAfter, 'immediately');
  assert.equal((await migrateFrom117([['lockOnLeave', 'false']])).lockAfter, 'restart');
  const chosen = await migrateFrom117([['lockOnLeave', 'true'], ['lockAfter', '"five-minutes"']]);
  assert.equal(chosen.lockAfter, 'five-minutes');
  assert.equal('lockOnLeave' in chosen, false);
});

test('a legacy cycle opt-in becomes an explicit choice unless one was already made', async () => {
  assert.equal((await migrateFrom117([['cycleTrackingEnabled', 'true']])).cycleTrackingChoice, true);
  assert.equal((await migrateFrom117([['cycleTrackingEnabled', 'true'], ['cycleTrackingChoice', 'null']])).cycleTrackingChoice, true);
  assert.equal((await migrateFrom117([['cycleTrackingEnabled', 'true'], ['cycleTrackingChoice', 'false']])).cycleTrackingChoice, false);
  const off = await migrateFrom117([['cycleTrackingEnabled', 'false']]);
  assert.equal('cycleTrackingChoice' in off, false);
  assert.equal('cycleTrackingEnabled' in off, false);
});

test('the four editor-card switches nothing writes are removed', async () => {
  const prefs = await migrateFrom117([
    ['entryTryoutPromptEnabled', 'false'],
    ['entryDoseQuickLogEnabled', 'true'],
    ['entryProcedureRecoveryEnabled', 'true'],
    ['entryHrtEffectsEnabled', 'true']
  ]);

  assert.deepEqual(Object.keys(prefs), []);
});
