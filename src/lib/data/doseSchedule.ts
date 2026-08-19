/* Expected dose slots, and pairing them against what was actually logged
   (phase 4 ticket 02). Pure, and kept above the journal seam next to
   regimenEpisode.ts for the same reason: a slot is a question about a
   schedule and a range of days, not a row anyone stores. Nothing here
   reads a clock or a database.

   Deliberately no verdict. This file answers "what was expected, and what
   is logged against it", and stops: no target rate, no streak, no
   good/bad. The comparison is the feature (ticket 02, out of scope). */

import { epochDayFromTimestamp, weekdayOfEpochDay } from './epochDay';
import type { DoseEvent, DosePause, DoseRoute, DoseSchedule, DoseScheduleAmount } from './types';

/** Which routes carry a rotated injection site and a vehicle, and which
    carry a plain application site.

    Guards over the whole record, not over its `route` field, and generic in
    that record: a predicate on the field would have answered the question
    without narrowing the union, so every caller would then have needed a cast
    to reach the site it had just proved was there. Generic because the same
    question gets asked of three shapes - a stored DoseEvent, a DoseEventInput
    on its way in, and the editor's own draft - and `T & { route: … }` narrows
    each of them to the right arm. */
export const isInjectionDose = <T extends { route: DoseRoute }>(dose: T): dose is T & { route: 'im' | 'sc' } =>
  dose.route === 'im' || dose.route === 'sc';

export const isTopicalDose = <T extends { route: DoseRoute }>(dose: T): dose is T & { route: 'patch' | 'gel' } =>
  dose.route === 'patch' || dose.route === 'gel';

/** The rotation map's regions. Covers both injection routes: the first
    three are the usual IM sites, the last three the usual SC ones, and
    plenty of people use a route the "wrong" list would have hidden.

    `as const` so the key union below is derived from this list rather than
    written out again. labels.ts documents why that matters: a record typed
    against a derived union makes adding a region without adding its message
    a typecheck failure instead of a raw key on screen. */
export const INJECTION_SITE_REGIONS = [
  'ventrogluteal',
  'dorsogluteal',
  'thigh',
  'deltoid',
  'abdomen',
  'loveHandle'
] as const;

export type InjectionSiteRegion = (typeof INJECTION_SITE_REGIONS)[number];
export type InjectionSiteSide = 'left' | 'right';
export type InjectionSiteKey = `${InjectionSiteRegion}-${InjectionSiteSide}`;

/** One region of the injection rotation body map. Sided, because rotating
    is mostly alternating sides, and a map that could not say which side
    would not support the rotation it exists for. */
export interface InjectionSite {
  key: InjectionSiteKey;
  region: InjectionSiteRegion;
  side: InjectionSiteSide;
}

export const INJECTION_SITES: InjectionSite[] = INJECTION_SITE_REGIONS.flatMap((region) => [
  { key: `${region}-left` as const, region, side: 'left' as const },
  { key: `${region}-right` as const, region, side: 'right' as const }
]);

/** Days since each rotation site was last injected, or `null` for a site
    the dose log has never recorded a dose against (ticket 10). A distinct
    state rather than a large number or zero, because neither would read as
    "never" - and deliberately just that: no verdict on which sites are due,
    matching the rest of this file (see the header comment).

    Every entry in `doses` is scanned, not only ones naming a site this
    build's map can place: an imported or otherwise siteless injection dose
    still cannot move a site's recency, but it must not throw either. */
export function siteRecency(
  doses: readonly DoseEvent[],
  todayEpochDay: number
): Record<InjectionSiteKey, number | null> {
  const lastUsedDay = new Map<string, number>();
  for (const dose of doses) {
    if (!isInjectionDose(dose) || dose.injectionSite === null) continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    const seen = lastUsedDay.get(dose.injectionSite);
    if (seen === undefined || day > seen) lastUsedDay.set(dose.injectionSite, day);
  }

  const recency = {} as Record<InjectionSiteKey, number | null>;
  for (const site of INJECTION_SITES) {
    const lastDay = lastUsedDay.get(site.key);
    recency[site.key] = lastDay === undefined ? null : todayEpochDay - lastDay;
  }
  return recency;
}

/** Where a patch or gel went. A flat list, not the rotation map: a patch
    site is not rotated on an injection site's schedule, so sides and
    muscle layers are precision nobody applying a gel needs. */
export const APPLICATION_SITES = [
  'abdomen',
  'upperArm',
  'innerArm',
  'thigh',
  'buttock',
  'shoulder',
  'back'
] as const;

export type ApplicationSiteKey = (typeof APPLICATION_SITES)[number];

/** One dose the schedule expects. `indexInDay` numbers a multi-dose day's
    slots in order (twice-daily oral is 0 and 1); it is a position, not a
    time of day - the schedule says how many, never when. `amount` is the
    schedule's `doseAmounts` entry for this slot's place in the cycle, or
    null when the schedule declares no amounts. */
export interface DoseSlot {
  epochDay: number;
  indexInDay: number;
  amount: DoseScheduleAmount | null;
}

/** Whether `epochDay` falls inside `pause`. An open pause (no end day)
    covers every day from its start onwards. */
export function pauseCoversDay(pause: DosePause, epochDay: number): boolean {
  if (epochDay < pause.startEpochDay) return false;
  return pause.endEpochDay === null || epochDay <= pause.endEpochDay;
}

