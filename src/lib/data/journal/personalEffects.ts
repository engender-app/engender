/* The personal effects timeline area (phase 4 ticket 07). One row per
   effect (migrations.ts v12, `effect` UNIQUE), matched exactly the way
   medication_stock is matched by drug (stock.ts): a person is always
   answering "when did I first notice this", never logging a series of
   sightings, so a fresh date replaces the old one in place. No episode
   reference: what a marker is read against - the earliest regimen
   episode's start day - is resolved above this seam
   (regimenEpisode.ts's earliestEpisode), not stored here.

   Phase 5 ticket 41 widens the effect a marker names from a closed
   eight-key union to `personal_effect_type`, an open reference-data
   vocabulary - the same move measurements.ts made for `measurement_type`
   (phase 5 ticket 29), and this file bundles the two concerns the same
   way that one does: marker values above, the vocabulary the `effect`
   column is matched against below. Nothing here validates a marker's
   `effect` against that vocabulary - the same free-text-but-matched-by-key
   treatment measurement.type gets after v34 - so a marker logged under a
   type since hidden still round-trips exactly as logged; only the picker
   stops offering it. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PersonalEffect, PersonalEffectCatalogEntry, PersonalEffectType } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

export interface PersonalEffectInput {
  effect: PersonalEffectType;
  firstNoticedEpochDay: number;
}

export interface PersonalEffectsArea {
  /** Whatever effects have been marked so far, one row per effect. No row
      for an effect means it has not been marked yet. */
  getMarkers(): Promise<PersonalEffect[]>;
  /** The markers whose "first noticed" day is this one (phase 5 deepening
      ticket 21). A marker is one row per effect that a fresh date replaces
      in place, so this reads as "what someone said they first noticed
      today", never as a log of sightings. */
  getMarkersFirstNoticedOn(epochDay: number): Promise<PersonalEffect[]>;
  /** One row per effect (migrations.ts v12): a second call for an effect
      already marked replaces its date rather than adding a row. Returns
      the row's id. */
  upsertMarker(input: PersonalEffectInput): Promise<string>;
  /** Un-marks an effect - the undo for a mistaken date. Idempotent. */
  clearMarker(effect: PersonalEffectType): Promise<void>;

  /** Every catalogue entry, built-in and custom alike, hidden ones
      included - what the settings screen manages. Built-in first
      (insertion order), then customs in the order they were added. */
  getEffectTypes(): Promise<PersonalEffectCatalogEntry[]>;
  /** The minted uuid doubles as the key, exactly
      addCustomMeasurementType's pattern (measurements.ts). `categoryKey`
      is optional - a custom effect may be left uncategorised. */
  addCustomEffectType(name: string, categoryKey?: string | null): Promise<PersonalEffectCatalogEntry>;
  /** Built-in and custom alike hide, never delete (CONTEXT: "Hidden") -
      a marker already recorded against a hidden effect survives and
      still shows on the timeline, it is only the picker that stops
      offering the effect. */
  setEffectTypeHidden(key: string, hidden: boolean): Promise<void>;
}

type PersonalEffectRow = {
  uuid: string;
  effect: PersonalEffectType;
  first_noticed_epoch_day: number;
};

type PersonalEffectTypeRow = {
  uuid: string | null;
  key: string;
  name: string;
  is_built_in: number;
  category_key: string | null;
  direction: 'feminizing' | 'masculinizing' | null;
  hidden: number;
};

const toPersonalEffect = (row: PersonalEffectRow): PersonalEffect => ({
  id: row.uuid,
  effect: row.effect,
  firstNoticedEpochDay: row.first_noticed_epoch_day
});

const toPersonalEffectType = (row: PersonalEffectTypeRow): PersonalEffectCatalogEntry => ({
  key: row.key,
  name: row.name,
  builtIn: bool(row.is_built_in),
  hidden: bool(row.hidden),
  categoryKey: row.category_key,
  direction: row.direction
});

export function makePersonalEffectsArea(driver: SqliteDriver): PersonalEffectsArea {
  return {
    async getMarkers() {
      const rows = await driver.query<PersonalEffectRow>(
        'SELECT uuid, effect, first_noticed_epoch_day FROM personal_effect ORDER BY effect'
      );
      return rows.map(toPersonalEffect);
    },

    async getMarkersFirstNoticedOn(epochDay) {
      const rows = await driver.query<PersonalEffectRow>(
        'SELECT uuid, effect, first_noticed_epoch_day FROM personal_effect WHERE first_noticed_epoch_day = ? ORDER BY effect',
        [epochDay]
      );
      return rows.map(toPersonalEffect);
    },

    async upsertMarker(input) {
      // migrations.ts v37 dropped the CHECK that used to enumerate a valid
      // effect; this is that validation's replacement, reading the open
      // catalogue instead of a hardcoded union. A hidden effect still
      // validates - hiding removes it from the picker, not from what a
      // marker may name (CONTEXT: "Hidden").
      const known = await driver.query<{ key: string }>('SELECT key FROM personal_effect_type WHERE key = ?', [
        input.effect
      ]);
      if (known.length === 0) throw new Error(`unknown personal effect type: ${input.effect}`);

      const existing = await driver.query<{ uuid: string }>('SELECT uuid FROM personal_effect WHERE effect = ?', [
        input.effect
      ]);

      if (existing.length > 0) {
        await driver.run('UPDATE personal_effect SET first_noticed_epoch_day = ?, updated_at = ? WHERE effect = ?', [
          input.firstNoticedEpochDay,
          now(),
          input.effect
        ]);
        return existing[0].uuid;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES (?, ?, ?, ?)',
        [uuid, input.effect, input.firstNoticedEpochDay, now()]
      );
      return uuid;
    },

    async clearMarker(effect) {
      await driver.run('DELETE FROM personal_effect WHERE effect = ?', [effect]);
    },

    async getEffectTypes() {
      const rows = await driver.query<PersonalEffectTypeRow>(
        'SELECT uuid, key, name, is_built_in, category_key, direction, hidden FROM personal_effect_type ORDER BY id'
      );
      return rows.map(toPersonalEffectType);
    },

    async addCustomEffectType(name, categoryKey = null) {
      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO personal_effect_type (uuid, key, name, is_built_in, category_key, direction, updated_at) VALUES (?, ?, ?, 0, ?, NULL, ?)',
        [uuid, uuid, name, categoryKey, now()]
      );
      return { key: uuid, name, builtIn: false, hidden: false, categoryKey, direction: null };
    },

    async setEffectTypeHidden(key, hidden) {
      const result = await driver.run('UPDATE personal_effect_type SET hidden = ?, updated_at = ? WHERE key = ?', [
        hidden ? 1 : 0,
        now(),
        key
      ]);
      assertChanged(result, `personal effect type: ${key}`);
    }
  };
}
