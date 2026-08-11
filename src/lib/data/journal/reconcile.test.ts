/* Reconciling built-ins by key is one idempotent operation, called from
   boot and reused by ticket 14's Replace (ADR-0002, ADR-0017). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BUILT_IN_DIMENSIONS, BUILT_IN_PRESETS, BUILT_IN_TAG_GROUPS } from '../vocabulary/builtins.ts';
import { openJournal } from './journal.ts';

const count = (db: Awaited<ReturnType<typeof migratedDb>>, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('seeds every built-in dimension, preset, group and tag into an empty journal', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  assert.equal(count(db, 'gender_dimension'), BUILT_IN_DIMENSIONS.length);
  assert.equal(count(db, 'gender_preset'), BUILT_IN_PRESETS.length);
  assert.equal(count(db, 'tag_group'), BUILT_IN_TAG_GROUPS.length);
  assert.equal(count(db, 'tag'), BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags).length);

  // Preset links land in declared order, resolved through dimension keys.
  const nb = db.raw
    .prepare(
      `SELECT gd.key FROM preset_dimension pd
       JOIN gender_preset gp ON gp.id = pd.preset_id
       JOIN gender_dimension gd ON gd.id = pd.dimension_id
       WHERE gp.key = 'p-nb' ORDER BY pd.order_index`
    )
    .all()
    .map((r) => (r as { key: string }).key);
  assert.deepEqual(nb, [...BUILT_IN_PRESETS[1].dims]);
});

test('running twice changes nothing', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  const before = ['gender_dimension', 'gender_preset', 'tag_group', 'tag', 'preset_dimension'].map((t) =>
    count(db, t)
  );

  await journal.reconcileBuiltIns();
  const after = ['gender_dimension', 'gender_preset', 'tag_group', 'tag', 'preset_dimension'].map((t) =>
    count(db, t)
  );
  assert.deepEqual(after, before);
});

test('restores a missing built-in without touching custom rows', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  await journal.tags.addTag('emotions', 'proud');

  db.raw.exec("DELETE FROM tag WHERE key = 'e-happy'");
  await journal.reconcileBuiltIns();

  const groups = await journal.tags.getTagGroups();
  const emotions = groups.find((g) => g.key === 'emotions')!;
  assert.ok(emotions.tags.some((t) => t.id === 'e-happy'), 'e-happy restored');
  assert.ok(emotions.tags.some((t) => t.label === 'proud'), 'custom tag survived');
});
