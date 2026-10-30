/* The regimen episode area (phase 4 ticket 01, widened to concurrent,
   explicitly-ended episodes by phase 5 ticket 38; CONTEXT: "Regimen
   episode"). Greenfield: uuid-only identity (ADR-0002) - a regimen episode
   has no built-in counterpart to key by, unlike tags or gender dimensions.
   Episodes are never deleted: every entry, photo, measurement and lab
   result attributed to one by timestamp (regimenEpisode.ts) must keep
   resolving to it.

   A mistaken or duplicate episode is put away instead (after-release 07,
   the write phase 4 ticket 01 promised): `setEpisodeHidden` is the only
   such write, and `getEpisodes` is the one read every surface draws the
   history from, so leaving a hidden row out there takes it out of Care,
   the curve, dose attribution and the clinician summary at once. The
   regimen screen asks `getHiddenEpisodes` for the way back. */

import { inferDrugClass, toDrugClass } from '../drugClass';
import { assertSpanOrdered } from '../span';
import type { SqliteDriver } from '../sqlite/driver';
import type { DrugClass, EpisodeEndReason, RegimenEpisode } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';
import { syncDoseReminders } from './doseReminders';
import { todayEpochDay } from '../epochDay';

/** `drugClass` is optional on the way in (functional audit ticket 18): a new
    episode without one starts as whatever its drug infers to, and an update
    without one keeps the class already stored, so no writer that predates
    the field can reset a class the person chose. */
type RegimenEpisodeInput = Omit<RegimenEpisode, 'id' | 'drugClass'> & { id?: string; drugClass?: DrugClass };

export interface RegimenArea {
  /** Ordered by start day, ties broken by insertion order - the order
      hrtAnchor (personalEffectWindow.ts) requires. Hidden episodes are left
      out. */
  getEpisodes(): Promise<RegimenEpisode[]>;
  /** Only the hidden ones, in the same order: what the regimen screen
      offers to show again. */
  getHiddenEpisodes(): Promise<RegimenEpisode[]>;
  /** Whether any episode is stored and not hidden, running or ended. One
      `EXISTS`, for the surface that only asks whether a regimen was ever
      started (Home's Getting started row). */
  hasAny(): Promise<boolean>;
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
  /** Puts an episode away, or brings it back. Hiding an unknown id throws. */
  setEpisodeHidden(id: string, hidden: boolean): Promise<void>;
}

type EpisodeRow = {
  uuid: string;
  drug: string;
  drug_class: string;
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
  drugClass: toDrugClass(row.drug_class),
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
  const episodesWhere = async (hidden: boolean): Promise<RegimenEpisode[]> => {
    const rows = await driver.query<EpisodeRow>(
      `SELECT uuid, drug, drug_class, ester, dose, dose_unit, route, interval, start_epoch_day, end_epoch_day, end_reason
       FROM regimen_episode WHERE hidden = ? ORDER BY start_epoch_day, id`,
      [hidden ? 1 : 0]
    );
    return rows.map(toEpisode);
  };

  return {
    getEpisodes: () => episodesWhere(false),

    getHiddenEpisodes: () => episodesWhere(true),

    async hasAny() {
      const rows = await driver.query<{ found: number }>(
        'SELECT EXISTS(SELECT 1 FROM regimen_episode WHERE hidden = 0) AS found'
      );
      return bool(rows[0].found);
    },

    async upsertEpisode(input) {
      assertSpanOrdered(input);
      // A reason with no end day is meaningless (ticket 43), so this is
      // the one place the invariant is enforced regardless of what a
      // caller passes - the same reason endEpisode below never trusts a
      // caller to have cleared it either.
      const endReason = input.endEpochDay === null ? null : input.endReason;
      /* The episode and its schedule's reminders in one transaction: a drug
         renamed, a start moved or an end day typed in all change what those
         reminders say (functional audit ticket 21). */
      return driver.transaction(async (driver) => {
        if (input.id) {
          const result = await driver.run(
            `UPDATE regimen_episode
               SET drug = ?, drug_class = COALESCE(?, drug_class), ester = ?, dose = ?, dose_unit = ?, route = ?, interval = ?, start_epoch_day = ?,
                   end_epoch_day = ?, end_reason = ?, updated_at = ?
             WHERE uuid = ?`,
            [
              input.drug,
              input.drugClass ?? null,
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
          await syncDoseReminders(driver, todayEpochDay());
          return input.id;
        }
        const uuid = mintUuid();
        await driver.run(
          `INSERT INTO regimen_episode (uuid, drug, drug_class, ester, dose, dose_unit, route, interval, start_epoch_day, end_epoch_day, end_reason, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid,
            input.drug,
            input.drugClass ?? inferDrugClass(input.drug),
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
      });
    },

    async endEpisode(id, endEpochDay, endReason = null) {
      await driver.transaction(async (driver) => {
        const [episode] = await driver.query<{ start_epoch_day: number }>(
          'SELECT start_epoch_day FROM regimen_episode WHERE uuid = ?', [id]
        );
        if (!episode) throw new Error(`unknown regimen episode: ${id}`);
        assertSpanOrdered({ startEpochDay: episode.start_epoch_day, endEpochDay });
        const result = await driver.run(
          'UPDATE regimen_episode SET end_epoch_day = ?, end_reason = ?, updated_at = ? WHERE uuid = ?',
          [endEpochDay, endReason, now(), id]
        );
        assertChanged(result, `regimen episode: ${id}`);
        await syncDoseReminders(driver, todayEpochDay());
      });
    },

    /* Hiding takes the schedule's reminders with it (ticket 21). Showing
       the episode again does not bring them back: their times went with
       them, and the schedule's own switch is the way back. */
    async setEpisodeHidden(id, hidden) {
      await driver.transaction(async (driver) => {
        const result = await driver.run('UPDATE regimen_episode SET hidden = ?, updated_at = ? WHERE uuid = ?', [
          hidden ? 1 : 0,
          now(),
          id
        ]);
        assertChanged(result, `regimen episode: ${id}`);
        await syncDoseReminders(driver, todayEpochDay());
      });
    }
  };
}
