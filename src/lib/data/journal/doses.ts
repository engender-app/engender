/* The dose log area (phase 4 ticket 02, CONTEXT: "Dose event"). Three row
   types that are always read together: the doses themselves, the schedule an
   episode expects them on, and the pauses during which it expects none.

   A dose event is its own record type, not an Entry, and it stores no
   regimen episode. Attribution is attributeDose(episodes, dose) above this
   seam (regimenEpisode.ts), which is what makes backdating a dose
   re-resolve rather than carry a stale link - `drug` (phase 5 ticket 38)
   only ever breaks a tie that attribution could not resolve on its own.

   Nothing here judges adherence, and getComparison below does not either:
   the verdict-free comparison itself is expectedSlots and adherence
   (doseSchedule.ts), which stay pure above this seam. What this area owns is
   the assembly around them - which episode is in effect, its schedule, its
   pauses, and which doses are attributed to it - because that assembly is
   what the dose log screen and the long-journal benchmark each used to do
   their own way (phase 5 audit-deepening ticket 17). */

import type { SqliteDriver } from '../sqlite/driver';
import type {
  DoseEvent,
  DosePause,
  DoseRoute,
  DoseSchedule,
  DoseScheduleAmount,
  DoseScheduleRecurrence,
  DoseStatus,
  InjectionVehicle,
  RegimenEpisode,
  ScheduledDose
} from '../types';
import {
  adherence,
  expectedSlots,
  isInjectionDose,
  isTopicalDose,
  type Adherence,
  type ApplicationSiteKey,
  type InjectionSiteKey
} from '../doseSchedule';
import { startOfDayTimestamp } from '../epochDay';
import { activeEpisodesAt, attributeDose } from '../regimenEpisode';
import type { RegimenArea } from './regimen';
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
  /** Which drug this dose was, in its own words (phase 5 ticket 38).
      Defaults to null - needed only to break an attribution tie between
      concurrent episodes for different drugs. */
  drug?: string | null;
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
  recurrence: DoseScheduleRecurrence;
  dosesPerDay: number;
  doseAmounts: DoseScheduleAmount[] | null;
}

export type DosePauseInput = Omit<DosePause, 'id'> & { id?: string };

/** How the dose log sits against what the schedule expected over a range,
    or why there is nothing to compare - one value for what the dose log
    screen used to decide across five reads and four branches of markup
    (phase 5 audit-deepening ticket 17).

    A union rather than a record of nullable fields, so each answer carries
    exactly the rows that answer has: the "no schedule" notice names the
    drug it is about, and only the comparison itself carries a schedule. The
    reason is what a screen decides on, and it cannot forget a case.

    `multipleEpisodes` and `noEpisode` are kept apart because they read
    differently to someone holding the screen - one is an ambiguity to
    resolve, the other is nothing to compare against yet - which is the same
    distinction attributeDose draws for a single dose. One arm each rather
    than one arm holding both reasons: a caller narrowing on a single literal
    is left with `never` at the end of the chain, which is what makes
    forgetting a case a typecheck failure. */
export type DoseScheduleComparison =
  | { reason: 'multipleEpisodes' }
  | { reason: 'noEpisode' }
  | { reason: 'noSchedule'; activeEpisode: RegimenEpisode }
  | {
      reason: null;
      activeEpisode: RegimenEpisode;
      schedule: DoseSchedule;
      /** That episode's own pauses, which are also the ones the comparison
          filtered its slots by. ADR-0032's rule is untouched: a pause reaches
          adherence and nothing else. */
      pauses: DosePause[];
      comparison: Adherence;
    };

