/* Which axis a day chart can be read on, and the keying each one names.

   Two screens draw a day series and both can now re-key it, so the rule
   for what is on offer lives here rather than twice in markup. It is the
   ordinary data gating the app does everywhere else: an axis appears
   because the journal can answer it, never because a preference was
   flipped. Someone who has never logged an injection is not shown a day of
   interval, and someone with no dated procedure is not shown a day since
   one.

   The anchored axes are named per procedure rather than as one "since
   surgery" with a picker beside it. Nothing in the app treats exactly one
   procedure as the current one (CONTEXT.md: Procedure), so with two dated
   procedures a single anchored option would have to choose silently, and
   the axis label would then say "since surgery" and mean a different
   surgery than the reader assumes. "Day since <name>" cannot be misread,
   and it costs no second control. */

import { rekeyDaySeries, type CompletedInterval, type Keying } from '../data/dayKeying';
import type { DayAverage } from '../data/journal/stats';
import { MAX_POSITIONS, atGrain, foldPositionGroup, type Grain } from './grain';

/** A procedure that can anchor an axis: one with a surgery date set. The
    name is the screen's business, so only what the arithmetic needs is
    here. */
export interface SurgeryAnchor {
  id: string;
  surgeryEpochDay: number;
}

/** `calendar` is the day-by-day axis every one of these charts started
    with, `interval` is day of the injection interval, and `since:<uuid>`
    is day since that procedure's surgery day. A string rather than an
    object because it is also a `<select>` value and a grip handle. */
export type DayAxis = 'calendar' | 'interval' | `since:${string}`;

export const CALENDAR_AXIS: DayAxis = 'calendar';

/* The prefix an anchored axis carries its procedure's id behind. Written
   and read only through the two helpers below, so the literal lives in one
   place: it is a `<select>` value, a grip handle and a lookup key at once,
   and three files spelling it themselves is how one of them ends up
   spelling it differently. */
const SINCE_PREFIX = 'since:';

/** The anchored axis for `anchorId`. */
const sinceAxis = (anchorId: string): DayAxis => `${SINCE_PREFIX}${anchorId}`;

/** Which anchor `axis` is keyed to, or `null` if it is not an anchored
    axis at all. */
export function anchorIdOf(axis: DayAxis): string | null {
  return axis.startsWith(SINCE_PREFIX) ? axis.slice(SINCE_PREFIX.length) : null;
}

/** The axes a journal holding `intervals` and `anchors` can offer, calendar
    first and the anchored ones in the order they were given.

    An anchored axis is offered for a procedure with a date even when the
    date is in the future: that axis reads as a countdown, which is a real
    thing to look at and is what someone waiting on an operation has. */
export function availableAxes(
  intervals: readonly CompletedInterval[],
  anchors: readonly SurgeryAnchor[]
): DayAxis[] {
  return [
    CALENDAR_AXIS,
    ...(intervals.length > 0 ? (['interval'] as const) : []),
    ...anchors.map((anchor) => sinceAxis(anchor.id))
  ];
}

/** The keying `axis` names, or `null` where there is nothing to re-key by -
    the calendar axis, or an axis whose procedure or dose log has since gone
    away. `null` is the signal to draw the calendar axis, so a procedure
    deleted or an axis stored from another journal falls back to the reading
    every chart started with rather than to an empty card. */
export function keyingFor(
  axis: DayAxis,
  intervals: readonly CompletedInterval[],
  anchors: readonly SurgeryAnchor[],
  todayEpochDay: number
): Keying | null {
  if (axis === 'interval') return intervals.length > 0 ? { type: 'repeating', intervals } : null;

  const anchorId = anchorIdOf(axis);
  if (anchorId === null) return null;

  const anchor = anchors.find((candidate) => candidate.id === anchorId);
  return anchor ? { type: 'anchored', anchorEpochDay: anchor.surgeryEpochDay, todayEpochDay } : null;
}

/** A day series ready to draw, whichever axis it landed on.

    One shape rather than a union per axis, because a screen reads `axis` to
    pick a scrub label and passes `points` on either way, and an
    `{:else if}` chain over a two-arm union is a narrowing trap here
    (a Svelte snippet only drops an arm whose discriminant is a single
    literal). */
export interface AxisPlot {
  axis: 'calendar' | 'position';
  /** How coarse the calendar buckets are; `null` on a position axis, where
      the grain question is `width` instead. */
  grain: Grain | null;
  /** How many positions each mark covers. 1 on a calendar axis and on any
      position axis short enough to draw a mark per position. */
  width: number;
  /** `x` is an epoch day on the calendar axis and a position on a re-keyed
      one - which is exactly the substitution re-keying is, and why the
      charts below need no change to draw either. */
  points: { x: number; y: number }[];
}

/** `group` drawn on the axis `keying` names, or on the calendar axis when
    `keying` is `null`.

    A group rather than one series at a time, so that every series on the
    screen folds at one width - see `foldPositionGroup`. On the calendar
    axis the grain already agreed across a group, because it is read off the
    span and the span is the screen's, so that path is what each series did
    before this existed.

    Re-key first, then fold. The other order would fold calendar days into
    weeks and then ask which position a week fell on, which has no
    answer. */
export function plotDaySeriesGroup(
  group: readonly (readonly DayAverage[])[],
  keying: Keying | null,
  spanInDays: number,
  maxPositions: number = MAX_POSITIONS
): AxisPlot[] {
  if (keying === null) {
    return group.map((series) => {
      const grained = atGrain(
        series.map((point) => ({ x: point.day, y: point.value })),
        spanInDays,
        maxPositions
      );
      return {
        axis: 'calendar' as const,
        grain: grained.grain,
        width: 1,
        points: grained.points.map((point) => ({ x: point.x, y: point.y }))
      };
    });
  }

  const folded = foldPositionGroup(
    group.map((series) => rekeyDaySeries(series, keying)),
    maxPositions
  );

  return folded.group.map((series) => ({
    axis: 'position' as const,
    grain: null,
    width: folded.width,
    points: series.map((point) => ({ x: point.position, y: point.value }))
  }));
}
