/* The personal effects timeline area (phase 4 ticket 07). One row per
   fixed effect (migrations.ts v12, `effect` UNIQUE), matched exactly the
   way medication_stock is matched by drug (stock.ts): a person is always
   answering "when did I first notice this", never logging a series of
   sightings, so a fresh date replaces the old one in place. No episode
   reference: what a marker is read against - the earliest regimen
   episode's start day - is resolved above this seam
   (regimenEpisode.ts's earliestEpisodeStartEpochDay), not stored here. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PersonalEffect, PersonalEffectType } from '../types';
import { mintUuid, now } from './support';

export interface PersonalEffectInput {
  effect: PersonalEffectType;
  firstNoticedEpochDay: number;
}

export interface PersonalEffectsArea {
  /** Whatever effects have been marked so far - zero to four rows, one per
      effect. No row for an effect means it has not been marked yet. */
  getMarkers(): Promise<PersonalEffect[]>;
  /** One row per effect (migrations.ts v12): a second call for an effect
      already marked replaces its date rather than adding a row. Returns
      the row's id. */
  upsertMarker(input: PersonalEffectInput): Promise<string>;
  /** Un-marks an effect - the undo for a mistaken date. Idempotent. */
  clearMarker(effect: PersonalEffectType): Promise<void>;
}

type PersonalEffectRow = {
  uuid: string;
  effect: PersonalEffectType;
  first_noticed_epoch_day: number;
};

const toPersonalEffect = (row: PersonalEffectRow): PersonalEffect => ({
  id: row.uuid,
  effect: row.effect,
  firstNoticedEpochDay: row.first_noticed_epoch_day
});

export function makePersonalEffectsArea(driver: SqliteDriver): PersonalEffectsArea {
  return {
    async getMarkers() {
      const rows = await driver.query<PersonalEffectRow>(
        'SELECT uuid, effect, first_noticed_epoch_day FROM personal_effect ORDER BY effect'
      );
      return rows.map(toPersonalEffect);
    },

    async upsertMarker(input) {
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
    }
  };
}
