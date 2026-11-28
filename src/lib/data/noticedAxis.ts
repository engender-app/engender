/* Plot first-noticed dates on a linear timeline. Distances represent real
   days and months, unlike the order-focused procedure and care rails. The
   caller supplies today and the screen supplies wording.

   Expected windows belong to the separate literature view. This axis
   records where changes fell, with neither endpoint treated as a target
   (ADR-0012). */

import type { EffectDirectionGroup } from './effectDirections';
import { epochDayFromLocalDate, epochDayMonthsAgo, localDateFromEpochDay } from './epochDay';

/** The shortest line the axis will draw, in days.

    A month. Without a floor, a regimen started three days ago divides by a
    span of three and draws two changes noticed on consecutive days at
    opposite ends of the screen. The floor opens the line *backwards* from
    its right end rather than forwards: the right end is today, and a line
    that ran on past today would be a runway with a fortnight of transition
    at one end of it and empty months ahead - which is the expectation this
    screen exists not to make. */
export const AXIS_MIN_SPAN_DAYS = 31;

/**
 * Stack marks when their tap targets would overlap. At the supported
 * 320px width, a 280px plot leaves 256px between inset endpoints.
 * A 24px target needs 24/256 ≈ 0.094 of that span; use 9.5%. A fraction
 * of the line keeps the collision rule consistent across date ranges.
 */
export const MARK_MIN_GAP = 0.095;

/** The most months the axis will name. Eight labels is what fits across a
    320px screen at the axis's own type size without the months touching. */
const MAX_TICKS = 8;

/** Every stride divides twelve, which is what keeps a calendar axis's kept
    months anchored on January and an onset axis's on the start day. */
const TICK_STRIDES = [1, 2, 3, 6, 12];

export type { EffectDirectionGroup } from './effectDirections';

/** The two things that land on this axis: a personal effect's own catalogue entry, marked
    at the day it was first noticed, and a side effect logged free-form at its own day.
    Telling them apart is `NoticedAxis.svelte`'s job - a mark shape, never a colour alone
    (ADR-0012) - and this is the one field it reads to do it. */
export type NoticedChangeKind = 'personal-effect' | 'side-effect';

/** A change somebody has marked, narrowed to what the drawing needs. The
    catalogue entry and the marker are two records on the screen; they arrive
    here already joined, so a test needs no fixture of either. */
export interface NoticedChange {
  key: string;
  label: string;
  direction: EffectDirectionGroup;
  firstNoticedEpochDay: number;
  kind: NoticedChangeKind;
  /** The severity word, for a side effect that carries one - drawn into the
      mark's own label rather than as a size or a hue (ADR-0012).
      Null where none was given; undefined on a personal effect, which has
      no severity to carry. */
  severity?: string | null;
}

interface NoticedMark extends NoticedChange {
  /** Where it is drawn, 0 at the line's left end and 1 at its right. */
  position: number;
  /** Which row above the line it stands in, 0 being the one on the line.
      A lane is a collision answer and nothing else: it is not a rank, a
      size or a second axis, and two marks in the same month differ by it
      only so that both can be seen and tapped. */
  lane: number;
}

interface NoticedTick {
  epochDay: number;
  position: number;
  /** Whole months from the regimen's start, negative before it - or null on
      the calendar axis, where a tick is the first of a month and counts
      from nothing. */
  monthsSinceOnset: number | null;
}

export interface NoticedAxis {
  /** `onset` when a regimen start anchors the line and the ticks count
      months from it; `calendar` when there is no start to count from and
      the ticks are calendar months. The screen says which, in words. */
  mode: 'onset' | 'calendar';
  fromEpochDay: number;
  toEpochDay: number;
  todayPosition: number;
  ticks: NoticedTick[];
  /** Left to right, ties by name. */
  marks: NoticedMark[];
  /** How many lanes deep the deepest stack goes, so the drawing knows its
      own height. Zero when nothing has been marked. */
  lanes: number;
}

