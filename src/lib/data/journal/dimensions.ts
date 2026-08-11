/* The dimensions area (PRD F3). Dimensions hide, never delete: the
   ON DELETE CASCADE on entry_dimension_value would take every value ever
   logged on it, so no delete operation exists here at all. A true
   delete, if ever offered, is a separate explicitly-worded action that
   states how many values it destroys.

   Presets and dimensions are addressed by key (dimensions carry a NOT
   NULL key even when custom - the minted uuid doubles as one); preset ids
   are the seeded key or the minted uuid (ADR-0002). */

import type { SqliteDriver } from '../sqlite/driver';
import type { GenderDimension, GenderPreset } from '../types';
import { assertChanged, bool, domainIdOf, mintUuid, now } from './support';

export interface DimensionsArea {
  getDimensions(): Promise<GenderDimension[]>;
  getPresets(): Promise<GenderPreset[]>;
  addCustomDimension(dim: Omit<GenderDimension, 'key' | 'builtIn' | 'hidden'>): Promise<GenderDimension>;
  addPreset(preset: { name: string; dims: string[] }): Promise<GenderPreset>;
  setDimensionHidden(key: string, hidden: boolean): Promise<void>;
}

export function makeDimensionsArea(driver: SqliteDriver): DimensionsArea {
  return {
    async getDimensions() {
      const rows = await driver.query<{
        key: string;
        name: string;
        low_label: string;
        high_label: string;
        min_value: number;
        max_value: number;
        is_built_in: number;
        hidden: number;
      }>('SELECT key, name, low_label, high_label, min_value, max_value, is_built_in, hidden FROM gender_dimension ORDER BY id');
      return rows.map((r) => ({
        key: r.key,
        name: r.name,
        low: r.low_label,
        high: r.high_label,
        min: r.min_value,
        max: r.max_value,
        builtIn: bool(r.is_built_in),
        hidden: bool(r.hidden)
      }));
    },

    async getPresets() {
      const presets = await driver.query<{ id: number; uuid: string | null; key: string | null; name: string; is_built_in: number }>(
        'SELECT id, uuid, key, name, is_built_in FROM gender_preset ORDER BY id'
      );
      const links = await driver.query<{ preset_id: number; key: string }>(
        `SELECT pd.preset_id, gd.key FROM preset_dimension pd
         JOIN gender_dimension gd ON gd.id = pd.dimension_id
         ORDER BY pd.order_index, gd.id`
      );
      return presets.map((p) => ({
        id: domainIdOf(p, 'preset'),
        name: p.name,
        builtIn: bool(p.is_built_in),
        dims: links.filter((l) => l.preset_id === p.id).map((l) => l.key)
      }));
    },

    async addCustomDimension(dim) {
      // The minted uuid doubles as the key: gender_dimension.key is NOT
      // NULL for built-ins' sake, and one identity is enough for a custom.
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO gender_dimension (uuid, key, name, low_label, high_label, min_value, max_value, is_built_in, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [uuid, uuid, dim.name, dim.low, dim.high, dim.min, dim.max, now()]
      );
      return { ...dim, key: uuid, builtIn: false, hidden: false };
    },

    async addPreset(preset) {
      const uuid = mintUuid();
      await driver.transaction(async () => {
        await driver.run('INSERT INTO gender_preset (uuid, name, is_built_in, updated_at) VALUES (?, ?, 0, ?)', [
          uuid,
          preset.name,
          now()
        ]);
        for (const [orderIndex, dimKey] of preset.dims.entries()) {
          const result = await driver.run(
            `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
             SELECT gp.id, gd.id, ? FROM gender_preset gp, gender_dimension gd WHERE gp.uuid = ? AND gd.key = ?`,
            [orderIndex, uuid, dimKey]
          );
          assertChanged(result, `dimension: ${dimKey}`);
        }
      });
      return { id: uuid, name: preset.name, builtIn: false, dims: [...preset.dims] };
    },

    async setDimensionHidden(key, hidden) {
      const result = await driver.run('UPDATE gender_dimension SET hidden = ?, updated_at = ? WHERE key = ?', [
        hidden ? 1 : 0,
        now(),
        key
      ]);
      assertChanged(result, `dimension: ${key}`);
    }
  };
}
