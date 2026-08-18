/* The dose log area (phase 4 ticket 02, CONTEXT: "Dose event"). Three row
   types that are always read together: the doses themselves, the schedule an
   episode expects them on, and the pauses during which it expects none.

   A dose event is its own record type, not an Entry, and it stores no
   regimen episode. Attribution is resolveEpisodeAt(episodes, timestamp)
   above this seam (regimenEpisode.ts), which is what makes backdating a
   dose re-resolve rather than carry a stale link.

   Nothing here judges adherence. The comparison is assembled from
   expectedSlots and adherence (doseSchedule.ts) over what these reads
   return; this module only knows rows. */

import type { SqliteDriver } from '../sqlite/driver';
import type { DoseEvent, DosePause, DoseRoute, DoseSchedule, DoseStatus, InjectionVehicle, ScheduledDose } from '../types';
import { isInjectionDose, isTopicalDose, type ApplicationSiteKey, type InjectionSiteKey } from '../doseSchedule';
import { startOfDayTimestamp } from '../epochDay';
import { assertChanged, mintUuid, now } from './support';

interface DoseInputFields {
  id?: string;
  timestamp: number;
  dose: number;
  doseUnit: string;
  /** Defaults to `taken`. */
  status?: DoseStatus;
  /** `changed` doses only. */
  scheduled?: ScheduledDose | null;
}

/** A dose to write. Arms mirror the domain union (types.ts), so passing a
    site for an oral dose is a type error and a route change on an update
    drops whatever the new route does not have.

    Stricter than what comes back out, deliberately: a write must name a site
    the pickers actually offer, while a read admits that a row imported from
    another build might not (DoseEvent). Spelled out arm by arm rather than
    derived from DoseEvent, because deriving it would have inherited that
    nullability and let a new dose be saved with no site at all. */
export type DoseEventInput =
  | (DoseInputFields & { route: 'oral' | 'sublingual' })
  | (DoseInputFields & { route: 'im' | 'sc'; injectionSite: InjectionSiteKey; vehicle: InjectionVehicle })
  | (DoseInputFields & { route: 'patch' | 'gel'; applicationSite: ApplicationSiteKey });

export interface DoseScheduleInput {
  episodeId: string;
  everyNDays: number;
  dosesPerDay: number;
}

export type DosePauseInput = Omit<DosePause, 'id'> & { id?: string };

export interface DosesArea {
  /** Every dose whose timestamp falls on a day in `[fromEpochDay,
      toEpochDay]`, oldest first. Bounded by day rather than unbounded
      because every caller has a range: the log shows recent doses, the
      adherence view a schedule's window. */
  getDoses(fromEpochDay: number, toEpochDay: number): Promise<DoseEvent[]>;
  /** Returns the dose's id. Updating an unknown id throws. */
  upsertDose(input: DoseEventInput): Promise<string>;
  /** Deleting an unknown id throws. A dose is a logged event like a lab
      result, so it deletes; nothing else is attributed to one. */
  deleteDose(id: string): Promise<void>;
  /** Every episode's schedule. Small enough to read whole - one row per
      episode, and the adherence view needs the episode's alongside it. */
  getSchedules(): Promise<DoseSchedule[]>;
  /** One schedule per episode: writing a second replaces the first.
      Refuses an unknown episode. No delete: an episode's rhythm is edited,
      and an episode that should expect nothing gets a pause instead. */
  upsertSchedule(input: DoseScheduleInput): Promise<string>;
  /** Every pause, oldest start first. Refuses an unknown episode on write. */
  getPauses(): Promise<DosePause[]>;
  upsertPause(input: DosePauseInput): Promise<string>;
  deletePause(id: string): Promise<void>;
}

type DoseRow = {
  uuid: string;
  timestamp: number;
  route: string;
  dose: number;
  dose_unit: string;
  injection_site: string | null;
  vehicle: string | null;
  application_site: string | null;
  status: string;
  scheduled_dose: number | null;
  scheduled_route: string | null;
  scheduled_timestamp: number | null;
};

