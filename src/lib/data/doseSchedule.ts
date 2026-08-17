/* Expected dose slots, and pairing them against what was actually logged
   (phase 4 ticket 02). Pure, and kept above the journal seam next to
   regimenEpisode.ts for the same reason: a slot is a question about a
   schedule and a range of days, not a row anyone stores. Nothing here
   reads a clock or a database.

   Deliberately no verdict. This file answers "what was expected, and what
   is logged against it", and stops: no target rate, no streak, no
   good/bad. The comparison is the feature (ticket 02, out of scope). */

import { epochDayFromTimestamp } from './epochDay';
import type { DoseEvent, DosePause, DoseSchedule } from './types';

/** One region of the injection rotation body map. Sided, because rotating
    is mostly alternating sides, and a map that could not say which side
    would not support the rotation it exists for. */
export interface InjectionSite {
  key: string;
  /** Which muscle or layer, as a message-key suffix. */
  region: 'ventrogluteal' | 'dorsogluteal' | 'thigh' | 'deltoid' | 'abdomen' | 'loveHandle';
  side: 'left' | 'right';
}

const sided = (region: InjectionSite['region']): InjectionSite[] => [
  { key: `${region}-left`, region, side: 'left' },
  { key: `${region}-right`, region, side: 'right' }
];

/** The rotation map's regions. Covers both injection routes: the upper
    three are the usual IM sites, the lower three the usual SC ones, and
    plenty of people use a route the "wrong" list would have hidden. */
export const INJECTION_SITES: InjectionSite[] = [
  ...sided('ventrogluteal'),
  ...sided('dorsogluteal'),
  ...sided('thigh'),
  ...sided('deltoid'),
  ...sided('abdomen'),
  ...sided('loveHandle')
];

/** Where a patch or gel went. A flat list, not the rotation map: a patch
    site is not rotated on an injection site's schedule, so sides and
    muscle layers are precision nobody applying a gel needs. */
export const APPLICATION_SITES = ['abdomen', 'upperArm', 'innerArm', 'thigh', 'buttock', 'shoulder', 'back'];

/** One dose the schedule expects. `indexInDay` numbers a multi-dose day's
    slots in order (twice-daily oral is 0 and 1); it is a position, not a
    time of day - the schedule says how many, never when. */
export interface DoseSlot {
  epochDay: number;
  indexInDay: number;
}

/** Whether `epochDay` falls inside `pause`. An open pause (no end day)
    covers every day from its start onwards. */
export function pauseCoversDay(pause: DosePause, epochDay: number): boolean {
  if (epochDay < pause.startEpochDay) return false;
  return pause.endEpochDay === null || epochDay <= pause.endEpochDay;
}

/** The slots `schedule` expects between `fromEpochDay` and `toEpochDay`
    inclusive, stepping every `everyNDays` from `anchorEpochDay` - the
    episode's start day, so the progression belongs to the episode and does
    not shift when the schedule is edited or the range scrolls.

    A schedule with a non-positive step or dose count expects nothing: it
    describes no rhythm, and treating it as daily would invent one. */
export function expectedSlots(
  schedule: DoseSchedule,
  anchorEpochDay: number,
  fromEpochDay: number,
  toEpochDay: number
): DoseSlot[] {
  if (schedule.everyNDays < 1 || schedule.dosesPerDay < 1) return [];

  const first = Math.max(fromEpochDay, anchorEpochDay);
  const stepsIn = Math.ceil((first - anchorEpochDay) / schedule.everyNDays);
  const slots: DoseSlot[] = [];
  for (let day = anchorEpochDay + stepsIn * schedule.everyNDays; day <= toEpochDay; day += schedule.everyNDays) {
    for (let indexInDay = 0; indexInDay < schedule.dosesPerDay; indexInDay++) {
      slots.push({ epochDay: day, indexInDay });
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
    two, not 8am and 8pm. */
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
