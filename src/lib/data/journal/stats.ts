/* The stats area (ticket 10, ADR-0012): every aggregate the stats screen,
   the calendar and the recap read, computed in SQL and returned in native
   units.

   Native units is the rule this module is built around. Mood comes back on
   1 to 5 because that is what was logged; a dimension comes back within its
   own range. Nothing here rescales anything to make two metrics look alike -
   that job belongs to metricRange.ts, whose output drives colour and is
   never shown as a number. The demo store mixed the two and ended up
   answering "the metric's average" with mood, with mood x 20, and with mood
   x 20 again from three different functions.

   Ranges arrive as two epoch days rather than a length in days, and the
   streak takes today as an argument: the journal never reads the clock for
   a domain answer, so every case here is a plain deterministic fixture.

   Nothing is stored. A recap is recomputed from entries, tags, milestones
   and dimension values every time it is opened (ADR-0010). */

import { normalize } from '../metricRange';
import type { SqliteDriver } from '../sqlite/driver';
import type { Photo, TallyKind } from '../types';

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

/** A photo from the range, with the day it belongs to so a screen can date
    it. Enough to draw a thumbnail (PhotoThumb takes id and fileName) and no
    more - the bytes stay in the file store.

    Nearly `photos.DatedPhoto`, minus the milestone name that screen needs,
    and photos live on the recap rather than behind a range read of their own
    on purpose: a wrapped is one recomputation of one period, and every
    figure on it coming back from one call is what stops two of them
    disagreeing about the same range. The cost is that `/recap` runs the
    query below without rendering it - one bounded read, four rows. */
export interface RecapPhoto extends Photo {
  epochDay: number;
}

/** How many photos a recap picks out of the range. Four fills a thumbnail
    row on the narrowest screen the app supports and reads as a handful
    rather than a gallery; the photo grid (settings/photos) is where every
    photo lives. */
export const RECAP_PHOTO_HIGHLIGHTS = 4;

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
  /** Up to RECAP_PHOTO_HIGHLIGHTS photos spread across the range, oldest
      first. Spread rather than taken from the top, because the oldest four
      photos of a year are all from January. */
  photoHighlights: RecapPhoto[];
}

export interface StatsArea {
  /** One point per day that carried the metric, oldest first. Both ends of
      the range are inclusive. A metric nothing was logged against - a
      dimension since hidden, an archive from a build that knew a key this
      one does not - yields no points rather than an error. */
  dayAverages(metric: string, fromEpochDay: number, toEpochDay: number): Promise<DayAverage[]>;
  /** How many entries each day in the range holds, oldest first, days with
      none left out. Not the same question as `dayAverages`: the calendar
      shades a day by the metric but links it by whether anything was logged
      at all, so a day of entries that carry no value for that metric still
      has entries. */
  entryCountsByDay(fromEpochDay: number, toEpochDay: number): Promise<{ day: number; count: number }[]>;
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
  /** The longest run in the journal's whole history (CONTEXT: Best streak),
      not just the one ending today - a goal's gentle achievements (phase 4
      features ticket 20) read this rather than `streak()` so that a badge
      earned once stays earned through a later gap. Entries dated in the
      future are excluded, the same rule `streak()` applies. */
  bestStreakEver(todayEpochDay: number): Promise<number>;
  recap(fromEpochDay: number, toEpochDay: number): Promise<Recap>;
  /** One point per day a body region (bodyMap.ts) carried an intensity in
      the range, oldest first, both ends inclusive - the same shape as
      `dayAverages`, so a body-map trend reuses the same chart (ticket 09).
      Not folded into `dayAverages` itself: a region key and a dimension
      key share no namespace, and a garbage region should read as "nothing
      logged" rather than risk colliding with a real dimension's key. */
  bodyRegionTrend(region: string, fromEpochDay: number, toEpochDay: number): Promise<DayAverage[]>;
  /** Whether `epochDay` clears on-this-day's good-day bar (CONTEXT: Good
      day, phase 4 features ticket 03): its day average mood at or above
      the mood scale's midpoint, a euphoria capture logged that day, or
      either. Never both conditions read as a caveat - this is a plain
      yes/no, the way the rule itself is absolute. */
  isGoodDay(epochDay: number): Promise<boolean>;
  /** One point per day a tally kind was logged at least once in the range,
      oldest first, both ends inclusive - the same DayAverage shape as
      dayAverages and bodyRegionTrend, so the tally trend reuses the same
      chart (ticket 10). `value` and `count` are both the day's tap count:
      there is nothing to average, only how many times it happened. */
  tallyTrend(kind: TallyKind, fromEpochDay: number, toEpochDay: number): Promise<DayAverage[]>;
}

/** The mood scale is 1 to 5 (CONTEXT: Mood); 3 is its midpoint and the bar
    a day's average mood has to clear for on-this-day (CONTEXT: Good day). */
export const GOOD_DAY_MOOD_FLOOR = 3;