const scheduledOf = (row: DoseRow): ScheduledDose | null =>
  row.scheduled_dose === null || row.scheduled_route === null || row.scheduled_timestamp === null
    ? null
    : { dose: row.scheduled_dose, route: row.scheduled_route as DoseRoute, timestamp: row.scheduled_timestamp };

/** Row to domain union. The nullable columns collapse into the arm the
    route names, so an oral dose comes out without a site key rather than
    with a null one - the union's whole point (types.ts). */
export function toDoseEvent(row: DoseRow): DoseEvent {
  const common = {
    id: row.uuid,
    timestamp: row.timestamp,
    dose: row.dose,
    doseUnit: row.dose_unit,
    status: row.status as DoseStatus,
    scheduled: scheduledOf(row)
  };
  const route = row.route as DoseRoute;

  /* A direct comparison rather than isInjectionDose: there is no record to
     narrow yet, this is the code building one.

     The columns are passed through as stored, never defaulted. A null vehicle
     read back as "oil" would be this module inventing a fact about someone's
     medication, and the whole point of a `changed` dose is that what was
     actually used is what gets recorded. */
  if (route === 'im' || route === 'sc') {
    return {
      ...common,
      route,
      injectionSite: row.injection_site,
      vehicle: row.vehicle as InjectionVehicle | null
    };
  }
  if (route === 'patch' || route === 'gel') {
    return { ...common, route, applicationSite: row.application_site };
  }
  return { ...common, route };
}

/** The columns a dose's route does and does not fill. Written from the
    input's own arm, so a dose edited from IM to oral loses its site and
    vehicle instead of keeping ones the new route has no meaning for. */
function routeColumns(input: DoseEventInput): {
  injectionSite: string | null;
  vehicle: string | null;
  applicationSite: string | null;
} {
  if (isInjectionDose(input)) {
    return { injectionSite: input.injectionSite, vehicle: input.vehicle, applicationSite: null };
  }
  if (isTopicalDose(input)) {
    return { injectionSite: null, vehicle: null, applicationSite: input.applicationSite };
  }
  return { injectionSite: null, vehicle: null, applicationSite: null };
}

const DOSE_COLUMNS = `uuid, timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
                      status, scheduled_dose, scheduled_route, scheduled_timestamp`;

