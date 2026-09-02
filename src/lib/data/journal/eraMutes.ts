/* Era mutes (phase 6 ticket 05, ADR-0049, CONTEXT: "Resurfacing consent"):
   which of the person's eras are muted from resurfacing. Rows only, keyed by
   era uuid - whether a day the row names is what a resurfacing surface is
   about to show is resurfacingConsent.ts's pure question, read from here by
   every surface that needs it, the same split eras.ts/journal/eras.ts
   already draws.

   `era_uuid` names an era by free text rather than by a foreign key
   (migrations.ts's SCHEMA_V51). A mute naming an era that later gets deleted
   is left exactly where it is: nothing here resolves it against `era`, so
   there is nothing to cascade and no cleanup job to run. It simply stops
   matching anything eraForDay can still return - the same resting state a
   day in no era already has (ADR-0049). */

import type { SqliteDriver } from '../sqlite/driver';
import { now } from './support';

export interface EraMutesArea {
  /** Every currently muted era's uuid. A uuid naming a since-deleted era can
      sit in here forever without harm - see the module comment. */
  getMutedEraUuids(): Promise<Set<string>>;
  /** Idempotent both ways: muting an already-muted era or unmuting an
      already-unmuted one changes nothing observable. Unmuting deletes the
      row rather than storing a false - presence is the whole of the state,
      the same shape roadmap.ts's setGoalStatus gives an unchecked goal. */
  setEraMuted(eraUuid: string, muted: boolean): Promise<void>;
}

export function makeEraMutesArea(driver: SqliteDriver): EraMutesArea {
  return {
    async getMutedEraUuids() {
      const rows = await driver.query<{ era_uuid: string }>('SELECT era_uuid FROM era_mute');
      return new Set(rows.map((row) => row.era_uuid));
    },

    async setEraMuted(eraUuid, muted) {
      if (!muted) {
        await driver.run('DELETE FROM era_mute WHERE era_uuid = ?', [eraUuid]);
        return;
      }
      await driver.run(
        `INSERT INTO era_mute (era_uuid, updated_at) VALUES (?, ?)
           ON CONFLICT (era_uuid) DO UPDATE SET updated_at = excluded.updated_at`,
        [eraUuid, now()]
      );
    }
  };
}
