/* How a re-keyed axis is written (phase 8 features ticket 16).

   The rule for what axis is on offer and what it keys by is in
   $lib/charts/dayAxis.ts, which stays Node-tier safe and so imports no
   paraglide (ADR-0016). The words are here, beside the components that draw
   them, which is the same split chartAnnotation.ts keeps from
   charts/annotations.ts.

   Two screens draw a day series and both can re-key it, so the labels are
   written once. Descriptive only: a position label says which day and stops.
   Nothing here says a reading rose, fell or responded, and nothing puts the
   anchoring event and a value in the same phrase - "day 4 since surgery"
   names a day, "dysphoria down by day 4" would be the causal claim the
   ticket rules out, made by a label rather than by the data. */

import { m } from '$lib/paraglide/messages';
import { fmtDay } from '$lib/data/dates';
import type { AxisPlot } from '$lib/charts/dayAxis';
import { CALENDAR_AXIS, anchorIdOf, type DayAxis } from '$lib/charts/dayAxis';
import type { Grain } from '$lib/charts/grain';

/** A procedure that can anchor an axis, as the picker needs it: the
    arithmetic wants the day, an option wants the name. */
export interface AnchorOption {
  id: string;
  name: string;
  surgeryEpochDay: number;
}

/** What `axis` is called in the picker. An anchored axis is named after its
    own procedure, so two of them can never be told apart only by order. */
export function dayAxisLabel(axis: DayAxis, anchors: readonly AnchorOption[]): string {
  if (axis === CALENDAR_AXIS) return m.chart_axis_calendar();
  if (axis === 'interval') return m.chart_axis_interval();
  const anchor = anchors.find((candidate) => candidate.id === anchorIdOf(axis));
  return m.chart_axis_since({ name: anchor?.name ?? '' });
}

/** The picker's options, in the order `availableAxes` returned them. */
export function dayAxisOptions(
  axes: readonly DayAxis[],
  anchors: readonly AnchorOption[]
): { value: string; label: string }[] {
  return axes.map((axis) => ({ value: axis, label: dayAxisLabel(axis, anchors) }));
}

/* A week bucket is labelled by the six days after its start, so the two
   ends of the label are the days the bucket actually covers. */
const GRAIN_WEEK_SPAN = 6;

function calendarLabel(grain: Grain, day: number): string {
  const short = { day: 'numeric', month: 'short' } as const;
  if (grain === 'day') return fmtDay(day, { weekday: 'short', ...short });
  if (grain === 'month') return fmtDay(day, { month: 'long', year: 'numeric' });
  return `${fmtDay(day, short)} - ${fmtDay(day + GRAIN_WEEK_SPAN, short)}`;
}

/** What one position is called.

    Four forms rather than one signed number, because "Day -12" is
    arithmetic and "Day 12 before" is what somebody waiting on an operation
    would say. All four lead with the same word so the two ends written
    under a plot stay parallel - "Day 209 before" against "Days 396 to 406",
    not "209 days before" against "Days 396 to 406" - and leading with
    Day/Days is also what carries the number's agreement, which is why
    neither before-form needs a plural of its own.

    The case analysis is closed: a bucket is entirely before the anchor or
    entirely from it onward and never both, because foldPositionGroup lays
    its buckets off zero for exactly this reason.

    A folded bucket is named by its own span rather than by the days inside
    it actually carrying a reading, which is the convention the calendar
    axis already follows - a week bucket reads "3 Sep - 9 Sep" whether one
    day in it was logged or all seven. */
function positionLabel(width: number, position: number): string {
  const last = position + width - 1;
  if (position < 0) {
    return width === 1
      ? m.chart_axis_day_before({ days: String(-position) })
      : m.chart_axis_days_before({ from: String(-position), to: String(-last) });
  }
  return width === 1
    ? m.chart_axis_day({ day: String(position) })
    : m.chart_axis_days({ from: String(position), to: String(last) });
}

/** What the scrubbed position under a finger is called, on whichever axis
    `plot` landed on. */
export function dayAxisScrubLabel(plot: AxisPlot): (point: { x: number }) => string {
  if (plot.axis === 'calendar') {
    const grain = plot.grain ?? 'day';
    return (point) => calendarLabel(grain, point.x);
  }
  return (point) => positionLabel(plot.width, point.x);
}

/** The two ends written under the plot. On a calendar axis they are the
    range's own dates; on a re-keyed one they are the first and last position
    drawn, which is the only honest pair - the range picker is gone by then
    and the days behind a position are not contiguous. */
export function dayAxisEnds(
  plot: AxisPlot,
  calendarFrom: number,
  calendarTo: number
): { from: string; to: string } {
  if (plot.axis === 'calendar') {
    const short = { day: 'numeric', month: 'short' } as const;
    return { from: fmtDay(calendarFrom, short), to: fmtDay(calendarTo, short) };
  }
  const first = plot.points[0];
  const last = plot.points[plot.points.length - 1];
  if (!first || !last) return { from: '', to: '' };
  return { from: positionLabel(plot.width, first.x), to: positionLabel(plot.width, last.x) };
}
