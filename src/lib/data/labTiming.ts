/* Where a lab draw fell relative to dosing (phase 4 ticket 03, CONTEXT:
   "Lab draw context"), and whether a chart's points were drawn under
   comparable conditions. Pure, and kept above the journal seam beside
   regimenEpisode.ts and doseSchedule.ts for the same reason: this is a
   question about a draw and a dose, not a row anyone stores. Nothing here
   reads a clock or a database.

   Purely descriptive throughout. This module answers "how long after which
   dose was this drawn" and stops: it names no draw time as better than
   another, no target value, and nothing about a result as favourable. The
   draw-timing helper that would have advised one was rejected outright at
   the phase 4 grilling session (Q15); this records what it would have had
   to know, without the advice. */

import { epochDayFromTimestamp, startOfDayTimestamp, timestampAtLocalTime } from './epochDay';
import type { DoseRoute, LabResult, LabTiming } from './types';

/** A lab draw, as much of it as is known: the calendar day it belongs to
    (ADR-0001) and the local wall-clock time it happened at, when someone
    recorded one. */
export interface LabDraw {
  epochDay: number;
  /** Local wall-clock 'HH:MM', the way reminder times are stored, or null
      when the draw time was not recorded. */
  drawTime: string | null;
}

/** The dose a draw's context is measured from. Only these two fields: the
    route decides which figure the context is, and the timestamp is what it
    is measured from. Route comes from the dose event, whose DoseRoute is a
    closed union - not from the regimen episode, whose route is free text
    and could say anything. */
export interface TimingDose {
  timestamp: number;
  route: DoseRoute;
}

const HOUR = 3600000;

/** The instant a draw happened, or null when its time was not recorded. */
export function drawInstant(draw: LabDraw): number | null {
  return draw.drawTime === null ? null : timestampAtLocalTime(draw.epochDay, draw.drawTime);
}

/** The latest timestamp a dose can carry and still count as preceding this
    draw. With a recorded draw time that is the draw itself; without one it
    is the end of the draw day, because a dose logged on the day of an
    untimed draw precedes it as far as anyone can tell - and excluding it
    would leave a same-day injection out of the interval it started. */
export function drawUpperBound(draw: LabDraw): number {
  return drawInstant(draw) ?? startOfDayTimestamp(draw.epochDay + 1) - 1;
}

/** The draw's dosing context, from `dose` - the most recent dose that
    actually happened at or before `drawUpperBound(draw)`, or null if there
    was none. Callers are responsible for that selection (labs.ts): a
    skipped dose is not a dose this measures from.

    Two figures, because "how long since dosing" means different things by
    pharmacokinetics. Oral, sublingual, patch and gel get hours since the
    dose. IM and SC get day-of-interval instead, since a single-digit-hour
    figure says nothing about a depot with a days-to-weeks half-life.

    Null when nothing can be said: no preceding dose, or an hours route and
    a draw nobody timed. A zero or a "since midnight" figure in either case
    would be this module inventing a fact about someone's bloodwork. */
export function labTimingFor(draw: LabDraw, dose: TimingDose | null): LabTiming | null {
  if (!dose) return null;

  /* An untimed draw sharing its day with the dose is the one case where the
     order of the two events is not recorded anywhere, and guessing it is not
     a rounding error: for an injection the two answers are "day 1" and "day
     15", which is the entire meaning of the figure. The common pattern is a
     morning trough draw followed by that day's injection, where assuming the
     dose came first would report a trough as though it were a peak.
     `drawUpperBound` deliberately admits the dose so a caller does not have
     to know this rule to select one; this is where it is refused. */
  if (draw.drawTime === null && epochDayFromTimestamp(dose.timestamp) === draw.epochDay) return null;

  /* Day-of-interval is a count of calendar days and needs no draw time,
     which is why an untimed draw on a later day still gets a figure here.

     The count comes from the dose log alone - the gap from the last
     injection to the draw, with the injection day as day 1. Not from the
     episode's `interval`, which is free text and cannot be computed from,
     and not from ticket 02's dose_schedule either: a schedule is optional
     and one per episode, so a figure that depended on one would silently go
     missing for anyone who logs injections without setting a schedule. The
     gap between consecutive dose events cannot be the source at all, since
     the interval a fresh draw falls in has no next injection yet. */
  if (dose.route === 'im' || dose.route === 'sc') {
    return { route: dose.route, dayOfInterval: draw.epochDay - epochDayFromTimestamp(dose.timestamp) + 1 };
  }

  const instant = drawInstant(draw);
  if (instant === null) return null;
  return { route: dose.route, hoursSinceDose: (instant - dose.timestamp) / HOUR };
}

/** The axes a lab series' points can disagree on. A **Lab series**
    (CONTEXT.md) folds results into one line by matching unit and nothing
    else, so one line can hold readings taken at opposite ends of an
    injection interval, on different routes, or by different labs.

    The union is derived from the list rather than written out beside it, the
    rule labels.ts sets out: an axis added here without a message for it is
    then a typecheck failure (labContextLabel.ts) instead of an axis that
    silently never reports. */
export const COMPARABILITY_AXES = ['position', 'route', 'provider'] as const;

export type ComparabilityAxis = (typeof COMPARABILITY_AXES)[number];

/** A position two draws either count as the same or they do not. Hours are
    rounded to the whole hour first: comparing the raw fraction would find a
    disagreement in every series of oral results that has ever existed, and
    a flag that is always on says nothing. Rounding is the one
    interpretation this file makes, and it is about the flag only - the
    stored figure keeps its fraction. */
const positionKey = (timing: LabTiming): string =>
  'dayOfInterval' in timing ? `day:${timing.dayOfInterval}` : `hour:${Math.round(timing.hoursSinceDose)}`;

/** Which of the three axes `results` disagree on, in a fixed order. Empty
    means the series is as comparable as this app can tell.

    Only values that are present are compared. Not knowing is not
    disagreeing: every result logged before this feature existed carries no
    timing and no provider, and a flag that fired on their absence would be
    permanently on. Providers are compared as typed, trimmed of surrounding
    whitespace and otherwise left alone - the same rule an analyte's unit
    follows (CONTEXT: "Analyte"), so two spellings of one lab are two
    providers and nothing matches them up. */
export function seriesComparability(results: readonly LabResult[]): ComparabilityAxis[] {
  const values: Record<ComparabilityAxis, Set<string>> = {
    position: new Set(),
    route: new Set(),
    provider: new Set()
  };

  for (const result of results) {
    if (result.timing) {
      values.position.add(positionKey(result.timing));
      values.route.add(result.timing.route);
    }
    const provider = result.provider.trim();
    if (provider) values.provider.add(provider);
  }

  return COMPARABILITY_AXES.filter((axis) => values[axis].size > 1);
}
