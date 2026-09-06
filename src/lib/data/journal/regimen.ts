/* The regimen episode area (phase 4 ticket 01, widened to concurrent,
   explicitly-ended episodes by phase 5 ticket 38; CONTEXT: "Regimen
   episode"). Greenfield: uuid-only identity (ADR-0002) - a regimen episode
   has no built-in counterpart to key by, unlike tags or gender dimensions.
   Episodes are never deleted: every entry, photo, measurement and lab
   result attributed to one by timestamp (regimenEpisode.ts) must keep
   resolving to it. */

import type { SqliteDriver } from '../sqlite/driver';
import type { EpisodeEndReason, RegimenEpisode } from '../types';
import { assertChanged, mintUuid, now } from './support';

type RegimenEpisodeInput = Omit<RegimenEpisode, 'id'> & { id?: string };

export interface RegimenArea {
  /** Ordered by start day, ties broken by insertion order - the order
      earliestEpisode (regimenEpisode.ts) requires. */
  getEpisodes(): Promise<RegimenEpisode[]>;
  /** Returns the episode's id. Updating an unknown id throws. Carries
      `endEpochDay` through like any other field - a straight edit of an
      episode's dated range, not the "end this episode" action below - and
      `endReason` the same way, except that a null `endEpochDay` forces it
      back to null regardless of what is passed (ticket 43): a reason with
      no end day is meaningless, so reopening an episode this way drops
      whatever reason it carried. */
  upsertEpisode(input: RegimenEpisodeInput): Promise<string>;
  /** Sets an episode's explicit end day (phase 5 ticket 38) - the "end this
      episode" action, independent of any other episode starting. Updating
      an unknown id throws. `endReason` is optional and defaults to null
      (ticket 43): ending an episode with no reason chosen stays valid. */
  endEpisode(id: string, endEpochDay: number, endReason?: EpisodeEndReason | null): Promise<void>;
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
  end_epoch_day: number | null;
  end_reason: string | null;
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
  endEpochDay: row.end_epoch_day,
  endReason: row.end_reason as EpisodeEndReason | null
});

export function makeRegimenArea(driver: SqliteDriver): RegimenArea {
  const getEpisodes = async (): Promise<RegimenEpisode[]> => {
    const rows = await driver.query<EpisodeRow>(
      `SELECT uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, end_epoch_day, end_reason
       FROM regimen_episode ORDER BY start_epoch_day, id`
    );
    return rows.map(toEpisode);
  };

  return {
    getEpisodes,

    async upsertEpisode(input) {
      // A reason with no end day is meaningless (ticket 43), so this is
      // the one place the invariant is enforced regardless of what a
      // caller passes - the same reason endEpisode below never trusts a
      // caller to have cleared it either.
      const endReason = input.endEpochDay === null ? null : input.endReason;
      if (input.id) {
        const result = await driver.run(
          `UPDATE regimen_episode
             SET drug = ?, ester = ?, dose = ?, dose_unit = ?, route = ?, interval = ?, start_epoch_day = ?,
                 end_epoch_day = ?, end_reason = ?, updated_at = ?
           WHERE uuid = ?`,
          [
            input.drug,
            input.ester,
            input.dose,
            input.doseUnit,
            input.route,
            input.interval,
            input.startEpochDay,
            input.endEpochDay,
            endReason,
            now(),
            input.id
          ]
        );
        assertChanged(result, `regimen episode: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO regimen_episode (uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, end_epoch_day, end_reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          input.drug,
          input.ester,
          input.dose,
          input.doseUnit,
          input.route,
          input.interval,
          input.startEpochDay,
          input.endEpochDay,
          endReason,
          now()
        ]
      );
      return uuid;
    },

    async endEpisode(id, endEpochDay, endReason = null) {
      const result = await driver.run(
        'UPDATE regimen_episode SET end_epoch_day = ?, end_reason = ?, updated_at = ? WHERE uuid = ?',
        [endEpochDay, endReason, now(), id]
      );
      assertChanged(result, `regimen episode: ${id}`);
    }
  };
}
