/* The tag card's rows, grouped by the scale they were measured on (ticket
   20, "Tagi a zmiany na skali").

   The cards arrive ranked across every scale (correlationCards.ts). One
   list of mixed ranges put "+1,6" on a 1-5 scale beside "+21" on a 0-100
   one, so gap sizes could not be compared down it. Inside one scale they
   can, so each scale is a group of its own, and a bar is sized against the
   largest gap in its group only.

   Two orderings, on two different footings. Rows inside a group rank by
   the raw gap, which is safe because they share a scale. Groups order by
   their largest gap on the footing the cards were ranked by (normalize()
   over the scale's own range), since 1 point of mood and 1 point of a
   0-100 scale are not the same movement. Every number a person reads stays
   native (ADR-0012); this only orders and sizes. */

import { normalize, type MetricRange } from './metricRange';
import type { CorrelationCard } from './correlationCards';

export interface ScaleGroupRow {
  key: string;
  card: CorrelationCard;
  /** withAvg - withoutAvg, native units. */
  gap: number;
  /** Signed bar length, -1 to 1: the gap over the group's largest gap.
      Negative runs left of the zero line, positive right. */
  share: number;
}

export interface ScaleGroup {
  metric: string;
  rows: ScaleGroupRow[];
}

/** A row's key rather than the bare tag id: the same tag ranks under every
    scale it was measured on. */
export const cardKey = (card: CorrelationCard): string =>
  `${card.occurrence.kind}-${card.occurrence.kind === 'tag' ? card.occurrence.id : 'dose'}-${card.metric}`;

export function groupCardsByScale(cards: CorrelationCard[], rangeOf: (metric: string) => MetricRange): ScaleGroup[] {
  const byMetric = new Map<string, CorrelationCard[]>();
  for (const card of cards) {
    const list = byMetric.get(card.metric);
    if (list) list.push(card);
    else byMetric.set(card.metric, [card]);
  }

  const groups = [...byMetric].map(([metric, members]) => {
    const gaps = members.map((card) => ({ card, gap: card.withAvg - card.withoutAvg }));
    const largest = Math.max(...gaps.map((g) => Math.abs(g.gap)));
    const rows: ScaleGroupRow[] = gaps
      .map(({ card, gap }) => ({ key: cardKey(card), card, gap, share: largest > 0 ? gap / largest : 0 }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    const range = rangeOf(metric);
    return { metric, rows, span: normalize(range.min + largest, range) };
  });

  return groups.sort((a, b) => b.span - a.span).map(({ span: _span, ...group }) => group);
}
