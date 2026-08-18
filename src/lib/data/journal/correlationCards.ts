/* The factor-impact correlation cards area (phase 4 ticket 21). A view
   stitched from rows `stats`, `doses` and `dimensions` own, the same way
   exposure.ts is a view over `doses` and `regimen` - this area owns no
   table of its own. The ranking math lives in ../correlationCards.ts,
   tested without a driver; this file only wires it to the rest of the
   journal. */

import type { CorrelationCard, MetricInsights } from '../correlationCards';
import { doseDayInsight, doseDaysFromEvents, rankCorrelationCards } from '../correlationCards';
import { MOOD_RANGE } from '../metricRange';
import type { DimensionsArea } from './dimensions';
import type { DosesArea } from './doses';
import type { StatsArea } from './stats';

/** How many cards the stats screen shows - the same handful its tag
    insights list already caps itself at. */
const CARD_LIMIT = 6;

export interface CorrelationCardsArea {
  /** Descriptive co-occurrence cards over `[fromEpochDay, toEpochDay]`,
      ranked by normalized span and capped at CARD_LIMIT - nothing here is
      stored, every card is recomputed from the dose log, entries and tag
      links each time (ADR-0010). */
  getCards(fromEpochDay: number, toEpochDay: number): Promise<CorrelationCard[]>;
}

export function makeCorrelationCardsArea(stats: StatsArea, doses: DosesArea, dimensions: DimensionsArea): CorrelationCardsArea {
  return {
    async getCards(fromEpochDay, toEpochDay) {
      const [dims, doseEvents] = await Promise.all([dimensions.getDimensions(), doses.getDoses(fromEpochDay, toEpochDay)]);
      const doseDays = doseDaysFromEvents(doseEvents);

      const metricRanges = [
        { key: 'mood', range: MOOD_RANGE },
        ...dims.filter((d) => !d.hidden).map((d) => ({ key: d.key, range: { min: d.min, max: d.max } }))
      ];

      const metrics: MetricInsights[] = await Promise.all(
        metricRanges.map(async ({ key, range }) => {
          const [tagInsights, dayAverages] = await Promise.all([
            stats.tagInsights(key, fromEpochDay, toEpochDay),
            stats.dayAverages(key, fromEpochDay, toEpochDay)
          ]);
          return { metric: key, range, tagInsights, doseDay: doseDayInsight(dayAverages, doseDays) };
        })
      );

      return rankCorrelationCards(metrics, CARD_LIMIT);
    }
  };
}