export interface DosesArea {
  /** Every dose whose timestamp falls on a day in `[fromEpochDay,
      toEpochDay]`, oldest first. Bounded by day rather than unbounded
      because every caller has a range: the log shows recent doses, the
      adherence view a schedule's window. */
  getDoses(fromEpochDay: number, toEpochDay: number): Promise<DoseEvent[]>;
  /** Returns the dose's id. Updating an unknown id throws. */
  upsertDose(input: DoseEventInput): Promise<string>;
  /** A dose is a logged event like a lab result, so it deletes rather than
      hides; nothing else is attributed to one. */
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
  /** A pause is a plain row: nothing is attributed to one, and adherence
      reads it rather than storing anything derived from it (ADR-0032). */
  deletePause(id: string): Promise<void>;
  /** The dose log over `[fromEpochDay, toEpochDay]` against what the
      schedule expected of it, assembled here rather than at the caller: the
      episode in effect, its schedule, its pauses, the doses attributed to it,
      and expectedSlots/adherence over those.

      Which episode counts as the one in effect is the last day of the range,
      because that is the day a reader is asking about - and since an episode
      is in effect for whole days (regimenEpisode.ts), asking on `toEpochDay`
      is the same question the screen asked with `Date.now()` while its range
      ended today.

      The slots are anchored on the episode's own start day, so an
      every-N-days rhythm belongs to the episode rather than shifting with
      the range. */
  getComparison(params: { fromEpochDay: number; toEpochDay: number }): Promise<DoseScheduleComparison>;
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
  drug: string | null;
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
    scheduled: scheduledOf(row),
    drug: row.drug
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
                      status, scheduled_dose, scheduled_route, scheduled_timestamp, drug`;

export function makeDosesArea(driver: SqliteDriver, regimen: RegimenArea): DosesArea {
  /** An episode's rowid, by its travelling uuid. Refused here rather than
      at the foreign key, and worded the way the regimen area words it, so a
      bad episode id reads the same whichever seam caught it. */
  const episodeRowid = async (episodeId: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM regimen_episode WHERE uuid = ?', [episodeId]);
    if (rows.length === 0) throw new Error(`unknown regimen episode: ${episodeId}`);
    return rows[0].id;
  };

  const weekdaysOf = async (scheduleRowId: number): Promise<number[]> => {
    const rows = await driver.query<{ weekday: number }>(
      'SELECT weekday FROM dose_schedule_weekday WHERE schedule_id = ? ORDER BY weekday',
      [scheduleRowId]
    );
    return rows.map((r) => r.weekday);
  };

  /** Null rather than `[]` for none set: an empty cycle would have nothing
      to index into, and this is the "no amount tracked" state every
      schedule before this field existed is in (types.ts). */
  const doseAmountsOf = async (scheduleRowId: number): Promise<DoseScheduleAmount[] | null> => {
    const rows = await driver.query<{ dose: number; dose_unit: string }>(
      'SELECT dose, dose_unit FROM dose_schedule_dose_amount WHERE schedule_id = ? ORDER BY position',
      [scheduleRowId]
    );
    return rows.length > 0 ? rows.map((r) => ({ dose: r.dose, doseUnit: r.dose_unit })) : null;
  };

  /* Named rather than returned anonymously so getComparison can ask this
     same area its three reads instead of restating their SQL. Not `this`: the
     write recorder wraps every operation as a plain function
     (live/writes.ts), and a receiver is not something an area may depend on
     surviving that. */
  const area: DosesArea = {
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
        input.drug ?? null,
        now()
      ];

      if (input.id) {
        const result = await driver.run(
          `UPDATE dose_event
              SET timestamp = ?, route = ?, dose = ?, dose_unit = ?, injection_site = ?, vehicle = ?,
                  application_site = ?, status = ?, scheduled_dose = ?, scheduled_route = ?,
                  scheduled_timestamp = ?, drug = ?, updated_at = ?
            WHERE uuid = ?`,
          [...values, input.id]
        );
        assertChanged(result, `dose event: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO dose_event (timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
                                 status, scheduled_dose, scheduled_route, scheduled_timestamp, drug, updated_at, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, uuid]
      );
      return uuid;
    },

    async deleteDose(id) {
      await driver.run('DELETE FROM dose_event WHERE uuid = ?', [id]);
    },

    async getSchedules() {
      const rows = await driver.query<{
        id: number;
        uuid: string;
        episode_uuid: string;
        recurrence_kind: string;
        every_n_days: number | null;
        doses_per_day: number;
      }>(
        `SELECT s.id, s.uuid, e.uuid AS episode_uuid, s.recurrence_kind, s.every_n_days, s.doses_per_day
           FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id
          ORDER BY s.id`
      );
      return Promise.all(
        rows.map(async (row) => ({
          id: row.uuid,
          episodeId: row.episode_uuid,
          recurrence:
            row.recurrence_kind === 'weekdays'
              ? { kind: 'weekdays' as const, weekdays: await weekdaysOf(row.id) }
              // The v38 CHECK guarantees every_n_days is set for this arm.
              : { kind: 'everyNDays' as const, everyNDays: row.every_n_days as number },
          dosesPerDay: row.doses_per_day,
          doseAmounts: await doseAmountsOf(row.id)
        }))
      );
    },

    /* An upsert on the episode, not on a schedule id: the caller is saying
       "this episode's rhythm is X", and which row happens to hold that is
       not something a screen should have to track.

       Weekdays and dose amounts are replaced wholesale - delete then
       reinsert - rather than diffed, the same "an update replaces it"
       reasoning the schedule row itself already gets: a form save always
       carries the full set, never a single amount or weekday to patch. */
    async upsertSchedule(input) {
      const episodeId = await episodeRowid(input.episodeId);
      const existing = await driver.query<{ id: number; uuid: string }>(
        'SELECT id, uuid FROM dose_schedule WHERE episode_id = ?',
        [episodeId]
      );
      const everyNDays = input.recurrence.kind === 'everyNDays' ? input.recurrence.everyNDays : null;

      return driver.transaction(async () => {
        let scheduleRowId: number;
        let uuid: string;
        if (existing.length > 0) {
          await driver.run(
            'UPDATE dose_schedule SET recurrence_kind = ?, every_n_days = ?, doses_per_day = ?, updated_at = ? WHERE episode_id = ?',
            [input.recurrence.kind, everyNDays, input.dosesPerDay, now(), episodeId]
          );
          scheduleRowId = existing[0].id;
          uuid = existing[0].uuid;
        } else {
          uuid = mintUuid();
          const result = await driver.run(
            'INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [uuid, episodeId, input.recurrence.kind, everyNDays, input.dosesPerDay, now()]
          );
          scheduleRowId = result.lastInsertRowid;
        }

        await driver.run('DELETE FROM dose_schedule_weekday WHERE schedule_id = ?', [scheduleRowId]);
        if (input.recurrence.kind === 'weekdays') {
          for (const weekday of input.recurrence.weekdays) {
            await driver.run('INSERT INTO dose_schedule_weekday (schedule_id, weekday) VALUES (?, ?)', [
              scheduleRowId,
              weekday
            ]);
          }
        }

        await driver.run('DELETE FROM dose_schedule_dose_amount WHERE schedule_id = ?', [scheduleRowId]);
        if (input.doseAmounts) {
          for (const [position, amount] of input.doseAmounts.entries()) {
            await driver.run(
              'INSERT INTO dose_schedule_dose_amount (schedule_id, position, dose, dose_unit) VALUES (?, ?, ?, ?)',
              [scheduleRowId, position, amount.dose, amount.doseUnit]
            );
          }
        }

        return uuid;
      });
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
      await driver.run('DELETE FROM dose_pause WHERE uuid = ?', [id]);
    },

    async getComparison({ fromEpochDay, toEpochDay }) {
      const [episodes, doses, schedules, pauses] = await Promise.all([
        regimen.getEpisodes(),
        area.getDoses(fromEpochDay, toEpochDay),
        area.getSchedules(),
        area.getPauses()
      ]);

      /* Concurrent episodes for different drugs make this two (phase 5
         ticket 38), and then there is no single schedule to compare
         against - the same answer as none at all as far as the comparison
         goes, worded apart because the two read differently on screen. */
      const active = activeEpisodesAt(episodes, startOfDayTimestamp(toEpochDay));
      if (active.length > 1) return { reason: 'multipleEpisodes' };
      const activeEpisode = active[0];
      if (!activeEpisode) return { reason: 'noEpisode' };

      const schedule = schedules.find((s) => s.episodeId === activeEpisode.id);
      if (!schedule) return { reason: 'noSchedule', activeEpisode };

      const episodePauses = pauses.filter((pause) => pause.episodeId === activeEpisode.id);
      /* Only the doses this episode is responsible for. adherence cannot
         check this itself - it is handed slots and doses and knows nothing
         about episodes (doseSchedule.ts) - and handing it the whole window
         instead puts every earlier episode's doses in `unmatched`, where the
         wording says they were extras or fell in a pause. Attributed rather
         than filtered by date, so the split is the one every other screen
         makes. */
      const episodeDoses = doses.filter((dose) => attributeDose(episodes, dose).episode?.id === activeEpisode.id);
      const slots = expectedSlots(schedule, activeEpisode.startEpochDay, fromEpochDay, toEpochDay);

      return {
        reason: null,
        activeEpisode,
        schedule,
        pauses: episodePauses,
        comparison: adherence(slots, episodeDoses, episodePauses)
      };
    }
  };

  return area;
}