/* Which rows carry "the metric", as a subquery plus its parameters. Mood
   is a column on the entry and a dimension value is a row in a join table,
   so the two cannot be parameterised into one statement - but everything
   downstream only wants (entry, day, value), which is what this hands
   back. A dimension key that matches nothing simply selects no rows.

   The fragment's own parameter comes first in every statement that embeds
   it, because the fragment opens the statement: callers pass
   `[...params, ...their own]` and must keep it that way round. */
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

/* A body region is a plain TEXT column, not a row to join against
   (bodyMap.ts), so this needs no dimension-style key resolution - just the
   entry_body_region rows for one region key. */
function bodyRegionValues(region: string): { sql: string; params: (string | number)[] } {
  return {
    sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, ebr.intensity AS value
          FROM entry e
          JOIN entry_body_region ebr ON ebr.entry_id = e.id
          WHERE ebr.region = ?`,
    params: [region]
  };
}

export function makeStatsArea(driver: SqliteDriver): StatsArea {
  const averageByDay = async (
    values: { sql: string; params: (string | number)[] },
    fromEpochDay: number,
    toEpochDay: number
  ): Promise<DayAverage[]> => {
    const rows = await driver.query<{ day: number; value: number; entries: number }>(
      `WITH metric_value AS (${values.sql})
       SELECT epoch_day AS day, AVG(value) AS value, COUNT(*) AS entries FROM metric_value
       WHERE epoch_day BETWEEN ? AND ?
       GROUP BY epoch_day ORDER BY epoch_day`,
      [...values.params, fromEpochDay, toEpochDay]
    );
    // Rebuilt rather than returned: a driver row is not a plain object
    // (node:sqlite hands back null-prototype ones), and nothing past this
    // seam should have to know that.
    return rows.map((r) => ({ day: r.day, value: r.value, count: r.entries }));
  };

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
      return averageByDay(metricValues(metric), fromEpochDay, toEpochDay);
    },

    async bodyRegionTrend(region, fromEpochDay, toEpochDay) {
      return averageByDay(bodyRegionValues(region), fromEpochDay, toEpochDay);
    },

    async tallyTrend(kind, fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ day: number; n: number }>(
        `SELECT epoch_day AS day, COUNT(*) AS n FROM tally_event
         WHERE kind = ? AND epoch_day BETWEEN ? AND ?
         GROUP BY epoch_day ORDER BY epoch_day`,
        [kind, fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({ day: r.day, value: r.n, count: r.n }));
    },

    async entryCountsByDay(fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ day: number; entries: number }>(
        `SELECT epoch_day AS day, COUNT(*) AS entries FROM entry
         WHERE epoch_day BETWEEN ? AND ?
         GROUP BY epoch_day ORDER BY epoch_day`,
        [fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({ day: r.day, count: r.entries }));
    },

    async tagInsights(metric, fromEpochDay, toEpochDay) {
      /* "Without" is per tag - each row's comparison set is every valued
         entry in the range that does not carry that tag - but it does not
         have to be read per tag. A valued entry either carries the tag or
         does not, so the two sets partition the range and the tag's own
         total subtracted from the range's total is exactly the "without"
         total. Two keys are what make that a partition rather than an
         approximation: `entry_tag` is keyed on (entry_id, tag_id), so an
         entry is counted once per tag it carries, and an entry yields at
         most one `in_range` row either way - mood is a column on it, and
         `entry_dimension_value` is keyed on (entry_id, dimension_id)
         against a unique dimension key. That makes this one pass over the
         range and one over the tag links, instead of the correlated pair
         per tag that cost 3.5 seconds over a year (ticket 24).

         Summed rather than averaged, because only sums subtract. The
         `* 1.0` is what keeps the division off the integer path: mood and a
         dimension value are both INTEGER columns, so SUM/COUNT would floor
         an average of 4.5 to 4.

         The three-entry floor counts entries carrying the metric, not
         entries carrying the tag: an average over two numbers says nothing,
         and a tagged entry with no mood on it contributes neither. */
      const values = metricValues(metric);
      const rows = await driver.query<{
        id: string;
        with_count: number;
        with_avg: number;
        without_avg: number;
      }>(
        // COALESCE(key, uuid) is a tag's domain id: a built-in has the key,
        // a custom row has the uuid (ADR-0002), the same rule domainIdOf()
        // applies reading one back out.
        `WITH metric_value AS (${values.sql}),
              in_range AS (SELECT entry_id, value FROM metric_value WHERE epoch_day BETWEEN ? AND ?),
              range_total AS (SELECT COUNT(*) AS entries, SUM(value) AS total FROM in_range),
              per_tag AS (
                SELECT COALESCE(t.key, t.uuid) AS id,
                       COUNT(*) AS with_count,
                       SUM(in_range.value) AS with_total
                FROM in_range
                JOIN entry_tag et ON et.entry_id = in_range.entry_id
                JOIN tag t ON t.id = et.tag_id
                WHERE t.hidden = 0
                GROUP BY t.id),
              compared AS (
                SELECT id, with_count, with_total,
                       range_total.entries - with_count AS without_count,
                       range_total.total - with_total AS without_total
                FROM per_tag, range_total)
         SELECT id,
                with_count,
                with_total * 1.0 / with_count AS with_avg,
                without_total * 1.0 / without_count AS without_avg
         FROM compared
         WHERE with_count >= 3 AND without_count > 0
         ORDER BY ABS(with_avg - without_avg) DESC, id`,
        [...values.params, fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({
        id: r.id,
        count: r.with_count,
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

    async bestStreakEver(todayEpochDay) {
      // The same gaps-and-islands query bestStreakIn runs for a recap's
      // range, just with no lower bound - "ever" is "every day up to
      // today", not a second streak-counting rule to keep in step with it.
      return bestStreakIn(Number.MIN_SAFE_INTEGER, todayEpochDay);
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
      const topTagRows = await driver.query<{ id: string; entries: number }>(
        `SELECT COALESCE(t.key, t.uuid) AS id, COUNT(*) AS entries
         FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE e.epoch_day BETWEEN ? AND ?
         GROUP BY t.id ORDER BY entries DESC, id LIMIT 3`,
        range
      );

      const milestoneRows = await driver.query<{ id: string; name: string; epoch_day: number }>(
        `SELECT uuid AS id, name, epoch_day FROM milestone
         WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id`,
        range
      );

      /* First and last value per dimension, ordered the way the timeline
         orders entries. A hidden dimension is left out: this is the app
         choosing a dimension to show, and choosing one the user has put
         away would be volunteering it back. */
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

      /* One photo from each quarter of the range's photos, so a wrapped
         shows the period's arc instead of its opening days. NTILE does the
         spreading in SQL and the row number inside each bucket picks that
         bucket's earliest photo, which keeps the answer bounded at four
         rows - a decade fixture holds hundreds of photos, and reading them
         all back to drop all but four would be the work this avoids.

         Two left joins and a COALESCE for the same reason photos.inJournal
         has them: exactly one owner column is set (the photo table's
         CHECK), so a milestone's photo dates itself off the milestone and an
         entry's off the entry, in one query rather than two. */
      const photoRows = await driver.query<{ uuid: string; file_path: string; epoch_day: number }>(
        `WITH dated AS (
           SELECT p.uuid AS uuid, p.file_path AS file_path,
                  COALESCE(e.epoch_day, m.epoch_day) AS epoch_day,
                  p.order_index AS order_index, p.id AS id
           FROM photo p
           LEFT JOIN entry e ON e.id = p.entry_id
           LEFT JOIN milestone m ON m.id = p.milestone_id
           WHERE COALESCE(e.epoch_day, m.epoch_day) BETWEEN ? AND ?
         ),
         bucketed AS (
           SELECT uuid, file_path, epoch_day, order_index, id,
                  NTILE(?) OVER (ORDER BY epoch_day, order_index, id) AS bucket
           FROM dated
         ),
         picked AS (
           SELECT uuid, file_path, epoch_day, order_index, id,
                  ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY epoch_day, order_index, id) AS rn
           FROM bucketed
         )
         SELECT uuid, file_path, epoch_day FROM picked
         WHERE rn = 1
         -- The same tie-break the bucketing and the pick used, so "oldest
         -- first" means one order throughout: sorting the survivors by uuid
         -- instead would reshuffle two highlights from the same day into an
         -- order nothing else in the journal agrees with.
         ORDER BY epoch_day, order_index, id`,
        [...range, RECAP_PHOTO_HIGHLIGHTS]
      );

      /* Ranked by how far the value moved through its own range, because a
         20-point move on a 0-100 dimension and a 3-point move on a 0-10
         one are not comparable as numbers - and then reported in native units,
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
        topTags: topTagRows.map((t) => ({ id: t.id, count: t.entries })),
        milestones: milestoneRows.map((r) => ({ id: r.id, name: r.name, epochDay: r.epoch_day })),
        biggestDimensionChange,
        photoHighlights: photoRows.map((r) => ({ id: r.uuid, fileName: r.file_path, epochDay: r.epoch_day }))
      };
    },

    async isGoodDay(epochDay) {
      // Two independent EXISTS checks, OR'd rather than read back as two
      // round trips: a day either clears the mood average or carries the
      // euphoria tag, and the rule only needs to know that one of them did.
      // COALESCE(key, uuid) is a tag's domain id (ADR-0002); 'g-euphoria' is
      // the built-in euphoria capture tag (ticket 02, CONTEXT: Euphoria
      // capture).
      const rows = await driver.query<{ good: number }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM entry WHERE epoch_day = ? AND mood IS NOT NULL
             GROUP BY epoch_day HAVING AVG(mood) >= ?
           )
           OR EXISTS (
             SELECT 1 FROM entry e
             JOIN entry_tag et ON et.entry_id = e.id
             JOIN tag t ON t.id = et.tag_id
             WHERE e.epoch_day = ? AND COALESCE(t.key, t.uuid) = ?
           ) AS good`,
        [epochDay, GOOD_DAY_MOOD_FLOOR, epochDay, 'g-euphoria']
      );
      return Boolean(rows[0]?.good);
    }
  };
}
