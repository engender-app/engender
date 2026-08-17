/* The regimen episode area (phase 4 ticket 01, CONTEXT: "Regimen episode").
   Greenfield: uuid-only identity (ADR-0002) - a regimen episode has no
   built-in counterpart to key by, unlike tags or gender dimensions.
   Episodes hide, they never delete (CONTEXT: "Hidden"): every entry,
   photo, measurement and lab result attributed to one by timestamp
   (regimenEpisode.ts) must keep resolving to it. */

import type { SqliteDriver } from '../sqlite/driver';
import type { RegimenEpisode } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

export type RegimenEpisodeInput = Omit<RegimenEpisode, 'id' | 'hidden'> & { id?: string };

export interface RegimenArea {
  /** Ordered by start day, ties broken by insertion order - the order
      resolveEpisodeAt (regimenEpisode.ts) requires. Includes hidden
      episodes: hiding removes one from a picker, not from history. */
  getEpisodes(): Promise<RegimenEpisode[]>;
  /** Returns the episode's id. Updating an unknown id throws. */
  upsertEpisode(input: RegimenEpisodeInput): Promise<string>;
  /** Idempotent-in-effect: setting the same value twice is not an error.
      Unlike a tag or dimension, an episode has no built-in form, so this
      is the only way an episode leaves the picker downstream tickets
      offer for new records - there is no delete. */
  setEpisodeHidden(id: string, hidden: boolean): Promise<void>;
}

type EpisodeRow = {
  uuid: string;
  drug: string;
  ester: string | null;
  dose: number;
  dose_unit: string;
  route: string;
  interval: string;
  start_epoch_day: number;
  hidden: number;
};

const toEpisode = (row: EpisodeRow): RegimenEpisode => ({
  id: row.uuid,
  drug: row.drug,
  ester: row.ester,
  dose: row.dose,
  doseUnit: row.dose_unit,
  route: row.route,
  interval: row.interval,
  startEpochDay: row.start_epoch_day,
  hidden: bool(row.hidden)
});

export function makeRegimenArea(driver: SqliteDriver): RegimenArea {
  const getEpisodes = async (): Promise<RegimenEpisode[]> => {
    const rows = await driver.query<EpisodeRow>(
      `SELECT uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, hidden
       FROM regimen_episode ORDER BY start_epoch_day, id`
    );
    return rows.map(toEpisode);
  };

  return {
    getEpisodes,

    async upsertEpisode(input) {
      if (input.id) {
        const result = await driver.run(
          `UPDATE regimen_episode
             SET drug = ?, ester = ?, dose = ?, dose_unit = ?, route = ?, interval = ?, start_epoch_day = ?,
                 updated_at = ?
           WHERE uuid = ?`,
          [input.drug, input.ester, input.dose, input.doseUnit, input.route, input.interval, input.startEpochDay, now(), input.id]
        );
        assertChanged(result, `regimen episode: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO regimen_episode (uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, input.drug, input.ester, input.dose, input.doseUnit, input.route, input.interval, input.startEpochDay, now()]
      );
      return uuid;
    },

    async setEpisodeHidden(id, hidden) {
      const result = await driver.run('UPDATE regimen_episode SET hidden = ?, updated_at = ? WHERE uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id
      ]);
      assertChanged(result, `regimen episode: ${id}`);
    }
  };
}
