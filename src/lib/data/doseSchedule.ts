/* Expected dose slots, and pairing them against what was actually logged. Pure, and kept
   above the journal seam next to regimenEpisode.ts for the same reason: a slot is a
   question about a schedule and a range of days, not a row anyone stores. Nothing here
   reads a clock or a database.

   Deliberately no verdict. This file answers "what was expected, and what is logged against
   it", and stops: no target rate, no streak, no good/bad. The comparison is the feature. */

import { epochDayFromTimestamp, timestampAtLocalTime, weekdayOfEpochDay } from './epochDay';
import { spanCoversDay } from './span';
import type { DoseEvent, DosePause, DoseRoute, DoseSchedule, DoseScheduleAmount } from './types';

/** Actual medication taken must have a finite, positive amount. Skipped
    slots carry expected amounts and do not use this constraint. */
export const isPositiveDoseAmount = (dose: number): boolean => Number.isFinite(dose) && dose > 0;

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

/* Reading a route out of the words someone typed.

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
  rectal: ['rectal'],
  im: ['im', 'intramuscular'],
  sc: ['sc', 'subcutaneous', 'subcut'],
  implant: ['implant', 'pellet'],
  patch: ['patch'],
  gel: ['gel']
};

const wordsIn = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** The same fold with the gaps closed up, so "I.M." and "im" are one string
    to compare rather than two spellings to remember. */
const compactWord = (text: string): string => wordsIn(text).join('');

/** A route and the word the app shows for it. Named here rather than
    restated at each call site: doseLabels.ts builds the list, this file
    reads it, and neither should be describing the same pair twice. */
export interface RouteOption {
  value: DoseRoute;
  label: string;
}

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
 * app's own word for each route, in whichever language is running. Passing
 * an empty list matches on the keys and the ASCII abbreviations alone, which
 * is all the Node tier can ask for - those words speak paraglide and this
 * file may not (ADR-0016).
 */