export function makeDosesArea(driver: SqliteDriver): DosesArea {
  /** An episode's rowid, by its travelling uuid. Refused here rather than
      at the foreign key, and worded the way the regimen area words it, so a
      bad episode id reads the same whichever seam caught it. */
  const episodeRowid = async (episodeId: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM regimen_episode WHERE uuid = ?', [episodeId]);
    if (rows.length === 0) throw new Error(`unknown regimen episode: ${episodeId}`);
    return rows[0].id;
  };

  return {
    async getDoses(fromEpochDay, toEpochDay) {
      const rows = await driver.query<DoseRow>(
        /* Bounded by the next day's local midnight rather than by an end-of-day
           timestamp: local midnight is what startOfDayTimestamp knows how to
           find across a DST transition, so an exclusive upper bound needs no
           second notion of when a day ends. */
        `SELECT ${DOSE_COLUMNS} FROM dose_event
          WHERE timestamp >= ? AND timestamp < ?
          ORDER BY timestamp, id`,
        [startOfDayTimestamp(fromEpochDay), startOfDayTimestamp(toEpochDay + 1)]
      );
      return rows.map(toDoseEvent);
    },

    async upsertDose(input) {
      const { injectionSite, vehicle, applicationSite } = routeColumns(input);
      const status = input.status ?? 'taken';
      const scheduled = input.scheduled ?? null;
      const values = [
        input.timestamp,
        input.route,
        input.dose,
        input.doseUnit,
        injectionSite,
        vehicle,
        applicationSite,
        status,
        scheduled?.dose ?? null,
        scheduled?.route ?? null,
        scheduled?.timestamp ?? null,
        now()
      ];

      if (input.id) {
        const result = await driver.run(
          `UPDATE dose_event
              SET timestamp = ?, route = ?, dose = ?, dose_unit = ?, injection_site = ?, vehicle = ?,
                  application_site = ?, status = ?, scheduled_dose = ?, scheduled_route = ?,
                  scheduled_timestamp = ?, updated_at = ?
            WHERE uuid = ?`,
          [...values, input.id]
        );
        assertChanged(result, `dose event: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO dose_event (timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
                                 status, scheduled_dose, scheduled_route, scheduled_timestamp, updated_at, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, uuid]
      );
      return uuid;
    },

    async deleteDose(id) {
      const result = await driver.run('DELETE FROM dose_event WHERE uuid = ?', [id]);
      assertChanged(result, `dose event: ${id}`);
    },

    async getSchedules() {
      const rows = await driver.query<{
        uuid: string;
        episode_uuid: string;
        every_n_days: number;
        doses_per_day: number;
      }>(
        `SELECT s.uuid, e.uuid AS episode_uuid, s.every_n_days, s.doses_per_day
           FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id
          ORDER BY s.id`
      );
      return rows.map((row) => ({
        id: row.uuid,
        episodeId: row.episode_uuid,
        everyNDays: row.every_n_days,
        dosesPerDay: row.doses_per_day
      }));
    },

    /* An upsert on the episode, not on a schedule id: the caller is saying
       "this episode's rhythm is X", and which row happens to hold that is
       not something a screen should have to track. */
    async upsertSchedule(input) {
      const episodeId = await episodeRowid(input.episodeId);
      const existing = await driver.query<{ uuid: string }>('SELECT uuid FROM dose_schedule WHERE episode_id = ?', [
        episodeId
      ]);

      if (existing.length > 0) {
        await driver.run(
          'UPDATE dose_schedule SET every_n_days = ?, doses_per_day = ?, updated_at = ? WHERE episode_id = ?',
          [input.everyNDays, input.dosesPerDay, now(), episodeId]
        );
        return existing[0].uuid;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO dose_schedule (uuid, episode_id, every_n_days, doses_per_day, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, episodeId, input.everyNDays, input.dosesPerDay, now()]
      );
      return uuid;
    },

    async getPauses() {
      const rows = await driver.query<{
        uuid: string;
        episode_uuid: string;
        start_epoch_day: number;
        end_epoch_day: number | null;
        reason: string;
      }>(
        `SELECT p.uuid, e.uuid AS episode_uuid, p.start_epoch_day, p.end_epoch_day, p.reason
           FROM dose_pause p JOIN regimen_episode e ON e.id = p.episode_id
          ORDER BY p.start_epoch_day, p.id`
      );
      return rows.map((row) => ({
        id: row.uuid,
        episodeId: row.episode_uuid,
        startEpochDay: row.start_epoch_day,
        endEpochDay: row.end_epoch_day,
        reason: row.reason as DosePause['reason']
      }));
    },

    async upsertPause(input) {
      const episodeId = await episodeRowid(input.episodeId);
      const values = [input.startEpochDay, input.endEpochDay, input.reason, now()];

      if (input.id) {
        const result = await driver.run(
          `UPDATE dose_pause SET start_epoch_day = ?, end_epoch_day = ?, reason = ?, updated_at = ?, episode_id = ?
            WHERE uuid = ?`,
          [...values, episodeId, input.id]
        );
        assertChanged(result, `dose pause: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO dose_pause (uuid, episode_id, start_epoch_day, end_epoch_day, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid, episodeId, ...values]
      );
      return uuid;
    },

    async deletePause(id) {
      const result = await driver.run('DELETE FROM dose_pause WHERE uuid = ?', [id]);
      assertChanged(result, `dose pause: ${id}`);
    }
  };
}
