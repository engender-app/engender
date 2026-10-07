/* The factor-impact correlation cards area (phase 4 ticket 21). A view
   stitched from rows `stats`, `doses` and `dimensions` own, the same way
   exposure.ts is a view over `doses` and `regimen` - this area owns no
   table of its own. The ranking math lives in ../correlationCards.ts,
   tested without a driver; this file wires it to the rest of the journal
   and runs the one batched query only the cards ask for. */

import type { CorrelationCard, MetricInsights } from '../correlationCards';
import { doseDayInsight, doseDaysFromEvents, rankCorrelationCards } from '../correlationCards';
import { MOOD_RANGE } from '../metricRange';
import type { DimensionsArea } from './dimensions';
import type { DosesArea } from './doses';
import { metricValues, type DayAverage, type TagInsight } from './stats';
import type { SqliteDriver } from '../sqlite/driver';

/** How many cards the stats screen shows - the same handful its tag
    insights list already caps itself at. */
const CARD_LIMIT = 6;

/** Day averages and tag insights for every metric the cards rank - mood and
    each dimension that is not hidden - in two statements however many
    dimensions there are (after-release ticket 30), and without being told
    the dimensions first. `getCards` sends these with its other two reads:
    the worker answers one query at a time, and waiting for the dimensions
    put these two at the back of Look back's queue, the last read its tile
    grid waited on. Here rather than on the stats area because the cards are
    its only reader: stats is composed into the journal at boot, and this
    area is deferred, so the query loads with the screen that shows the
    cards. */
export async function visibleMetricInsights(
  driver: SqliteDriver,
  fromEpochDay: number,
  toEpochDay: number
): Promise<Map<string, MetricInputs>> {
  const mood = metricValues('mood');
  const sql = `SELECT ? AS metric, v.* FROM (${mood.sql}) v
    UNION ALL
    SELECT gd.key AS metric, e.id AS entry_id, e.epoch_day AS epoch_day, edv.value AS value, e.timestamp AS ordinal
    FROM entry e
    JOIN entry_dimension_value edv ON edv.entry_id = e.id
    JOIN gender_dimension gd ON gd.id = edv.dimension_id
    WHERE gd.hidden = 0 AND e.trashed_at IS NULL`;
  return insightsOver(driver, sql, ['mood', ...mood.params], fromEpochDay, toEpochDay, new Map());
}

type MetricInputs = { dayAverages: DayAverage[]; tagInsights: TagInsight[] };

function inputsFor(result: Map<string, MetricInputs>, metric: string): MetricInputs {
  let inputs = result.get(metric);
  if (!inputs) result.set(metric, (inputs = { dayAverages: [], tagInsights: [] }));
  return inputs;
}

async function insightsOver(
  driver: SqliteDriver,
  sql: string,
  params: (string | number)[],
  fromEpochDay: number,
  toEpochDay: number,
  result: Map<string, MetricInputs>
): Promise<Map<string, MetricInputs>> {
  const [averages, tags] = await Promise.all([
    driver.query<{ metric: string; day: number; value: number; entries: number }>(
      `WITH metric_value AS (${sql})
       SELECT metric, epoch_day AS day, AVG(value) AS value, COUNT(*) AS entries FROM metric_value
       WHERE epoch_day BETWEEN ? AND ? GROUP BY metric, epoch_day ORDER BY metric, epoch_day`,
      [...params, fromEpochDay, toEpochDay]
    ),
    driver.query<{ metric: string; id: string; with_count: number; with_avg: number; without_avg: number }>(
      `WITH metric_value AS (${sql}),
            in_range AS (SELECT metric, entry_id, value FROM metric_value WHERE epoch_day BETWEEN ? AND ?),
            range_total AS (SELECT metric, COUNT(*) AS entries, SUM(value) AS total FROM in_range GROUP BY metric),
            per_tag AS (
              SELECT in_range.metric, COALESCE(t.key, t.uuid) AS id,
                     COUNT(*) AS with_count, SUM(in_range.value) AS with_total
              FROM in_range JOIN entry_tag et ON et.entry_id = in_range.entry_id JOIN tag t ON t.id = et.tag_id
              WHERE t.hidden = 0 GROUP BY in_range.metric, t.id),
            compared AS (
              SELECT per_tag.metric, id, with_count, with_total,
                     range_total.entries - with_count AS without_count,
                     range_total.total - with_total AS without_total
              FROM per_tag JOIN range_total ON range_total.metric = per_tag.metric)
       SELECT metric, id, with_count, with_total * 1.0 / with_count AS with_avg,
              without_total * 1.0 / without_count AS without_avg
       FROM compared WHERE with_count >= 3 AND without_count > 0
       ORDER BY metric, ABS(with_avg - without_avg) DESC, id`,
      [...params, fromEpochDay, toEpochDay]
    )
  ]);
  for (const row of averages) inputsFor(result, row.metric).dayAverages.push({ day: row.day, value: row.value, count: row.entries });
  for (const row of tags) inputsFor(result, row.metric).tagInsights.push({ id: row.id, count: row.with_count, withAvg: row.with_avg, withoutAvg: row.without_avg });
  return result;
}

export interface CorrelationCardsArea {
  /** Descriptive co-occurrence cards over `[fromEpochDay, toEpochDay]`,
      ranked by normalized span and capped at CARD_LIMIT - nothing here is
      stored, every card is recomputed from the dose log, entries and tag
      links each time (ADR-0010). */
  getCards(fromEpochDay: number, toEpochDay: number): Promise<CorrelationCard[]>;
}

export function makeCorrelationCardsArea(driver: SqliteDriver, doses: DosesArea, dimensions: DimensionsArea): CorrelationCardsArea {
  return {
    async getCards(fromEpochDay, toEpochDay) {
      const [dims, doseEvents, inputs] = await Promise.all([
        dimensions.getDimensions(),
        doses.getDoses(fromEpochDay, toEpochDay),
        visibleMetricInsights(driver, fromEpochDay, toEpochDay)
      ]);
      const doseDays = doseDaysFromEvents(doseEvents);

      const metricRanges = [
        { key: 'mood', range: MOOD_RANGE },
        ...dims.filter((d) => !d.hidden).map((d) => ({ key: d.key, range: { min: d.min, max: d.max } }))
      ];

      const metrics: MetricInsights[] = metricRanges.map(({ key, range }) => {
        const { tagInsights, dayAverages } = inputs.get(key) ?? { tagInsights: [], dayAverages: [] };
        return { metric: key, range, tagInsights, doseDay: doseDayInsight(dayAverages, doseDays) };
      });

      return rankCorrelationCards(metrics, CARD_LIMIT);
    }
  };
}