export function matchDoseRoute(text: string, routeWords: readonly RouteOption[]): DoseRoute | null {
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
const INJECTION_SITE_REGIONS = [
  'ventrogluteal',
  'dorsogluteal',
  'thigh',
  'deltoid',
  'abdomen',
  'loveHandle'
] as const;

export type InjectionSiteRegion = (typeof INJECTION_SITE_REGIONS)[number];
type InjectionSiteSide = 'left' | 'right';
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
    the dose log has never recorded a dose against. A distinct
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
    rather than asking again. An injection with no
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
    covers every day from its start onwards. Delegates to span.ts's
    spanCoversDay; the arithmetic lives once. */
export function pauseCoversDay(pause: DosePause, epochDay: number): boolean {
  return spanCoversDay(pause, epochDay);
}

/** Whether `schedule` expects a dose on every single day (ADR-0067). A daily schedule puts a mark on every cell a
    calendar could draw, which is wallpaper rather than information - so
    `dayAhead.ts` reads this to leave a daily schedule out of the marks it
    produces, the same way a weekly injection stays in.

    An every-N-days recurrence is daily at `everyNDays <= 1` - one is the
    literal case, and anything under that describes no rhythm at all
    (expectedSlots' own reading). A weekdays recurrence is daily once every
    weekday is picked; nothing else in the app currently offers that
    combination through the UI, but the schedule's own shape allows it, so
    this reads the set rather than assuming the sheet stops someone. */
export function isDailySchedule(schedule: DoseSchedule): boolean {
  return schedule.recurrence.kind === 'everyNDays'
    ? schedule.recurrence.everyNDays <= 1
    : schedule.recurrence.weekdays.length >= 7;
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

/** The most doses a schedule expects in one day. Hourly with a night off is
    sixteen; the ceiling is there so a count read off an archive the editor
    never wrote cannot make the auto-log pass allocate a dose per count. */
export const MAX_DOSES_PER_DAY = 24;

/** A doses-a-day count the schedule editor may save and restore accepts: a
    whole number from 1 to MAX_DOSES_PER_DAY. */
export function isExpectedDosesPerDay(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_DOSES_PER_DAY;
}

/** Return expected slots in the inclusive range. Anchor every-N-days steps
    to the episode start. Weekday slots also start no earlier than that day.
    Cycle doseAmounts from the anchor so scrolling cannot shift a dose's amount.
    Return no slots for invalid counts, steps or weekday sets, including counts
    above MAX_DOSES_PER_DAY. */
export function expectedSlots(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  fromEpochDay: number,
  toEpochDay: number
): DoseSlot[] {
  if (!isExpectedDosesPerDay(schedule.dosesPerDay)) return [];

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

/** How many days off its slot's own day a dose may sit and still fill that slot (amending
    ADR-0086). Kept under half the gap between two slots, so a dose can never be in reach of
    two different slot days: a weekly injection taken up to three days late or early is
    still that week's, and a daily schedule (or an every-other-day one, where a one-day-late
    dose is exactly as near the next slot) stays same-day only.

    A weekday recurrence's gaps differ round the week, Monday and Thursday being three days
    and then four, and the narrower gap decides. A schedule that expects nothing has no gap
    to halve and answers zero. */
export function slotToleranceDays(schedule: Pick<DoseSchedule, 'recurrence'>): number {
  let gap: number;
  if (schedule.recurrence.kind === 'everyNDays') {
    gap = schedule.recurrence.everyNDays;
  } else {
    const days = [...new Set(schedule.recurrence.weekdays)].sort((a, b) => a - b);
    if (days.length === 0) return 0;
    gap = days.reduce((narrowest, day, i) => {
      const next = i + 1 < days.length ? days[i + 1] : days[0] + 7;
      return Math.min(narrowest, next - day);
    }, 7);
  }
  return Number.isFinite(gap) && gap >= 1 ? Math.ceil(gap / 2) - 1 : 0;
}

/** Match automatic doses by recorded episode, day and position.
    Travel can shift their displayed day, so never fall back to their
    timestamp. Pair other doses oldest first to the day's ordered slots.

    With positive `toleranceDays`, remaining doses take the closest open
    slot in range, oldest dose first. Same-day matches always go first.
    Zero tolerance keeps same-day pairing only.

    The caller uses `attributeDose` to scope timestamp-based doses to
    the episode. Older episodes otherwise show up as unmatched extras. */
export function adherence(
  slots: readonly DoseSlot[],
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  toleranceDays = 0,
  episodeId?: string
): Adherence {
  const expected = slots.filter((slot) => !pauses.some((pause) => pauseCoversDay(pause, slot.epochDay)));

  const ordered = [...doses].sort((a, b) => a.timestamp - b.timestamp);
  const matched = new Set<DoseEvent>();
  const rows: AdherenceRow[] = expected.map((slot) => ({ slot, dose: null }));
  const rowsByDay = new Map<number, AdherenceRow[]>();
  for (const row of rows) {
    const onDay = rowsByDay.get(row.slot.epochDay) ?? [];
    onDay.push(row);
    rowsByDay.set(row.slot.epochDay, onDay);
  }
  // A recorded automatic slot wins before timestamp-based pairing. Its
  // timestamp may now display on another day; it cannot fill another slot.
  for (const dose of ordered) {
    const identity = dose.autoLogSlot;
    if (!identity || dose.source !== 'schedule' || (episodeId !== undefined && identity.episodeId !== episodeId)) continue;
    const row = rowsByDay.get(identity.epochDay)?.find(({ slot, dose: occupant }) =>
      occupant === null && slot.indexInDay === identity.indexInDay);
    if (row) {
      row.dose = dose;
      matched.add(dose);
    }
  }
  const byDay = new Map<number, DoseEvent[]>();
  for (const dose of ordered) {
    if (dose.autoLogSlot) continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    const onDay = byDay.get(day) ?? [];
    onDay.push(dose);
    byDay.set(day, onDay);
  }
  for (const [day, onDay] of byDay) {
    for (const dose of onDay) {
      if (matched.has(dose)) continue;
      const row = rowsByDay.get(day)?.find((row) => row.dose === null);
      if (row) {
        row.dose = dose;
        matched.add(dose);
      }
    }
  }

  if (toleranceDays > 0) {
    for (const [day, onDay] of byDay) {
      for (const dose of onDay) {
        if (matched.has(dose)) continue;
        /* `rows` is chronological, so on a tie (two open slots on one day)
           the strict comparison keeps the earlier one. */
        let nearest: AdherenceRow | null = null;
        for (const row of rows) {
          if (row.dose !== null) continue;
          const distance = Math.abs(row.slot.epochDay - day);
          if (distance > toleranceDays) continue;
          if (!nearest || distance < Math.abs(nearest.slot.epochDay - day)) nearest = row;
        }
        if (nearest) {
          nearest.dose = dose;
          matched.add(dose);
        }
      }
    }
  }

  const unmatched = ordered.filter((dose) => !matched.has(dose));
  return { rows, unmatched };
}

/** The most recent slot before `todayEpochDay` with nothing logged against
    it, or null. Today's own slot is never it: the person has all day, and
    a surface asking about it would be asking about a dose they are still
    free to take.

    `rows` is already the schedule's own answer with pauses removed above:
    a break somebody declared is not a slot that passed.

    Named here rather than written twice because two surfaces select the
    same row and neither may quietly select a different one - the return
    surface (comingBack.ts) and Today's agenda (agenda.ts). Deliberately no
    verdict and no plural, like the rest of this file: one row, and nothing
    about how many there were. */
export function mostRecentPassedSlot({ rows }: Adherence, todayEpochDay: number): AdherenceRow | null {
  return (
    rows
      .filter((row) => row.dose === null && row.slot.epochDay < todayEpochDay)
      .sort((a, b) => b.slot.epochDay - a.slot.epochDay)[0] ?? null
  );
}

/** The amount the schedule is still expecting on `epochDay`: the first slot
    that day with nothing logged against it. Null where the day expects
    nothing, where every slot is already logged, or where the schedule
    tracks no amounts at all.

    What this is for is the alternating regimen. An
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

/** How many days from `todayEpochDay` to the nearest slot `schedule` still
    expects nothing logged against - the day a new dose without a drug
    picked yet is most likely for. Searches only
    `maxRadiusDays` either side of today, capped further to the schedule's
    own period (`everyNDays`, or a week for `weekdays`) - the smallest
    window guaranteed to hold a slot, so a rare wide-interval schedule
    costs no more than a narrow one. Null when nothing in that window is
    open: an as-needed drug with no schedule at all never reaches here, and
    a schedule whose only nearby slot a pause covers is the same as having
    none. */
export function nearestOpenSlotDistance(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number,
  maxRadiusDays: number
): number | null {
  const period = schedule.recurrence.kind === 'everyNDays' ? Math.max(schedule.recurrence.everyNDays, 1) : 7;
  const radius = Math.min(period, maxRadiusDays);
  const slots = expectedSlots(schedule, anchorEpochDay, todayEpochDay - radius, todayEpochDay + radius);
  const { rows } = adherence(slots, doses, pauses, slotToleranceDays(schedule), schedule.episodeId);
  const distances = rows.filter((row) => row.dose === null).map((row) => Math.abs(row.slot.epochDay - todayEpochDay));
  return distances.length > 0 ? Math.min(...distances) : null;
}

/* When a dose nobody timed gets written. A schedule
   says how many doses a day expects and never when - that is the whole of
   the "no verdict" rule this file keeps - so an auto-logged dose has no
   recorded time to copy and one has to be chosen.

   The window runs midday to evening and the day's slots are spread evenly
   across it: once a day lands at noon, twice a day at noon and eight, three
   times a day at noon, four and eight. Deliberately not a morning: a dose
   written at 8am for a day that has already ended reads as a claim about
   when the person took it, where midday reads as the middle of the day it
   is standing in for. The clinician summary marks these rows anyway, so
   nothing downstream mistakes the chosen time for a recorded one. */
const AUTO_LOG_WINDOW_START_HOUR = 12;
const AUTO_LOG_WINDOW_END_HOUR = 20;

/** Whether a schedule expects a dose on any day at all - the same three
    guards `expectedSlots` applies before it generates anything, named here
    so a screen can ask the question without generating a range of slots to
    find out. */
function expectsAnyDose(schedule: Pick<DoseSchedule, 'recurrence' | 'dosesPerDay'>): boolean {
  if (!isExpectedDosesPerDay(schedule.dosesPerDay)) return false;
  return schedule.recurrence.kind === 'everyNDays'
    ? schedule.recurrence.everyNDays >= 1
    : schedule.recurrence.weekdays.length > 0;
}

/** Whether this schedule is definite enough to log its own doses (ADR-0086): it expects a dose on some day, it says how much, and the route
    the doses would be written with is one of the six the dose log records.
    The switch is offered on exactly this, so a schedule can never be switched
    on with nothing definite to write.

    A regimen episode's `route` is free text (types.ts), so it takes reading -
    `routeWords` is `ROUTE_OPTIONS` from doseLabels.ts, the app's own word for
    each route in whichever language is running, handed in rather than
    imported for the reason matchDoseRoute gives (ADR-0016). Both callers pass
    the same list, the schedule editor and the auto-log pass alike, so the
    switch is never offered on an episode the pass would then read nothing
    from. */
export function canAutoLog(
  /* The parts of a schedule this reads, not a whole one: the schedule
     editor asks the question of the draft in front of the person, which has
     no id yet on an episode whose rhythm has never been saved, and a full
     `DoseSchedule` would have made it invent two. */
  schedule: Pick<DoseSchedule, 'recurrence' | 'dosesPerDay' | 'doseAmounts'>,
  episodeRoute: string,
  routeWords: readonly RouteOption[]
): boolean {
  return (
    expectsAnyDose(schedule) &&
    (schedule.doseAmounts?.length ?? 0) > 0 &&
    matchDoseRoute(episodeRoute, routeWords) !== null
  );
}

/** One slot the auto-log pass will write, and the moment it writes it at. */
export interface AutoLogSlot {
  slot: DoseSlot;
  /** Epoch milliseconds, inside `slot.epochDay`. */
  timestamp: number;
}

/** By the wall clock (timestampAtLocalTime), not as an offset from
    midnight: on the days the clocks change, midnight plus twelve hours is
    11:00 or 13:00. */
function autoLogTimestamp(slot: DoseSlot, dosesPerDay: number): number {
  const span = AUTO_LOG_WINDOW_END_HOUR - AUTO_LOG_WINDOW_START_HOUR;
  const hour =
    dosesPerDay < 2
      ? AUTO_LOG_WINDOW_START_HOUR
      : AUTO_LOG_WINDOW_START_HOUR + (span * slot.indexInDay) / (dosesPerDay - 1);
  const minutes = Math.round(hour * 60);
  return timestampAtLocalTime(slot.epochDay, `${Math.floor(minutes / 60)}:${minutes % 60}`);
}

/**
 * Return unfilled auto-log slots oldest first (ADR-0086). Start at
 * the later of schedule opt-in and episode start, and stop at
 * yesterday so today remains available for manual logging.
 *
 * Use adherence to account for pauses, manual matches within
 * tolerance and automatic rows already written. No stored cursor
 * is needed. The caller supplies today and owns the writes.
 */
export function autoLogSlots(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  doses: readonly DoseEvent[],
  pauses: readonly DosePause[],
  todayEpochDay: number
): AutoLogSlot[] {
  const from = schedule.autoLogFromEpochDay;
  if (from === null) return [];

  const slots = expectedSlots(schedule, anchorEpochDay, from, todayEpochDay - 1);
  const { rows } = adherence(slots, doses, pauses, slotToleranceDays(schedule), schedule.episodeId);
  return rows
    .filter((row) => row.dose === null)
    .map((row) => ({ slot: row.slot, timestamp: autoLogTimestamp(row.slot, schedule.dosesPerDay) }));
}