/** The first of the calendar month `epochDay` falls in. */
function startOfMonth(epochDay: number): number {
  const date = localDateFromEpochDay(epochDay);
  return epochDayFromLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthIndex(epochDay: number): number {
  const date = localDateFromEpochDay(epochDay);
  return date.getFullYear() * 12 + date.getMonth();
}

/** The smallest stride that keeps the axis under its label budget. Twelve
    is the last resort: an axis over eight years names its years and crowds
    them rather than naming nothing. */
function strideFor(count: number): number {
  return TICK_STRIDES.find((stride) => Math.ceil(count / stride) <= MAX_TICKS) ?? 12;
}

/** More months than this between the axis's ends (two hundred years) is not
    a journal: the ticks are then built at a stride from the month index
    instead of by visiting every month, so a day stored near the minimum JS
    date cannot make the axis allocate a month for each. */
const MAX_SCANNED_MONTHS = 2400;
/** The ticks that survive on such an axis. */
const MAX_WIDE_TICKS = 100;

/** Every `stride`th month index in [first, last], where the stride is a
    multiple of twelve that keeps no more than MAX_WIDE_TICKS of them. */
function wideMonthIndexes(first: number, last: number): number[] {
  const stride = 12 * Math.ceil((last - first + 1) / (12 * MAX_WIDE_TICKS));
  const indexes: number[] = [];
  for (let n = Math.ceil(first / stride) * stride; n <= last; n += stride) indexes.push(n);
  return indexes;
}

/** The months the axis names.

    On the onset axis these are the start day's own monthly anniversaries,
    not the first of each calendar month: the axis says "three months in",
    and three months in from the 15th is the 15th. `epochDayMonthsAgo` does
    the clamping a month arithmetic needs (31 March back a month is 28
    February, not 3 March), and a negative count runs it forwards. */
function onsetTicks(anchorEpochDay: number, fromEpochDay: number, toEpochDay: number): NoticedTick[] {
  /* Bounded by the calendar months the line covers, one either side for the
     clamping, so this is a loop over the months drawn and not a search. */
  const first = monthIndex(fromEpochDay) - monthIndex(anchorEpochDay) - 1;
  const last = monthIndex(toEpochDay) - monthIndex(anchorEpochDay) + 1;
  if (last - first > MAX_SCANNED_MONTHS) {
    return wideMonthIndexes(first, last)
      .map((n) => ({ epochDay: epochDayMonthsAgo(anchorEpochDay, -n), position: 0, monthsSinceOnset: n }))
      .filter((tick) => tick.epochDay >= fromEpochDay && tick.epochDay <= toEpochDay);
  }
  const months: number[] = [];
  for (let n = first; n <= last; n++) {
    const day = epochDayMonthsAgo(anchorEpochDay, -n);
    if (day >= fromEpochDay && day <= toEpochDay) months.push(n);
  }
  const stride = strideFor(months.length);
  return months
    .filter((n) => n % stride === 0)
    .map((n) => ({ epochDay: epochDayMonthsAgo(anchorEpochDay, -n), position: 0, monthsSinceOnset: n }));
}

function calendarTicks(fromEpochDay: number, toEpochDay: number): NoticedTick[] {
  if (monthIndex(toEpochDay) - monthIndex(fromEpochDay) > MAX_SCANNED_MONTHS) {
    return wideMonthIndexes(monthIndex(fromEpochDay), monthIndex(toEpochDay))
      .map((index) => epochDayFromLocalDate(new Date(Math.floor(index / 12), index % 12, 1)))
      .filter((day) => day >= fromEpochDay && day <= toEpochDay)
      .map((day) => ({ epochDay: day, position: 0, monthsSinceOnset: null }));
  }
  const days: number[] = [];
  for (let index = monthIndex(fromEpochDay); index <= monthIndex(toEpochDay); index++) {
    const day = epochDayFromLocalDate(new Date(Math.floor(index / 12), index % 12, 1));
    if (day >= fromEpochDay && day <= toEpochDay) days.push(day);
  }
  const stride = strideFor(days.length);
  return days
    .filter((day) => monthIndex(day) % stride === 0)
    .map((day) => ({ epochDay: day, position: 0, monthsSinceOnset: null }));
}

/** The axis.

    `anchorEpochDay` is the HRT start (personalEffectWindow.ts's hrtAnchor),
    or null where there is none - which is a state the screen has to draw
    rather than refuse, since somebody can notice a change before they are
    on anything, and somebody restoring a journal may not have typed a
    regimen in yet. */
export function noticedAxis(
  changes: readonly NoticedChange[],
  anchorEpochDay: number | null,
  todayEpochDay: number
): NoticedAxis {
  const noticedDays = changes.map((change) => change.firstNoticedEpochDay);

  const toEpochDay = Math.max(todayEpochDay, ...noticedDays);
  const reach = Math.min(anchorEpochDay ?? Infinity, ...noticedDays, todayEpochDay);
  const fromEpochDay = Math.min(reach, toEpochDay - AXIS_MIN_SPAN_DAYS);

  const span = toEpochDay - fromEpochDay;
  const positionOf = (epochDay: number) => (epochDay - fromEpochDay) / span;

  const marks: NoticedMark[] = [...changes]
    .sort((a, b) =>
      a.firstNoticedEpochDay === b.firstNoticedEpochDay
        ? a.label.localeCompare(b.label)
        : a.firstNoticedEpochDay - b.firstNoticedEpochDay
    )
    .map((change) => ({ ...change, position: positionOf(change.firstNoticedEpochDay), lane: 0 }));

  /* Lowest free lane, left to right: a mark stands on the line itself
     wherever the last mark in that lane is far enough behind it, and climbs
     only as far as it has to. A cluster therefore reads as a stack in the
     order it happened, and the line goes back to one row as soon as the
     cluster is past. */
  const lastInLane: number[] = [];
  for (const mark of marks) {
    let lane = 0;
    while (lane < lastInLane.length && mark.position - lastInLane[lane] < MARK_MIN_GAP) lane++;
    lastInLane[lane] = mark.position;
    mark.lane = lane;
  }

  const ticks =
    anchorEpochDay === null
      ? calendarTicks(fromEpochDay, toEpochDay)
      : onsetTicks(anchorEpochDay, fromEpochDay, toEpochDay);

  return {
    mode: anchorEpochDay === null ? 'calendar' : 'onset',
    fromEpochDay,
    toEpochDay,
    todayPosition: positionOf(todayEpochDay),
    ticks: ticks.map((tick) => ({ ...tick, position: positionOf(tick.epochDay) })),
    marks,
    lanes: lastInLane.length
  };
}
