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

/* Reading a route out of the words someone typed (phase 5 UX ticket 37).

   A RegimenEpisode's `route` is free text and a dose's is one of six keys,
   so the sheet that logs a dose against a regimen had been asking for the
   route again - and defaulting to oral, which is the wrong answer for
   every injected regimen there is.

   The abbreviations below are ASCII and matched as whole words, which is
   the whole of the care this needs: "discontinued" carries `sc` as a
   substring, and Polish "po" is a preposition, so a substring match or a
   two-letter alias list reaching further than this would resolve a route
   out of ordinary prose. The words the app itself uses for the six routes
   are handed in rather than imported, because they speak paraglide and
   this file may not (ADR-0016, and doseLabels.ts is where they live). */
const ROUTE_ALIASES: Record<DoseRoute, readonly string[]> = {
  oral: ['oral'],
  sublingual: ['sublingual', 'sl'],
  im: ['im', 'intramuscular'],
  sc: ['sc', 'subcutaneous', 'subcut'],
  patch: ['patch'],
  gel: ['gel']
};

const compactWord = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const wordsIn = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Which of the six dose routes a free-text route names, or null.
 *
 * Null covers both "names none of them" and "names two", and the second is
 * the one worth spelling out: an episode whose route reads "patch, gel when
 * travelling" has not settled which route today's dose was, and a prefill
 * that picks one of the two is a wrong answer wearing a right answer's
 * confidence. The sheet asks instead.
 *
 * `routeWords` is `ROUTE_OPTIONS` from doseLabels.ts at the call site: the
 * app's own word for each route, in whichever language is running. Without
 * it only the keys and the ASCII abbreviations match, which is what the
 * Node tier gets.
 */
export function matchDoseRoute(
  text: string,
  routeWords: readonly { value: DoseRoute; label: string }[] = []
): DoseRoute | null {
  const compact = compactWord(text);
  if (!compact) return null;

  const needles = new Map<DoseRoute, string[]>();
  for (const route of Object.keys(ROUTE_ALIASES) as DoseRoute[]) {
    needles.set(route, [...ROUTE_ALIASES[route]]);
  }
  for (const { value, label } of routeWords) {
    const word = compactWord(label);
    if (word) needles.get(value)?.push(word);
  }

  for (const [route, words] of needles) {
    if (words.includes(compact)) return route;
  }

  const words = wordsIn(text);
  const named = [...needles].filter(([, needle]) => needle.some((word) => words.includes(word)));
  return named.length === 1 ? named[0][0] : null;
}

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

/** The most recent injection logged before `before`, or null where there is
    none. `exceptId` leaves out the dose being edited, so a dose is never its
    own predecessor.

    Two screens' worth of question in one read: the rotation map marks where
    the last one went, and the sheet fills in the vehicle that one used
    rather than asking again (phase 5 UX ticket 37). An injection with no
    site on record is still returned - it has nothing to say about rotation
    and everything to say about which vehicle is in the fridge.

    Order-independent, unlike the reverse scan over `doses` this replaces:
    the log arrives ascending today, and a read that quietly depends on that
    is a read that breaks the day something sorts differently. */
export function lastInjectionBefore(
  doses: readonly DoseEvent[],
  before: number,
  exceptId?: string
): Extract<DoseEvent, { route: 'im' | 'sc' }> | null {
  let latest: Extract<DoseEvent, { route: 'im' | 'sc' }> | null = null;
  for (const dose of doses) {
    if (dose.timestamp >= before || dose.id === exceptId || !isInjectionDose(dose)) continue;
    if (!latest || dose.timestamp > latest.timestamp) latest = dose;
  }
  return latest;
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
    `slots` - attributeDose is how a caller does that (regimenEpisode.ts).
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

/** The amount the schedule is still expecting on `epochDay`: the first slot
    that day with nothing logged against it. Null where the day expects
    nothing, where every slot is already logged, or where the schedule
    tracks no amounts at all.

    What this is for is the alternating regimen (phase 5 UX ticket 37). An
    episode carries one figure and a schedule's `doseAmounts` can cycle
    2mg/1mg across the slots, so seeding a new dose from the episode fills
    in the wrong number on every other day. Reading it here means the sheet
    offers the figure the schedule was expecting next, and no screen has to
    do the cycle arithmetic itself.

    Deliberately no verdict, like the rest of this file: "still expecting"
    is a slot with nothing in it, not a judgement about a dose being late. */
export function expectedAmountOn({ rows }: Adherence, epochDay: number): DoseScheduleAmount | null {
  return rows.find((row) => row.slot.epochDay === epochDay && row.dose === null)?.slot.amount ?? null;
}
