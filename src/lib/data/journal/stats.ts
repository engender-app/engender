/* The stats area (ticket 10, ADR-0012): every aggregate the stats screen,
   the calendar and the recap read, computed in SQL and returned in native
   units.

   Native units is the rule this module is built around. Mood comes back on
   1 to 5 because that is what was logged; a dimension comes back within its
   own range. Nothing here rescales anything to make two metrics look alike -
   that job belongs to metricScale.ts, whose output drives colour and is
   never shown as a number. The demo store mixed the two and ended up
   answering "the metric's average" with mood, with mood x 20, and with mood
   x 20 again from three different functions.

   Ranges arrive as two epoch days rather than a length in days, and the
   streak takes today as an argument: the journal never reads the clock for
   a domain answer, so every case here is a plain deterministic fixture.

   Nothing is stored. A recap is recomputed from entries, tags, milestones
   and dimension values every time it is opened (ADR-0010). */

import { normalize } from '../metricScale';
import type { SqliteDriver } from '../sqlite/driver';

export interface DayAverage {
  day: number;
  /** The day's entries averaged, in native units (CONTEXT: Day average). */
  value: number;
  /** How many entries went into the average, so a screen can say "avg of 2". */
  count: number;
}

export interface TagInsight {
  /** No label: a built-in tag stores a key and its wording comes from the
      message catalogue at display time (ticket 05). */
  id: string;
  count: number;
  withAvg: number;
  withoutAvg: number;
}

export interface RecapMilestone {
  id: string;
  name: string;
  epochDay: number;
}

export interface DimensionChange {
  key: string;
  from: number;
  to: number;
  /** `to - from`, in the dimension's own units. Signed: which way a gender
      dimension moved is not better or worse (F15), only different. */
  change: number;
}

export interface Recap {
  entryCount: number;
  /** 1 to 5, or null when nothing in the range carried a mood. */
  averageMood: number | null;
  /** The longest run of consecutive days with an entry inside the range -
      not the run ending today, which is what `streak()` answers. */
  bestStreak: number;
  topTags: { id: string; count: number }[];
  milestones: RecapMilestone[];
  biggestDimensionChange: DimensionChange | null;
}

export interface StatsArea {
  /** One point per day that carried the metric, oldest first. Both ends of
      the range are inclusive. A metric nothing was logged against - a
      dimension since hidden, an archive from a build that knew a key this
      one does not - yields no points rather than an error. */
  dayAverages(metric: string, fromEpochDay: number, toEpochDay: number): Promise<DayAverage[]>;
  /** Tags carrying at least three valued entries in the range, with the
      metric's average across the entries that carry them and across the
      entries that do not, sorted by the size of the difference. Hidden tags
      are left out: the list is something to act on, and a hidden tag is out
      of every place a user picks things (CONTEXT: Hidden). */
  tagInsights(metric: string, fromEpochDay: number, toEpochDay: number): Promise<TagInsight[]>;
  /** The run of consecutive days ending today or yesterday on which at
      least one entry exists (CONTEXT: Streak). Today counts as unbroken
      until today is over, and backdating into a gap repairs the run. */
  streak(todayEpochDay: number): Promise<number>;
  recap(fromEpochDay: number, toEpochDay: number): Promise<Recap>;
}

/* Which rows carry "the metric", as a subquery plus its parameters. Mood
   is a column on the entry and a dimension value is a row in a join table,
   so the two cannot be parameterised into one statement - but everything
   downstream only wants (entry, day, value), which is what this hands
   back. A dimension key that matches nothing simply selects no rows. */
