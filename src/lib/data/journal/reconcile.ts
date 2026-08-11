/* Reconciling the built-in vocabulary into the journal, by key (ADR-0002).

   One idempotent operation, not a seed-if-empty branch: it adds what is
   missing and touches nothing else, so it is safe on every boot and runs
   again before an import applies - a Replace import must not be able to
   leave the journal short of a built-in it needs (ticket 14 reuses this).

   Keys only, no display text: a built-in's wording lives in the message
   catalogue and is resolved at display time (F25), so name/label columns
   are stored as '' for built-ins and never read for them. */

import type { SqliteDriver } from '../sqlite/driver';
import { BUILT_IN_DIMENSIONS, BUILT_IN_PRESETS, BUILT_IN_TAG_GROUPS } from '../vocabulary/builtins';
import { now } from './support';

async function presentKeys(driver: SqliteDriver, table: string): Promise<Set<string>> {
  const rows = await driver.query<{ key: string }>(`SELECT key FROM ${table} WHERE key IS NOT NULL`);
  return new Set(rows.map((r) => r.key));
}

export async function reconcileBuiltIns(driver: SqliteDriver): Promise<void> {
  await driver.transaction(async () => {
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

    const presetKeys = await presentKeys(driver, 'gender_preset');
    for (const p of BUILT_IN_PRESETS) {
      if (presetKeys.has(p.key)) continue;
      await driver.run(`INSERT INTO gender_preset (key, name, is_built_in, updated_at) VALUES (?, '', 1, ?)`, [
        p.key,
        ts
      ]);
      for (const [orderIndex, dimKey] of p.dims.entries()) {
        await driver.run(
          `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
           SELECT gp.id, gd.id, ? FROM gender_preset gp, gender_dimension gd WHERE gp.key = ? AND gd.key = ?`,
          [orderIndex, p.key, dimKey]
        );
      }
    }

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
  });
}
