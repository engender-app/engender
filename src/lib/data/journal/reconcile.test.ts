/* Reconciling built-ins by key is one idempotent operation, called from
   boot and reused by ticket 14's Replace (ADR-0002, ADR-0017). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import {
  BUILT_IN_AFFIRMATION_KEYS,
  BUILT_IN_DIMENSIONS,
  BUILT_IN_TAG_GROUPS
} from '../vocabulary/builtins.ts';
import type { TableName } from '../live/writes.ts';
import { openJournal } from './journal.ts';
import { RECONCILE_TABLES, reconcileBuiltIns } from './reconcile.ts';
import { countingDriver } from './test-support.ts';

const count = (db: Awaited<ReturnType<typeof migratedDb>>, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('seeds every built-in dimension, group and tag into an empty journal, and no preset', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  assert.equal(count(db, 'gender_dimension'), BUILT_IN_DIMENSIONS.length);
  // Ticket 35 left the presets legacy-only, so an empty journal gets none.
  assert.equal(count(db, 'gender_preset'), 0);
  assert.equal(count(db, 'tag_group'), BUILT_IN_TAG_GROUPS.length);
  assert.equal(count(db, 'tag'), BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags).length);
  assert.equal(count(db, 'affirmation'), BUILT_IN_AFFIRMATION_KEYS.length);

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

test('restores a missing built-in affirmation without touching a custom one', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  await journal.affirmations.addLine('en', 'You are doing great.');

  db.raw.exec("DELETE FROM affirmation WHERE key = 'affirmation_1'");
  await journal.reconcileBuiltIns();

  const affirmations = await journal.affirmations.getAffirmations();
  assert.ok(affirmations.some((a) => a.id === 'affirmation_1'), 'affirmation_1 restored');
  assert.ok(affirmations.some((a) => a.text === 'You are doing great.'), 'custom line survived');
});

test('the appointment debrief seeds hidden, and an ordinary template seeds visible (ticket 25)', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  const debrief = db.raw.prepare("SELECT hidden FROM entry_template WHERE key = 'appointment_debrief'").get() as {
    hidden: number;
  };
  assert.equal(debrief.hidden, 1, 'appointment_debrief seeds hidden');

  const ordinary = db.raw.prepare("SELECT hidden FROM entry_template WHERE key = 'euphoria_day'").get() as {
    hidden: number;
  };
  assert.equal(ordinary.hidden, 0, 'euphoria_day seeds visible');
});

test('a reconcile over an existing journal leaves a person-set entry template hidden flag alone (ticket 25)', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();

  db.raw.exec("UPDATE entry_template SET hidden = 0 WHERE key = 'appointment_debrief'");
  db.raw.exec("DELETE FROM entry_template WHERE key = 'euphoria_day'");
  await journal.reconcileBuiltIns();

  const debrief = db.raw.prepare("SELECT hidden FROM entry_template WHERE key = 'appointment_debrief'").get() as {
    hidden: number;
  };
  assert.equal(debrief.hidden, 0, 'a debrief the person showed stays shown');

  const restored = db.raw.prepare("SELECT hidden FROM entry_template WHERE key = 'euphoria_day'").get() as {
    hidden: number;
  };
  assert.equal(restored.hidden, 0, 'a restored built-in gets its own seed default');
});

// The physical schema tables reconcileBuiltIns inserts into, mapped to the
// logical TableName writes.ts announces (ticket 28's drift guard): a new
// built-in table added to reconcile.ts without an entry here, or without a
// matching RECONCILE_TABLES entry, fails this test instead of silently
// missing its invalidation.
const PHYSICAL_TO_LOGICAL: Record<string, TableName> = {
  gender_dimension: 'dimension',
  gender_preset: 'preset',
  preset_dimension: 'preset',
  tag_group: 'tag',
  tag: 'tag',
  affirmation: 'affirmation',
  body_region: 'bodyRegion',
  measurement_type: 'measurementType',
  effect_category: 'effectCategory',
  personal_effect_type: 'personalEffectType',
  entry_template: 'entryTemplate',
  entry_template_tag: 'entryTemplate',
  entry_template_dimension_value: 'entryTemplate'
};

test('RECONCILE_TABLES names exactly the tables reconcileBuiltIns writes', async () => {
  const db = await migratedDb();
  const written = new Set<TableName>();
  const counting = countingDriver(db, {
    onRun(sql) {
      const table = /INSERT INTO\s+(\w+)/i.exec(sql)?.[1];
      if (table) {
        const logical = PHYSICAL_TO_LOGICAL[table];
        assert.ok(logical, `reconcileBuiltIns writes ${table}, which no logical table covers`);
        written.add(logical);
      }
    }
  });

  await reconcileBuiltIns(counting.driver);

  assert.deepEqual([...written].toSorted(), [...RECONCILE_TABLES].toSorted());
});
