/* Keep one first-noticed row per effect. Updating the date replaces it.
   Resolve the regimen anchor on read. A hidden effect key still round-trips
   in records. Only the picker removes it from offers. */

import type { SqliteDriver } from '../sqlite/driver';
import type { EffectDirection, PersonalEffect, PersonalEffectCatalogEntry, PersonalEffectType } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

interface PersonalEffectInput {
  effect: PersonalEffectType;
  firstNoticedEpochDay: number;
}

export interface PersonalEffectsArea {
  /** Whatever effects have been marked so far, one row per effect. No row
      for an effect means it has not been marked yet. */
  getMarkers(): Promise<PersonalEffect[]>;
  /** The markers whose "first noticed" day is this one. A marker is one row per effect that a fresh date replaces
      in place, so this reads as "what someone said they first noticed
      today", never as a log of sightings. */
  getMarkersFirstNoticedOn(epochDay: number): Promise<PersonalEffect[]>;
  /** The most recent "first noticed" day across every marked effect, at or before
      `todayEpochDay`, or null if nothing is marked yet (lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** One row per effect (schema.ts): a second call for an effect
      already marked replaces its date rather than adding a row. Returns
      the row's id. */
  upsertMarker(input: PersonalEffectInput): Promise<string>;
  /** Un-marks an effect - the undo for a mistaken date. Idempotent. */
  clearMarker(effect: PersonalEffectType): Promise<void>;

  /** Every catalogue entry, built-in and custom alike, hidden ones
      included - what the settings screen manages. Built-in first
      (insertion order), then customs in the order they were added. */
  getEffectTypes(): Promise<PersonalEffectCatalogEntry[]>;
  /** The minted uuid doubles as the key. `categoryKey`
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
  direction: EffectDirection | null;
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
      // The schema carries no CHECK enumerating a valid
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

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(first_noticed_epoch_day) AS day FROM personal_effect WHERE first_noticed_epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
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