/** How many of `weekdays` fall in the half-open range [anchorEpochDay,
    uptoEpochDay) - a weekday recurrence's own step count, the way an
    every-N-days schedule already has one from dividing by its interval.
    Whole weeks each contribute `weekdays.length` (every weekday occurs once
    a week) and only the remainder needs a day-by-day check, so a schedule
    running for years costs the same as one running for a week. */
function weekdayOccurrencesBefore(anchorEpochDay: number, uptoEpochDay: number, weekdays: readonly number[]): number {
  const totalDays = uptoEpochDay - anchorEpochDay;
  if (totalDays <= 0) return 0;
  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * weekdays.length;
  for (let day = anchorEpochDay + fullWeeks * 7; day < uptoEpochDay; day++) {
    if (weekdays.includes(weekdayOfEpochDay(day))) count++;
  }
  return count;
}

/** The slots `schedule` expects between `fromEpochDay` and `toEpochDay`
    inclusive. An every-N-days recurrence steps from `anchorEpochDay` - the
    episode's start day, so the progression belongs to the episode and does
    not shift when the schedule is edited or the range scrolls. A weekdays
    recurrence needs no anchor to hold that guarantee - a Monday is a Monday
    regardless of when the schedule was written - so `anchorEpochDay` only
    keeps it from generating slots before the episode began.

    Either way, `doseAmounts` (when the schedule has any) cycles across the
    slots in chronological order, counting from the anchor rather than from
    `fromEpochDay`, so which amount lands on which day does not shift when
    the range scrolls either.

    A schedule with a non-positive dose count, a non-positive step, or an
    empty weekday set expects nothing: it describes no rhythm, and treating
    it as daily would invent one. */
export function expectedSlots(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  fromEpochDay: number,
  toEpochDay: number
): DoseSlot[] {
  if (schedule.dosesPerDay < 1) return [];

  const amounts = schedule.doseAmounts;
  const amountAt = (occurrence: number, indexInDay: number): DoseScheduleAmount | null =>
    amounts && amounts.length > 0 ? amounts[(occurrence * schedule.dosesPerDay + indexInDay) % amounts.length] : null;

  const first = Math.max(fromEpochDay, anchorEpochDay);
  const slots: DoseSlot[] = [];

  if (schedule.recurrence.kind === 'everyNDays') {
    const { everyNDays } = schedule.recurrence;
    if (everyNDays < 1) return [];
    const stepsIn = Math.ceil((first - anchorEpochDay) / everyNDays);
    let occurrence = stepsIn;
    for (let day = anchorEpochDay + stepsIn * everyNDays; day <= toEpochDay; day += everyNDays, occurrence++) {
      for (let indexInDay = 0; indexInDay < schedule.dosesPerDay; indexInDay++) {
        slots.push({ epochDay: day, indexInDay, amount: amountAt(occurrence, indexInDay) });
      }
    }
    return slots;
  }

  const { weekdays } = schedule.recurrence;
  if (weekdays.length === 0) return [];
  for (let day = first; day <= toEpochDay; day++) {
    if (!weekdays.includes(weekdayOfEpochDay(day))) continue;
    const occurrence = weekdayOccurrencesBefore(anchorEpochDay, day, weekdays);
    for (let indexInDay = 0; indexInDay < schedule.dosesPerDay; indexInDay++) {
      slots.push({ epochDay: day, indexInDay, amount: amountAt(occurrence, indexInDay) });
    }
  }
  return slots;
}

/** One line of the actual-vs-scheduled view: a slot, and the dose logged
    against it, or null if nothing was. A `skipped` dose fills its slot -
    that is the difference between a gap someone recorded and one they
    never mentioned. */
export interface AdherenceRow {
  slot: DoseSlot;
  dose: DoseEvent | null;
}

export interface Adherence {
  /** Every expected slot in range, in order, minus the ones a pause
      covers - a break is not a missed dose. */
  rows: AdherenceRow[];
  /** Doses with no slot to sit in: one taken during a pause, or an extra
      beyond the day's count. They are surfaced rather than dropped, so the
      view never silently hides something the user logged. */
  unmatched: DoseEvent[];
}

/** Pairs doses to slots by position within their day: a day's doses, oldest
    first, fill that day's slots in order. Positional rather than nearest-time
    because the schedule holds no times of day to be near - "twice daily" says
    two, not 8am and 8pm.

    `doses` must already be scoped to the same episode whose schedule produced
    `slots` - resolveEpisodeAt is how a caller does that (regimenEpisode.ts).
    Handing in a whole window's worth instead puts every earlier episode's
    doses in `unmatched`, where they read as extras or as taken during a pause,
    and neither is true. This function cannot check it: it is given slots and
    doses, and knows nothing about episodes. */
export function adherence(
  slots: readonly DoseSlot[],
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[]
): Adherence {
  const expected = slots.filter((slot) => !pauses.some((pause) => pauseCoversDay(pause, slot.epochDay)));

  const byDay = new Map<number, DoseEvent[]>();
  for (const dose of [...doses].sort((a, b) => a.timestamp - b.timestamp)) {
    const day = epochDayFromTimestamp(dose.timestamp);
    const onDay = byDay.get(day);
    if (onDay) onDay.push(dose);
    else byDay.set(day, [dose]);
  }

  const matched = new Set<DoseEvent>();
  const rows = expected.map((slot) => {
    const dose = byDay.get(slot.epochDay)?.[slot.indexInDay] ?? null;
    if (dose) matched.add(dose);
    return { slot, dose };
  });

  const unmatched = [...byDay.values()].flat().filter((dose) => !matched.has(dose));
  return { rows, unmatched };
}
