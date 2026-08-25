/* What the two wrapped presentations draw, written once (phase 5 UX ticket
   23).

   WrappedCompact and WrappedYear are deliberately unalike - a week's worth
   of data supports a different shape from a year's - but the four sections
   spec 06 added are the same readings on both, and the arithmetic for them
   was the same twenty lines in each file. This is that, once: the tag
   insight bars, the two tally bars, and the two ways this app writes a
   number.

   Naming is next door in recapDisplay.ts, which owns turning a stored key
   into a word. This owns turning an answer into a row. */

import { m } from '$lib/paraglide/messages';
import type { BarRow } from '$lib/components/kit/barRow';
import type { WrappedTagInsight, WrappedTallyCounts } from './wrappedSections';

/** A value in its metric's own units (ADR-0012). Mood arrives on 1 to 5 and
    wants a decimal place; a dimension arrives in its own range and does not. */
export function nativeValue(metric: string, value: number): string {
  return metric === 'mood' ? value.toFixed(1) : String(Math.round(value));
}

/** A movement, with its direction on the front.

    Signed and never coloured: which way a scale moved is not better or
    worse (F15, ADR-0012), so the sign is the whole of what says which way.
    The minus is U+2212, the mathematical minus, because a hyphen at this
    size reads as a dash and docs/ui-copy.md has no dashes in it. */
export function signedValue(value: number, format: (n: number) => string): string {
  return `${value >= 0 ? '+' : '−'}${format(Math.abs(value))}`;
}

/** The tag insights as bars.

    Length comes from the size of the movement and never from its direction:
    the two ends of a scale are not better and worse, so a tag that went with
    lower days draws the same length as one that went with higher and says
    which way in its own number. */
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
    amount: Math.abs(insight.delta)
  }));
}

/** The two tally counts as bars.

    Two counts side by side, with no ratio between them and no direction
    named: the counters never combine into a score (journal/stats.ts, ticket
    10), and a retrospective is where that rule is most tempting to break. */
export function tallyRows(tally: WrappedTallyCounts | null): BarRow[] {
  if (!tally) return [];
  return [
    {
      key: 'misgendered',
      name: m.tally_misgendered(),
      value: String(tally.misgendered),
      amount: tally.misgendered
    },
    {
      key: 'correctly_gendered',
      name: m.tally_correctly_gendered(),
      value: String(tally.correctlyGendered),
      amount: tally.correctlyGendered
    }
  ];
}

/** Which stripe each area of a wrapped takes (DIRECTION.md, "flag colour
    reaches the whole app, categorically").

    Every chart shares role 0, which is the brief's own exception rather than
    a shortcut: "colour that carries a value takes role 0", because roles run
    a flag's colours before its shades and index 0 is the only one guaranteed
    to be a colour on all 8 palettes. Taken in reading order instead, a chart
    landed on trans's white band, and white bars on a dark card read as a set
    of disabled bars rather than as the flag.

    The lists take the stripes after it, where an achromatic band costs
    nothing: a tinted disc and a row wash carry no reading, and ticket 20
    already gave every tinted shape a hairline so it stays a shape.

    One table for both presentations, so the year and the week cannot drift
    into colouring the same reading differently. */
export const WRAPPED_AREA_ROLE = { charts: 0, figures: 1, milestones: 2 } as const;