function metricValues(metric: string): { sql: string; params: (string | number)[] } {
  if (metric === 'mood') {
    return {
      sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, e.mood AS value
            FROM entry e WHERE e.mood IS NOT NULL`,
      params: []
    };
  }
  return {
    sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, edv.value AS value
          FROM entry e
          JOIN entry_dimension_value edv ON edv.entry_id = e.id
          JOIN gender_dimension gd ON gd.id = edv.dimension_id
          WHERE gd.key = ?`,
    params: [metric]
  };
}

export function makeStatsArea(driver: SqliteDriver): StatsArea {
  const bestStreakIn = async (fromEpochDay: number, toEpochDay: number): Promise<number> => {
    /* Gaps and islands: number the days in order and group by day - rn.
       Consecutive days share that difference, a gap starts a new group, so
       the largest group is the longest run. */
    const rows = await driver.query<{ n: number }>(
      `WITH days AS (SELECT DISTINCT epoch_day AS day FROM entry WHERE epoch_day BETWEEN ? AND ?),
            numbered AS (SELECT day, ROW_NUMBER() OVER (ORDER BY day) AS rn FROM days)
       SELECT COUNT(*) AS n FROM numbered GROUP BY day - rn ORDER BY n DESC LIMIT 1`,
      [fromEpochDay, toEpochDay]
    );
    return rows[0]?.n ?? 0;
  };

  return {
    async dayAverages(metric, fromEpochDay, toEpochDay) {
      const v = metricValues(metric);
      const rows = await driver.query<{ day: number; value: number; count: number }>(
        `WITH v AS (${v.sql})
         SELECT epoch_day AS day, AVG(value) AS value, COUNT(*) AS count FROM v
         WHERE epoch_day BETWEEN ? AND ?
         GROUP BY epoch_day ORDER BY epoch_day`,
        [...v.params, fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({ day: r.day, value: r.value, count: r.count }));
    },

    async tagInsights(metric, fromEpochDay, toEpochDay) {
      /* "Without" is per tag, so it cannot be one grouped pass: each row's
         comparison set is every valued entry in the range that does not
         carry that tag, which is what the two correlated subqueries count
         and average.

         The three-entry floor counts entries carrying the metric, not
         entries carrying the tag: an average over two numbers says nothing,
         and a tagged entry with no mood on it contributes neither. */
      const v = metricValues(metric);
      const rows = await driver.query<{
        id: string;
        count: number;
        with_avg: number;
        without_avg: number;
      }>(
        `WITH v AS (${v.sql}),
              r AS (SELECT entry_id, value FROM v WHERE epoch_day BETWEEN ? AND ?)
         SELECT COALESCE(t.key, t.uuid) AS id,
                COUNT(*) AS count,
                AVG(r.value) AS with_avg,
                (SELECT AVG(o.value) FROM r o
                  WHERE o.entry_id NOT IN (SELECT entry_id FROM entry_tag WHERE tag_id = t.id)) AS without_avg,
                (SELECT COUNT(*) FROM r o
                  WHERE o.entry_id NOT IN (SELECT entry_id FROM entry_tag WHERE tag_id = t.id)) AS without_count
         FROM r
         JOIN entry_tag et ON et.entry_id = r.entry_id
         JOIN tag t ON t.id = et.tag_id
         WHERE t.hidden = 0
         GROUP BY t.id
         HAVING count >= 3 AND without_count > 0
         ORDER BY ABS(with_avg - without_avg) DESC, id`,
        [...v.params, fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({
        id: r.id,
        count: r.count,
        withAvg: r.with_avg,
        withoutAvg: r.without_avg
      }));
    },

    async streak(todayEpochDay) {
      /* Same numbering trick as bestStreakIn, counted from the newest day
         backwards: day + rn is constant across the leading run and drops at
         the first gap, so counting the rows that still match the newest
         day's value counts that run and nothing else.

         `latest` is empty unless the newest day is today or yesterday, and
         the cross join then yields no rows at all - which is how "the run
         ended before yesterday" comes back as zero rather than as a stale
         streak. Entries dated in the future are excluded outright; a
         mistyped date must not inflate a streak. */
      const rows = await driver.query<{ n: number }>(
        `WITH days AS (SELECT DISTINCT epoch_day AS day FROM entry WHERE epoch_day <= ?),
              numbered AS (SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn FROM days),
              latest AS (SELECT day FROM numbered WHERE rn = 1 AND day >= ? - 1)
         SELECT COUNT(*) AS n FROM numbered, latest
         WHERE numbered.day + numbered.rn = latest.day + 1`,
        [todayEpochDay, todayEpochDay]
      );
      return rows[0]?.n ?? 0;
    },

    async recap(fromEpochDay, toEpochDay) {
      const range = [fromEpochDay, toEpochDay];

      const totals = await driver.query<{ entry_count: number; average_mood: number | null }>(
        `SELECT COUNT(*) AS entry_count, AVG(mood) AS average_mood FROM entry
         WHERE epoch_day BETWEEN ? AND ?`,
        range
      );

      /* Hidden tags are counted here, unlike in the insights: a recap reads
         back what the month held, and hiding a tag removes it from the
         places a user picks things, not from the past (CONTEXT: Hidden). */
      const topTagRows = await driver.query<{ id: string; count: number }>(
        `SELECT COALESCE(t.key, t.uuid) AS id, COUNT(*) AS count
         FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE e.epoch_day BETWEEN ? AND ?
         GROUP BY t.id ORDER BY count DESC, id LIMIT 3`,
        range
      );

      const milestoneRows = await driver.query<{ id: string; name: string; epoch_day: number }>(
        `SELECT uuid AS id, name, epoch_day FROM milestone
         WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id`,
        range
      );

      /* First and last value per dimension, ordered the way the timeline
         orders entries. A hidden dimension is left out: this is the app
         choosing an axis to show, and choosing one the user has put away
         would be volunteering it back. */
      const changes = await driver.query<{
        key: string;
        min_value: number;
        max_value: number;
        first_value: number;
        last_value: number;
      }>(
        `WITH v AS (
           SELECT gd.key AS key, gd.min_value AS min_value, gd.max_value AS max_value, edv.value AS value,
                  ROW_NUMBER() OVER (PARTITION BY gd.id ORDER BY e.epoch_day, e.timestamp, e.id) AS first_rn,
                  ROW_NUMBER() OVER (PARTITION BY gd.id ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC) AS last_rn,
                  COUNT(*) OVER (PARTITION BY gd.id) AS n
           FROM entry e
           JOIN entry_dimension_value edv ON edv.entry_id = e.id
           JOIN gender_dimension gd ON gd.id = edv.dimension_id
           WHERE e.epoch_day BETWEEN ? AND ? AND gd.hidden = 0
         )
         SELECT key, min_value, max_value,
                MAX(CASE WHEN first_rn = 1 THEN value END) AS first_value,
                MAX(CASE WHEN last_rn = 1 THEN value END) AS last_value
         FROM v WHERE n > 1 GROUP BY key, min_value, max_value`,
        range
      );

      /* Ranked by how far the value moved through its own range, because a
         20-point move on a 0-100 axis and a 3-point move on a 0-10 one are
         not comparable as numbers - and then reported in native units,
         which is the only form anyone is shown (ADR-0012). */
      const biggestDimensionChange =
        changes
          .map((c) => ({
            key: c.key,
            from: c.first_value,
            to: c.last_value,
            change: c.last_value - c.first_value,
            span: Math.abs(
              normalize(c.last_value, { min: c.min_value, max: c.max_value }) -
                normalize(c.first_value, { min: c.min_value, max: c.max_value })
            )
          }))
          .sort((a, b) => b.span - a.span || a.key.localeCompare(b.key))
          .map(({ key, from, to, change }) => ({ key, from, to, change }))[0] ?? null;

      return {
        entryCount: totals[0].entry_count,
        averageMood: totals[0].average_mood,
        bestStreak: await bestStreakIn(fromEpochDay, toEpochDay),
        topTags: topTagRows.map((t) => ({ id: t.id, count: t.count })),
        milestones: milestoneRows.map((r) => ({ id: r.id, name: r.name, epochDay: r.epoch_day })),
        biggestDimensionChange
      };
    }
  };
}
