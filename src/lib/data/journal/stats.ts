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

   Ranges arrive as two epoch days rather than a length in days: the journal
   never reads the clock for a domain answer, so every case here is a plain
   deterministic fixture.

   Nothing is stored. A recap is recomputed from entries, tags, milestones
   and dimension values every time it is opened (ADR-0010). */

import { epochDayFromTimestamp, startOfDayTimestamp } from '../epochDay';
import type { ConstellationReading } from '../constellationData';
import { normalize } from '../metricRange';
import type { SqliteDriver } from '../sqlite/driver';
import type { BodyRegionAxis, Photo, TallyKind } from '../types';
import { EUPHORIA_TAG_KEYS } from '../vocabulary/builtins';
import { getRegionSomaticBreakdown, type RegionSomaticBreakdown } from './bodyMapQueries';
import { bool, entryPresentationFilter } from './support';

export interface DayAverage {
  day: number;
  /** The day's entries averaged, in native units (CONTEXT: Day average). */
  value: number;
  /** How many entries went into the average, so a screen can say "avg of 2". */
  count: number;
}

export interface DaySpread {
  day: number;
  /** The lowest and the highest value the day's entries carried, in native
      units (CONTEXT: Spread). Equal when the day only ever said one thing,
      which is a day with no ground covered rather than a missing answer -
      whether that draws a mark is the screen's rule, not this read's. */
  low: number;
  high: number;
  /** The day's earliest and latest reading, in the order they were logged.
      Not the same pair as `low` and `high` past two readings, and not the
      same order even at two: a day that ran 5 then 2 has `low` 2 and
      `first` 5. The calendar's split draws these (Alicja, 2026-09-02:
      chronological, earliest half on the left) and every word the app
      writes about a spread draws the two above. */
  first: number;
  last: number;
  /** How many entries the ends were taken from, the same count
      `dayAverages` reports for the same day. */
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

interface RecapMilestone {
  id: string;
  name: string;
  epochDay: number;
}

interface DimensionChange {
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
interface RecapPhoto extends Photo {
  epochDay: number;
}

/** How many photos a recap picks out of the range. Four fills a thumbnail
    row on the narrowest screen the app supports and reads as a handful
    rather than a gallery; the photo grid (media/photos) is where every
    photo lives. */
const RECAP_PHOTO_HIGHLIGHTS = 4;

export interface Recap {
  entryCount: number;
  /** 1 to 5, or null when nothing in the range carried a mood. */
  averageMood: number | null;
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
  /** The same days `dayAverages` answers for, reporting each one's lowest
      and highest value instead of its middle (phase 6 unprompted ticket 11,
      CONTEXT: Spread). One row per day that carried the metric, oldest
      first, both ends of the range inclusive.

      A separate read rather than two more fields on `DayAverage`: a day's
      middle is what the week strip, the charts, the correlation cards and
      every wrapped ask for, and none of them has anywhere to put an end.
      One query for the range either way - what the calendar could not
      afford is a query per day.

      Descriptive only. Which end came first, and which entry the day
      "really" was, are questions this deliberately cannot answer. */
  daySpread(metric: string, fromEpochDay: number, toEpochDay: number): Promise<DaySpread[]>;
  /** Every entry in the range carrying a value on both named scales, oldest
      first, both ends inclusive (phase 5 deepening ticket 19, ADR-0048).

      One row per entry rather than one per day, which is the difference
      between this and `dayAverages` above and the whole reason it is a
      separate read: the constellation plots readings, and averaging two
      entries from one day would place a point at a pair of values nobody
      logged. Two entries on one day are two points.

      An entry that carries only one of the two scales has no position on a
      plane and is absent, the same way a day that said nothing is absent
      from `dayAverages`. Its presentation travels with it and is null as
      often as not - that is a resting state, and the chart draws the point
      uncoloured rather than dropping it.

      Mood is deliberately not addressable here, unlike `dayAverages`: it
      has its own colour system (ADR-0025) and its own cards, and the two
      axes this answers are the person's own scales. */
  constellationReadings(
    xKey: string,
    yKey: string,
    fromEpochDay: number,
    toEpochDay: number
  ): Promise<ConstellationReading[]>;
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
  recap(fromEpochDay: number, toEpochDay: number): Promise<Recap>;
  /** One point per day a body region (bodyMap.ts) carried an intensity on
      the named axis in the range, oldest first, both ends inclusive - the
      same shape as `dayAverages`, so a body-map trend reuses the same chart
      (ticket 09). Not folded into `dayAverages` itself: a region key and a
      dimension key share no namespace, and a garbage region should read as
      "nothing logged" rather than risk colliding with a real dimension's
      key.

      One axis per call rather than both at once (ticket 31), because the
      two are independent: a day can carry a euphoria and no dysphoria, so
      the two series have their own days and their own counts and nothing
      here pairs them up. A caller drawing both asks twice and the chart
      overlays the results. Days where the axis is null are absent, not
      zero - "said nothing" is not "said none".

      `presentationId` filters by entry.presentation_id (ADR-0048, ticket
      18): omitted or absent keeps every entry - the unfiltered view, byte
      for byte what this returned before the filter existed - `null` keeps
      only entries carrying no presentation, and a uuid keeps only that
      one's. This is the read that answers "does this region feel different
      depending on how I am presenting". */
  bodyRegionTrend(
    region: string,
    axis: BodyRegionAxis,
    fromEpochDay: number,
    toEpochDay: number,
    presentationId?: string | null
  ): Promise<DayAverage[]>;
  /** Multi-track somatic breakdown for an anatomical zone (phase 5 ticket 08).
      `presentationId` is ticket 18's same filter, forwarded to
      getRegionSomaticBreakdown. */
  bodyRegionBreakdown(region: string, presentationId?: string | null): Promise<RegionSomaticBreakdown>;
  /** One point per day at least one completed wear session started in the
      range, oldest first, both ends inclusive - the same DayAverage shape
      as bodyRegionTrend, so a wear-time trend overlays the same chart
      (phase 5 ticket 04). `value` is the day's average wear duration in
      hours (native units for this metric), averaged only over sessions
      whose duration is known - a live session still running has nothing to
      average yet. A session is attributed to the day it started even when
      it ran past midnight, the same rule dose_event's own timestamp-only
      attribution follows: nothing here re-derives a different day from how
      long a session lasted. Grouped in JS rather than SQL, because
      wear_session carries a raw timestamp and not a stored epoch_day
      column, the same reason dose_event has no per-day trend of its own in
      SQL either. */
  wearTimeTrend(fromEpochDay: number, toEpochDay: number): Promise<DayAverage[]>;
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
  /** Every body-region reading on one axis in the range, both ends
      inclusive, oldest first (phase 8 features ticket 15).

      Not bodyRegionTrend: that answers "how did one region go", averaging a
      day's entries into a point, and this answers "which single readings
      stood out", which needs the reading itself and the entry it was logged
      on. A day where a region was logged twice is two readings here and one
      point there, and the marker they feed stands for the entry somebody
      taps through to.

      Every region at once rather than one call each, because the caller has
      no list of regions to iterate and a hidden region's readings still
      chart (bodyRegions.ts). Unfiltered by presentation: a hormone curve is
      not a per-presentation surface (ADR-0048). */
  bodyRegionReadings(axis: BodyRegionAxis, fromEpochDay: number, toEpochDay: number): Promise<RegionReading[]>;
  /** Every distinct day in the range on which at least one untrashed entry
      carried `presentationId` (ADR-0048), oldest first. The presentation
      chip on tally, wear, voice and calendar reads this to highlight a
      day; it never removes one - the chart it is passed to draws exactly
      what it drew before, and this only says which of those days to mark
      (ticket 17). A day nothing was logged under this presentation on is
      simply absent, not a day of the chart it filters out. */
  presentationDays(presentationId: string, fromEpochDay: number, toEpochDay: number): Promise<number[]>;
  /** How many entries in the range carry each tag, largest first, both ends
      inclusive (phase 8 UX ticket 03, ADR-0058).

      **Every** tag, uncapped, which is the whole reason this exists beside
      `recap()`'s `topTags` rather than reusing it. That one ends `LIMIT 3`,
      which is right for a retrospective naming a few tags and wrong for a
      ring: a parts-of-a-whole form computes each share against the sum of
      what it is handed, so a top three drawn as a full circle inflates every
      share and can never show the remainder ADR-0058 requires. Capping is the
      ring's own job (`charts/parts.ts`), and it can only do it over the whole.

      An entry carrying two tags counts once under each, so the total is tag
      uses rather than entries - which is what a share by tag is a share of.
      Hidden tags are left out, the same rule `tagInsights` follows: a hidden
      tag is out of every place a person picks things (CONTEXT: Hidden), and a
      slice of the ring is a place it would be back. */
  tagShare(fromEpochDay: number, toEpochDay: number): Promise<{ id: string; count: number }[]>;
}

/** One body-region reading, as the day that stood out is judged and drawn.
    `region` is the region's domain id and not its name: a built-in's words
    live in paraglide and this tier does not import it (ADR-0016, ADR-0024),
    so whoever draws it resolves the name. */
export interface RegionReading {
  region: string;
  entryId: number;
  epochDay: number;
  value: number;
}

/** The mood scale is 1 to 5 (CONTEXT: Mood); 3 is its midpoint and the bar
    a day's average mood has to clear for on-this-day (CONTEXT: Good day). */
const GOOD_DAY_MOOD_FLOOR = 3;

/** The body-region intensity scale is 0 to 100 (bodyMap.ts); 50 is its
    midpoint and the bar a single region's euphoria has to clear, on any one
    entry, for both the good-day rule below and entries.counterevidencePool
    (phase 5 ticket 44, CONTEXT: "Good day", "Euphoria capture" - amended).
    Named apart from the euphoria tags' own good-day clause: a region is a
    magnitude a person can log without a euphoria tag at all, so it needs its
    own floor rather than reusing GOOD_DAY_MOOD_FLOOR's shape or piggybacking
    on EUPHORIA_TAG_KEYS. Compared inclusively (`>=`), the same convention
    GOOD_DAY_MOOD_FLOOR itself uses. */
export const GOOD_DAY_REGION_EUPHORIA_FLOOR = 50;

/* Which rows carry "the metric", as a subquery plus its parameters. Mood
   is a column on the entry and a dimension value is a row in a join table,
   so the two cannot be parameterised into one statement - but everything
   downstream only wants (entry, day, value), which is what this hands
   back. A dimension key that matches nothing simply selects no rows.

   The fragment's own parameter comes first in every statement that embeds
   it, because the fragment opens the statement: callers pass
   `[...params, ...their own]` and must keep it that way round.

   `ordinal` is the entry's own clock, and only `spreadByDay` reads it: the
   calendar draws a two-reading day chronologically, earliest half on the
   left (Alicja, 2026-09-02), which is a question about order and not about
   size. Ties break on the entry id, the same pair `constellationReadings`
   orders by, so two entries stamped the same second still have one
   answer. `bodyRegionValues` below carries no ordinal because nothing asks
   a body region for its order. */
function metricValues(metric: string): { sql: string; params: (string | number)[] } {
  if (metric === 'mood') {
    return {
      sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, e.mood AS value, e.timestamp AS ordinal
            FROM entry e WHERE e.mood IS NOT NULL AND e.trashed_at IS NULL`,
      params: []
    };
  }
  return {
    sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, edv.value AS value, e.timestamp AS ordinal
          FROM entry e
          JOIN entry_dimension_value edv ON edv.entry_id = e.id
          JOIN gender_dimension gd ON gd.id = edv.dimension_id
          WHERE gd.key = ? AND e.trashed_at IS NULL`,
    params: [metric]
  };
}

/* A body region is a plain TEXT column, not a row to join against
   (bodyMap.ts), so this needs no dimension-style key resolution - just the
   entry_body_region rows for one region key.

   The axis names a column rather than binding a parameter, so it is a
   closed union and not a caller's string: nothing user-supplied reaches
   the SQL. `IS NOT NULL` is what keeps an unlogged axis out of the average
   entirely instead of dragging it towards zero.

   `presentationId` is entryPresentationFilter's three-state filter
   (ADR-0048, ticket 18), appended after the region's own parameter. */
function bodyRegionValues(
  region: string,
  axis: BodyRegionAxis,
  presentationId?: string | null
): { sql: string; params: (string | number)[] } {
  const presFilter = entryPresentationFilter(presentationId);
  return {
    sql: `SELECT e.id AS entry_id, e.epoch_day AS epoch_day, ebr.${axis} AS value
          FROM entry e
          JOIN entry_body_region ebr ON ebr.entry_id = e.id
          WHERE ebr.region = ? AND ebr.${axis} IS NOT NULL AND e.trashed_at IS NULL${presFilter.sql}`,
    params: [region, ...presFilter.params]
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

  /* Deliberately the same fragment, the same window and the same grouping
     as averageByDay above: the calendar draws both on one cell, so a day
     one of them counts and the other does not is a cell contradicting
     itself. MIN and MAX over the same rows AVG runs over is what makes
     that true by construction rather than by two statements agreeing. */
  const spreadByDay = async (
    values: { sql: string; params: (string | number)[] },
    fromEpochDay: number,
    toEpochDay: number
  ): Promise<DaySpread[]> => {
    /* Deliberately the same fragment, the same window and the same grouping
       as averageByDay above: the calendar draws both on one cell, so a day
       one of them counts and the other does not is a cell contradicting
       itself. MIN and MAX over the same rows AVG runs over is what makes
       that true by construction rather than by two statements agreeing.

       The two ends come back twice over, and they are two different
       questions. `low` and `high` are the day's smallest and largest, which
       is what the words say. `first` and `last` are its earliest and latest,
       which is what the split draws - and on a day of two readings those are
       the same pair in a different order, while on a day of three they are
       not the same pair at all. The frame is the whole partition on both
       sides, so LAST_VALUE answers the day rather than the row. */
    const rows = await driver.query<{
      day: number;
      low: number;
      high: number;
      first_value: number;
      last_value: number;
      entries: number;
    }>(
      `WITH metric_value AS (${values.sql}),
            in_range AS (
              SELECT epoch_day, value,
                     FIRST_VALUE(value) OVER day_order AS first_value,
                     LAST_VALUE(value) OVER day_order AS last_value
              FROM metric_value
              WHERE epoch_day BETWEEN ? AND ?
              WINDOW day_order AS (
                PARTITION BY epoch_day ORDER BY ordinal, entry_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
              )
            )
       SELECT epoch_day AS day, MIN(value) AS low, MAX(value) AS high, COUNT(*) AS entries,
              MIN(first_value) AS first_value, MIN(last_value) AS last_value
       FROM in_range
       GROUP BY epoch_day ORDER BY epoch_day`,
      [...values.params, fromEpochDay, toEpochDay]
    );
    return rows.map((r) => ({
      day: r.day,
      low: r.low,
      high: r.high,
      first: r.first_value,
      last: r.last_value,
      count: r.entries
    }));
  };

  return {
    async dayAverages(metric, fromEpochDay, toEpochDay) {
      return averageByDay(metricValues(metric), fromEpochDay, toEpochDay);
    },

    async daySpread(metric, fromEpochDay, toEpochDay) {
      return spreadByDay(metricValues(metric), fromEpochDay, toEpochDay);
    },

    async constellationReadings(xKey, yKey, fromEpochDay, toEpochDay) {
      /* Two joins onto the same pair of tables, one per axis, which is what
         makes this an inner join on both: an entry reaches the plane only
         by carrying both readings. Ordered by day and then by timestamp
         because the order is the chart's only clock - neither axis is a
         date, so the path is drawn in the sequence rows come back in. */
      const rows = await driver.query<{
        uuid: string;
        epoch_day: number;
        x: number;
        y: number;
        presentation_id: string | null;
      }>(
        `SELECT e.uuid, e.epoch_day, xv.value AS x, yv.value AS y, e.presentation_id
         FROM entry e
         JOIN entry_dimension_value xv ON xv.entry_id = e.id
         JOIN gender_dimension gx ON gx.id = xv.dimension_id AND gx.key = ?
         JOIN entry_dimension_value yv ON yv.entry_id = e.id
         JOIN gender_dimension gy ON gy.id = yv.dimension_id AND gy.key = ?
         WHERE e.trashed_at IS NULL AND e.epoch_day BETWEEN ? AND ?
         ORDER BY e.epoch_day, e.timestamp, e.id`,
        [xKey, yKey, fromEpochDay, toEpochDay]
      );
      // Rebuilt rather than returned, for averageByDay's own reason: a
      // driver row is a null-prototype object and nothing past this seam
      // should have to know that.
      return rows.map((row) => ({
        id: row.uuid,
        day: row.epoch_day,
        x: row.x,
        y: row.y,
        presentationId: row.presentation_id
      }));
    },

    async bodyRegionTrend(region, axis, fromEpochDay, toEpochDay, presentationId) {
      return averageByDay(bodyRegionValues(region, axis, presentationId), fromEpochDay, toEpochDay);
    },

    async bodyRegionBreakdown(region, presentationId) {
      return getRegionSomaticBreakdown(driver, region, presentationId);
    },

    async wearTimeTrend(fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ start_timestamp: number; duration_ms: number }>(
        `SELECT start_timestamp, duration_ms FROM wear_session
         WHERE duration_ms IS NOT NULL AND start_timestamp >= ? AND start_timestamp < ?`,
        [startOfDayTimestamp(fromEpochDay), startOfDayTimestamp(toEpochDay + 1)]
      );

      const byDay = new Map<number, { totalMs: number; sessions: number }>();
      for (const row of rows) {
        const day = epochDayFromTimestamp(row.start_timestamp);
        const bucket = byDay.get(day) ?? { totalMs: 0, sessions: 0 };
        bucket.totalMs += row.duration_ms;
        bucket.sessions += 1;
        byDay.set(day, bucket);
      }

      return [...byDay.entries()]
        .map(([day, { totalMs, sessions }]) => ({ day, value: totalMs / sessions / 3600000, count: sessions }))
        .sort((a, b) => a.day - b.day);
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

    async bodyRegionReadings(axis, fromEpochDay, toEpochDay) {
      // The axis names a column rather than binding a parameter, the same
      // closed-union trick bodyRegionValues uses above: nothing a caller
      // supplies reaches the SQL.
      const rows = await driver.query<{ region: string; entry_id: number; epoch_day: number; value: number }>(
        `SELECT ebr.region AS region, e.id AS entry_id, e.epoch_day AS epoch_day, ebr.${axis} AS value
         FROM entry e
         JOIN entry_body_region ebr ON ebr.entry_id = e.id
         WHERE ebr.${axis} IS NOT NULL AND e.trashed_at IS NULL AND e.epoch_day BETWEEN ? AND ?
         ORDER BY e.epoch_day, e.id`,
        [fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({ region: r.region, entryId: r.entry_id, epochDay: r.epoch_day, value: r.value }));
    },

    async tagShare(fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ id: string; entries: number }>(
        `SELECT COALESCE(t.key, t.uuid) AS id, COUNT(*) AS entries
         FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE e.epoch_day BETWEEN ? AND ? AND e.trashed_at IS NULL AND t.hidden = 0
         GROUP BY t.id ORDER BY entries DESC, id`,
        [fromEpochDay, toEpochDay]
      );
      return rows.map((r) => ({ id: r.id, count: r.entries }));
    },

    async presentationDays(presentationId, fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ day: number }>(
        `SELECT DISTINCT epoch_day AS day FROM entry
         WHERE presentation_id = ? AND epoch_day BETWEEN ? AND ? AND trashed_at IS NULL
         ORDER BY epoch_day`,
        [presentationId, fromEpochDay, toEpochDay]
      );
      return rows.map((r) => r.day);
    },

    async entryCountsByDay(fromEpochDay, toEpochDay) {
      const rows = await driver.query<{ day: number; entries: number }>(
        `SELECT epoch_day AS day, COUNT(*) AS entries FROM entry
         WHERE epoch_day BETWEEN ? AND ? AND trashed_at IS NULL
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

    async recap(fromEpochDay, toEpochDay) {
      const range = [fromEpochDay, toEpochDay];

      const totals = await driver.query<{ entry_count: number; average_mood: number | null }>(
        `SELECT COUNT(*) AS entry_count, AVG(mood) AS average_mood FROM entry
         WHERE epoch_day BETWEEN ? AND ? AND trashed_at IS NULL`,
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
         WHERE e.epoch_day BETWEEN ? AND ? AND e.trashed_at IS NULL
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
           WHERE e.epoch_day BETWEEN ? AND ? AND gd.hidden = 0 AND e.trashed_at IS NULL
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
      const photoRows = await driver.query<{ uuid: string; file_path: string; epoch_day: number; starred: number }>(
        `WITH dated AS (
           SELECT p.uuid AS uuid, p.file_path AS file_path, p.starred AS starred,
                  COALESCE(e.epoch_day, m.epoch_day) AS epoch_day,
                  p.order_index AS order_index, p.id AS id
           FROM photo p
           LEFT JOIN entry e ON e.id = p.entry_id
           LEFT JOIN milestone m ON m.id = p.milestone_id
           WHERE COALESCE(e.epoch_day, m.epoch_day) BETWEEN ? AND ?
             AND (p.entry_id IS NULL OR e.trashed_at IS NULL)
         ),
         bucketed AS (
           SELECT uuid, file_path, starred, epoch_day, order_index, id,
                  NTILE(?) OVER (ORDER BY epoch_day, order_index, id) AS bucket
           FROM dated
         ),
         picked AS (
           SELECT uuid, file_path, starred, epoch_day, order_index, id,
                  ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY epoch_day, order_index, id) AS rn
           FROM bucketed
         )
         SELECT uuid, file_path, starred, epoch_day FROM picked
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
        topTags: topTagRows.map((t) => ({ id: t.id, count: t.entries })),
        milestones: milestoneRows.map((r) => ({ id: r.id, name: r.name, epochDay: r.epoch_day })),
        biggestDimensionChange,
        photoHighlights: photoRows.map((r) => ({
          id: r.uuid,
          fileName: r.file_path,
          starred: bool(r.starred),
          epochDay: r.epoch_day
        }))
      };
    },

    async isGoodDay(epochDay) {
      // Two independent EXISTS checks, OR'd rather than read back as two
      // round trips: a day either clears the mood average or carries a
      // euphoria capture, and the rule only needs to know that one of them
      // did. COALESCE(key, uuid) is a tag's domain id (ADR-0002);
      // EUPHORIA_TAG_KEYS is all three built-in euphoria capture tags
      // (ticket 02/09, phase 5 ticket 32, CONTEXT: Euphoria capture) - a
      // day carrying any one of them clears this half of the bar, not only
      // the general tag.
      const placeholders = EUPHORIA_TAG_KEYS.map(() => '?').join(', ');
      const rows = await driver.query<{ good: number }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM entry WHERE epoch_day = ? AND mood IS NOT NULL AND trashed_at IS NULL
             GROUP BY epoch_day HAVING AVG(mood) >= ?
           )
           OR EXISTS (
             SELECT 1 FROM entry e
             JOIN entry_tag et ON et.entry_id = e.id
             JOIN tag t ON t.id = et.tag_id
             WHERE e.epoch_day = ? AND COALESCE(t.key, t.uuid) IN (${placeholders}) AND e.trashed_at IS NULL
           )
           OR EXISTS (
             SELECT 1 FROM entry e
             JOIN entry_body_region ebr ON ebr.entry_id = e.id
             WHERE e.epoch_day = ? AND ebr.euphoria >= ? AND e.trashed_at IS NULL
           ) AS good`,
        [
          epochDay,
          GOOD_DAY_MOOD_FLOOR,
          epochDay,
          ...EUPHORIA_TAG_KEYS,
          epochDay,
          GOOD_DAY_REGION_EUPHORIA_FLOOR
        ]
      );
      return Boolean(rows[0]?.good);
    }
  };
}
