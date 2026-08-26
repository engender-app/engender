/* Reconciling the built-in vocabulary into the journal, by key (ADR-0002).

   One idempotent operation, not a seed-if-empty branch: it adds what is
   missing and touches nothing else, so it is safe on every boot and runs
   again before an import applies - a Replace import must not be able to
   leave the journal short of a built-in it needs (ticket 14 reuses this).

   Keys only, no display text: a built-in's wording lives in the message
   catalogue and is resolved at display time (F25), so name/label columns
   are stored as '' for built-ins and never read for them. */

import type { SqliteDriver } from '../sqlite/driver';
import type { TableName } from '../live/writes';
import {
  BUILT_IN_AFFIRMATION_KEYS,
  BUILT_IN_BODY_REGIONS,
  BUILT_IN_DIMENSIONS,
  BUILT_IN_EFFECT_CATEGORIES,
  BUILT_IN_MEASUREMENT_TYPES,
  BUILT_IN_PERSONAL_EFFECT_TYPES,
  BUILT_IN_TAG_GROUPS
} from '../vocabulary/builtins';
import { now } from './support';

/** The tables this module writes, single-sourced here because this is the
    module that knows: writes.ts imports it rather than hand-maintaining its
    own copy, so a built-in table added above cannot silently miss its
    invalidation (ticket 28). Reconciling usually finds nothing to do, and
    announcing these three tables for a no-op is cheaper than asking it to
    report what it actually changed. */
export const RECONCILE_TABLES: TableName[] = [
  'tag',
  'dimension',
  'affirmation',
  'bodyRegion',
  'measurementType',
  'effectCategory',
  'personalEffectType'
];

async function presentKeys(driver: SqliteDriver, table: string): Promise<Set<string>> {
  const rows = await driver.query<{ key: string }>(`SELECT key FROM ${table} WHERE key IS NOT NULL`);
  return new Set(rows.map((r) => r.key));
}

export async function reconcileBuiltIns(driver: SqliteDriver): Promise<void> {
  await driver.transaction(() => reconcileBuiltInsWithin(driver));
}

/** The same work without a transaction of its own, for the one caller that
    is already inside one: an import seeds and then swaps the journal as a
    single transaction, so that a failure leaves the database exactly as it
    was rather than as the next boot would have made it (ticket 14). SQLite
    has no nested transactions, which is why this is a second entry point and
    not a second implementation. */
export async function reconcileBuiltInsWithin(driver: SqliteDriver): Promise<void> {
  const ts = now();

  const dimensionKeys = await presentKeys(driver, 'gender_dimension');
  for (const d of BUILT_IN_DIMENSIONS) {
    if (dimensionKeys.has(d.key)) continue;
    await driver.run(
      `INSERT INTO gender_dimension (key, name, low_label, high_label, min_value, max_value, is_built_in, updated_at)
       VALUES (?, '', '', '', ?, ?, 1, ?)`,
      [d.key, d.min, d.max, ts]
    );
  }

  /* No preset is seeded. The eight stopped being a picker in ticket 35 and
     the app has read none since; BUILT_IN_PRESETS survives only to say what
     a preset key meant when an older archive was written, which
     archive/payload.ts and schema v42 read from the constant rather than
     from these rows. Writing eight presets and twenty five link rows into a
     journal created today put a table in it that nothing would ever read and
     that every one of its exports would then carry.

     Rows already seeded stay. This stops adding them and deletes nothing, so
     a journal that has them keeps exporting them and a restore still applies
     whatever an archive carries (archiveApply.ts).

     What went with it, named because it was deliberate once: an archive that
     omitted a built-in preset used to come back with that preset's scales
     intact, because reconcile had already seeded them underneath. Restoring
     such an archive now leaves the preset absent, which no surface in the
     app can tell apart from present. */

  const groupKeys = await presentKeys(driver, 'tag_group');
  const tagKeys = await presentKeys(driver, 'tag');
  for (const [orderIndex, g] of BUILT_IN_TAG_GROUPS.entries()) {
    if (!groupKeys.has(g.key)) {
      await driver.run(`INSERT INTO tag_group (key, name, order_index, updated_at) VALUES (?, '', ?, ?)`, [
        g.key,
        orderIndex,
        ts
      ]);
    }
    for (const [tagIndex, tagKey] of g.tags.entries()) {
      if (tagKeys.has(tagKey)) continue;
      await driver.run(
        `INSERT INTO tag (key, group_id, label, order_index, updated_at)
         SELECT ?, id, '', ?, ? FROM tag_group WHERE key = ?`,
        [tagKey, tagIndex, ts, g.key]
      );
    }
  }

  const affirmationKeys = await presentKeys(driver, 'affirmation');
  for (const key of BUILT_IN_AFFIRMATION_KEYS) {
    if (affirmationKeys.has(key)) continue;
    await driver.run(`INSERT INTO affirmation (key, text, updated_at) VALUES (?, '', ?)`, [key, ts]);
  }

  const bodyRegionKeys = await presentKeys(driver, 'body_region');
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (bodyRegionKeys.has(key)) continue;
    await driver.run(`INSERT INTO body_region (key, name, updated_at) VALUES (?, '', ?)`, [key, ts]);
  }

  const measurementTypeKeys = await presentKeys(driver, 'measurement_type');
  for (const t of BUILT_IN_MEASUREMENT_TYPES) {
    if (measurementTypeKeys.has(t.key)) continue;
    await driver.run(`INSERT INTO measurement_type (key, name, is_built_in, updated_at) VALUES (?, '', 1, ?)`, [
      t.key,
      ts
    ]);
  }

  const effectCategoryKeys = await presentKeys(driver, 'effect_category');
  for (const c of BUILT_IN_EFFECT_CATEGORIES) {
    if (effectCategoryKeys.has(c.key)) continue;
    await driver.run(`INSERT INTO effect_category (key, name, enabled, updated_at) VALUES (?, '', ?, ?)`, [
      c.key,
      c.defaultEnabled ? 1 : 0,
      ts
    ]);
  }

  const personalEffectTypeKeys = await presentKeys(driver, 'personal_effect_type');
  for (const e of BUILT_IN_PERSONAL_EFFECT_TYPES) {
    if (personalEffectTypeKeys.has(e.key)) continue;
    await driver.run(
      `INSERT INTO personal_effect_type (key, name, is_built_in, category_key, direction, updated_at) VALUES (?, '', 1, ?, ?, ?)`,
      [e.key, e.category, e.direction, ts]
    );
  }
}
