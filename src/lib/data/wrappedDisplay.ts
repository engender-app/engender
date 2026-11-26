/* Share tag insight bars and number formatting across Compact and Year
   Wrapped. nativeValue also formats Stats numbers, and the calendar uses
   spreadNote. recapDisplay.ts maps stored keys to labels; this module
   formats readings for display. */

import { fmtNumber } from './dates';
import { m } from '$lib/paraglide/messages';
import type { BarRow } from '$lib/components/kit/barRow';
import type { DaySpread } from './journal/stats';
import { coveredGround } from './statsCharts';
import type { WrappedTagInsight } from './wrappedSections';

/** `value` rounded to the precision `nativeValue` prints it at (ADR-0012):
    one decimal for mood, none for a dimension.

    Anything measured from `value` itself instead of this - a bar's length,
    a sort key - draws at a precision the reader was never shown, and two
    rows that print the same number stop agreeing on which is longer.
    */
export function nativeAmount(metric: string, value: number): number {
  return metric === 'mood' ? Math.round(value * 10) / 10 : Math.round(value);
}

/** A value in its metric's own units (ADR-0012). Mood arrives on 1 to 5 and
    wants a decimal place; a dimension arrives in its own range and does not. */
export function nativeValue(metric: string, value: number): string {
  const amount = nativeAmount(metric, value);
  return fmtNumber(amount === 0 ? 0 : amount, metric === 'mood' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });
}

/** A day's two ends in words, or null for a day that covered no ground
    (phase 6 unprompted ticket 11, CONTEXT: Spread).

    Written once because two surfaces say it: the calendar reads it out on
    the cell it marks, and the values sheet on /stats prints it beside the
    day's average. Both are native units (ADR-0012) - the mark's geometry is
    the only normalized half of this feature - and both leave the day's order
    unsaid, because the read cannot answer which end came first. */
export function spreadNote(metric: string, spread: Pick<DaySpread, 'low' | 'high'> | undefined): string | null {
  if (!coveredGround(spread)) return null;
  return m.day_spread({ low: nativeValue(metric, spread.low), high: nativeValue(metric, spread.high) });
}

/** A movement, with its direction on the front.

    Signed and never coloured: which way a scale moved is not better or
    worse (F15, ADR-0012), so the sign is the whole of what says which way.
    The minus is U+2212, the mathematical minus, because a hyphen at this
    size reads as a dash and docs/ui-copy.md has no dashes in it. */
export function signedValue(value: number, format: (n: number) => string): string {
  return `${value >= 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

/**
 * Bar lengths use absolute differences. A separate signed number gives
 * direction without treating one scale endpoint as better.
 *
 * Name the shared metric once in ChartCard's heading: a picker on /stats
 * and fixed text on Wrapped. Correlation cards have a metric per row;
 * these rows share one. Repeating a two-ended label added 108px at 390px
 * for Dysphoria ↔ euphoria. Five built-in dimensions are two-ended and
 * custom names have no length bound.
 */
export function tagInsightRows(
  insights: (WrappedTagInsight & { label: string })[],
  metric: string
): BarRow[] {
  const format = (value: number) => nativeValue(metric, value);
  return insights.map((insight) => ({
    key: insight.id,
    name: insight.label,
    note: m.insight_row_sub({
      count: String(insight.count),
      with: format(insight.withAvg),
      without: format(insight.withoutAvg)
    }),
    value: signedValue(insight.delta, format),
    amount: nativeAmount(metric, Math.abs(insight.delta))
  }));
}

/** Which stripe each area of a wrapped takes (DIRECTION.md, "flag colour
    reaches the whole app, categorically").

    Every chart shares role 0, which is the brief's own exception rather than
    a shortcut: "colour that carries a value takes role 0", because roles run
    a flag's colours before its shades and index 0 is the only one guaranteed
    to be a colour on every palette. Taken in reading order instead, a chart
    landed on trans's white band, and white bars on a dark card read as a set
    of disabled bars rather than as the flag.

    The lists take the stripes after it, where an achromatic band costs
    nothing: a tinted disc and a row wash carry no reading, and ticket 20
    already gave every tinted shape a hairline so it stays a shape.

    One table for both presentations, so the year and the week cannot drift
    into colouring the same reading differently. */
export const WRAPPED_AREA_ROLE = { charts: 0, figures: 1, milestones: 2 } as const;
