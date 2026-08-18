/* Factor-impact correlation cards (phase 4 ticket 21, CONTEXT: "Dose
   event"). Phase 3's spec ruled out "scale-relationship or correlation
   analysis" outright; phase 4's spec revisits that call on purpose - a
   deliberate reversal, not scope drift the phase 3 decision missed.

   Two roles, not four independent factor kinds. The ticket names four
   factors a card can be built from - a tag, a dimension, a dose-log day,
   a mood value - but every one of its own examples ("dose day against
   mood", "a tag against a gender dimension") pairs an occurrence (a tag
   or a dose was logged that day) against a value (mood's or a
   dimension's day average). Modelling it as those two roles covers all
   four named factors as two of each, rather than needing a case for
   every pair among four.

   Ranked by normalized span (metricRange.ts's normalize(), the same rule
   stats.ts's recap() uses to pick its biggest dimension change) so a
   3-point move on a 0-10 dimension can outrank a 20-point move on a
   0-100 one - but every average a card carries stays native (ADR-0012);
   normalize() here only orders cards; it is never what's shown on one. */

import { normalize, type MetricRange } from './metricRange';
import { epochDayFromTimestamp } from './epochDay';
import type { DayAverage, TagInsight } from './journal/stats';
import type { DoseEvent } from './types';

export type CorrelationOccurrence = { kind: 'tag'; id: string } | { kind: 'doseDay' };

export interface CorrelationCard {
  occurrence: CorrelationOccurrence;
  metric: string;
  count: number;
  withAvg: number;
  withoutAvg: number;
}

/** An occurrence needs at least this many valued entries to say anything -
    the same floor stats.ts's tagInsights uses, so the two features agree
    on what counts as enough evidence to show. */
const MIN_OCCURRENCE_ENTRIES = 3;

/** Which epoch days carried a dose, in the device's local timezone
    (epochDay.ts) - a skipped dose never happened, the same rule
    exposureCounters.ts's dose totals apply. */
export function doseDaysFromEvents(doseEvents: DoseEvent[]): Set<number> {
  return new Set(doseEvents.filter((d) => d.status !== 'skipped').map((d) => epochDayFromTimestamp(d.timestamp)));
}

/** The dose-day occurrence's with/without average over a metric's day
    averages, entry-weighted the same way tagInsights' SQL is:
    `value * count` reconstructs the day's value total, since
    `dayAverages` already folded a multi-entry day into one point. Null
    below the evidence floor or with nothing on the other side to compare
    against - an average over two numbers, or over everything, says
    nothing. */
export function doseDayInsight(
  dayAverages: DayAverage[],
  doseDays: Set<number>
): { count: number; withAvg: number; withoutAvg: number } | null {
  let withTotal = 0;
  let withCount = 0;
  let withoutTotal = 0;
  let withoutCount = 0;
  for (const p of dayAverages) {
    if (doseDays.has(p.day)) {
      withTotal += p.value * p.count;
      withCount += p.count;
    } else {
      withoutTotal += p.value * p.count;
      withoutCount += p.count;
    }
  }
  if (withCount < MIN_OCCURRENCE_ENTRIES || withoutCount === 0) return null;
  return { count: withCount, withAvg: withTotal / withCount, withoutAvg: withoutTotal / withoutCount };
}

export interface MetricInsights {
  metric: string;
  range: MetricRange;
  tagInsights: TagInsight[];
  doseDay: { count: number; withAvg: number; withoutAvg: number } | null;
}

/** Every card across every metric, ranked by normalized span and capped
    at `limit` - the stats screen shows a handful of the most notable
    pairings, not every one the range happens to produce. */
export function rankCorrelationCards(metrics: MetricInsights[], limit: number): CorrelationCard[] {
  const spanned = metrics.flatMap(({ metric, range, tagInsights, doseDay }) => {
    const cards: (CorrelationCard & { span: number })[] = tagInsights.map((t) => ({
      occurrence: { kind: 'tag', id: t.id },
      metric,
      count: t.count,
      withAvg: t.withAvg,
      withoutAvg: t.withoutAvg,
      span: Math.abs(normalize(t.withAvg, range) - normalize(t.withoutAvg, range))
    }));
    if (doseDay) {
      cards.push({
        occurrence: { kind: 'doseDay' },
        metric,
        count: doseDay.count,
        withAvg: doseDay.withAvg,
        withoutAvg: doseDay.withoutAvg,
        span: Math.abs(normalize(doseDay.withAvg, range) - normalize(doseDay.withoutAvg, range))
      });
    }
    return cards;
  });

  return spanned
    .sort((a, b) => b.span - a.span)
    .slice(0, limit)
    .map(({ span: _span, ...card }) => card);
}
