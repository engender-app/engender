/* Which areas search reaches, and what text each of them holds (phase 5
   deepening ticket 24, ADR-0005, ADR-0027, CONTEXT: "Search").

   `/search` searched entries. That was right when the entry note was most of
   the text in the app, and it is not any more: the journal now holds letters
   to a future self, milestone names, procedure notes, appointment questions,
   felt-sense reflections, roadmap goals, affirmations, size fit notes and a
   dozen other things somebody wrote in their own words. None of it was
   findable. Somebody who remembers writing something and not where they
   wrote it had nowhere to type it.

   A registry rather than a screen that names twenty areas, for the reason
   the two registries before it are (ADR-0027, ADR-0031): the alternative is
   a list a new area is silently missing from, with no test able to notice.
   An area declares what text it holds and how to reach it; adding one later
   is a registration.

   What one entry declares:

     key      the hit's own kind, which is what the screen groups by and
              what searchHitRows.ts gives words and an icon to
     covers    which archive sections this one accounts for, which is what
              makes "every area holding text is searchable" checkable rather
              than remembered - see SEARCH_OPT_OUTS below
     tables    the tables the read touches, so the live layer's dependency
              list is derived from the registry rather than maintained beside
              it (writes.ts, the same single-sourcing DAY_TABLES gets)
     from      the table, or the join, the text lives in
     uuid      the travelling id (ADR-0002), which is what a hit navigates by
     date      the row's own day, and in what form - see SearchDate
     columns   the text columns, in the order a hit prefers them when more
              than one matched
     context   one more column the presentation needs and cannot derive: a
              checklist's owner kind, a felt sense's tryout. Nothing else.
     where     a restriction the area itself imposes, with its parameters.
              One area has one: a sealed letter is not searchable.

   **How the matching happens, and why it is not FTS5.** The entry note has a
   contentless FTS index behind it because a decade of notes is the one text
   in this app that is genuinely large (entries.ts). None of these areas is:
   a person has tens of letters, hundreds of side effects, one or two
   procedures. So they are matched by scanning, with the fold applied to the
   column inside SQL (fold.ts's foldedSql) and LIKE over the folded query.
   Two consequences worth stating rather than discovering:

     - matching here is substring, not whole-token prefix. "erapy" finds
       "therapy" in a letter and does not find it in a note. That is the
       index's narrowing showing through, the same asymmetry tag labels have
       always had (searchQuery.ts), and ADR-0005's folding is still the whole
       matching rule - no stemming, no ranking, no score.
     - nothing is indexed, so nothing has to be reindexed. There is no
       second write path to keep in step, and no plaintext leaves the
       encrypted database (ADR-0020): the scan happens inside SQLite, which
       is also why the fold has a SQL spelling at all.

   **The cost, and the strategy chosen for it.** One statement, not twenty.
   Every area is a branch of one UNION ALL with a uniform projection, so a
   search is one round trip whatever the registry grows to - which matters
   most where it is a bridge call rather than a function call (ADR-0020's
   Android driver). The compound select carries the LIMIT, so a search reads
   a page and stops. Measured against the ten-year fixture as
   `search-everywhere` in tests/long-journal (budgets.json carries the
   number); entries stay on their own FTS query beside it, as the screen has
   always run them.

   It is a pure read. Searching writes nothing - no recent-searches history,
   no index, no counter - and textSearch.test.ts holds that against the
   driver rather than leaving it to be noticed.

   Wording is not here. A hit's area label, icon and destination live in
   components/searchHitRows.ts, the same split day.ts keeps from dayRows.ts
   and for the same reason: this file stays Node-tier safe by importing no
   paraglide (ADR-0016). */

import { epochDayFromTimestamp, startOfDayTimestamp } from '../epochDay';
import { foldedSql, foldText } from '../fold';
import type { TableName } from '../live/writes';
import type { SqliteDriver } from '../sqlite/driver';
import type { ArchiveSectionName } from './archiveSections';

/** How a row is dated, which decides how the range filter reaches it and
    how the hits are ordered.

    Two forms because two shapes exist below this seam and neither converts
    into the other in SQL: most areas store the local calendar day
    (ADR-0001), and the wear log stores the moment its session started. A
    local day cannot be derived from a timestamp in SQLite without trusting
    its `localtime` modifier, which this app never does - so a timestamp
    column is filtered by the day boundaries the caller's side computes, and
    converted to a day on the way out.

    `null` is for an area whose text belongs to no day at all: a roadmap
    goal, an affirmation, a checklist nobody dated. Those are never narrowed
    by a range and sort after everything that has a date. */
export type SearchDate =
  | { kind: 'epochDay'; column: string }
  | { kind: 'timestamp'; column: string }
  | null;

/** What the caller asks of a search. `today` arrives rather than being read
    off a clock, for the reason every dated read here takes it (ADR-0001). */
export interface SearchRequest {
  /** What somebody typed, unfolded. */
  query: string;
  today: number;
  /** The same range the entry filters use, and it narrows dated areas only. */
  startEpochDay?: number | null;
  endEpochDay?: number | null;
  /** How many hits to return across every area. */
  limit: number;
}

/** One hit, in the terms every area shares. `value` is the text that
    matched, whole - the window around the match is the screen's business
    (searchQuery.ts's matchWindow). */
export interface SearchHit {
  /** The registered area's key, which is the hit's kind. */
  area: string;
  /** The record's travelling id (ADR-0002), which is what a hit navigates
      by where its area has a screen per record. */
  id: string;
  epochDay: number | null;
  value: string;
  /** Whatever the area declared it needs to place the hit, or null. */
  context: string | null;
}

/** One area's declaration that its text is searchable. Erased over nothing -
    every area answers in the same shape - so unlike the day registry there
    is no per-area row type to keep honest. What `section` below adds is the
    literal `covers`, which is what the opt-out record is checked against. */
export interface SearchArea {
  key: string;
  covers: readonly string[];
  tables: readonly TableName[];
  from: string;
  uuid: string;
  date: SearchDate;
  columns: readonly string[];
  context?: string;
  where?: { sql: string; params(request: SearchRequest): unknown[] };
}

/** Keeps `covers` from widening at the declaration site.

    `const` for the reason day.ts's is: declared as a plain
    `readonly ArchiveSectionName[]` it widens to every section name, which
    makes `Covered` below the whole union, `Exclude` empty, and the opt-out
    record accept anything at all - a compile-time check that silently
    checks nothing. */
function area<const Covers extends readonly ArchiveSectionName[]>(declared: {
  key: string;
  covers: Covers;
  tables: readonly TableName[];
  from: string;
  uuid: string;
  date: SearchDate;
  columns: readonly string[];
  context?: string;
  where?: { sql: string; params(request: SearchRequest): unknown[] };
}) {
  return declared;
}

const AREAS = [
  /* A letter is sealed until its unlock day (letterStatus.ts), and search is
     not a way around that. The seal is the point of the feature - somebody
     writes to a self they cannot answer yet - so a sealed letter's text is
     not matched at all, which is the same call day.ts made when it left
     letters off a day. */
  area({
    key: 'letters',
    covers: ['letters'],
    tables: ['letter'],
    from: 'letter',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['text'],
    where: { sql: 'unlock_epoch_day <= ?', params: ({ today }) => [today] }
  }),
  area({
    key: 'milestones',
    covers: ['milestones'],
    tables: ['milestone'],
    from: 'milestone',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['name']
  }),
  /* The name first and the notes second: a journey searched for by name
     should show its name, and the notes are where a paragraph lives. Dated
     by the surgery day, which is null until one is set - so an undated
     journey is still findable, and sorts with the rest of the undated. */
  area({
    key: 'procedures',
    covers: ['procedures'],
    tables: ['procedure'],
    from: 'procedure',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'surgery_epoch_day' },
    columns: ['name', 'notes']
  }),
  /* Every question anybody wrote for an appointment, and every line of a
     procedure's recovery checklist - one table, and the owner is what says
     which screen the hit belongs to (checklists.ts). Dated by the
     appointment where there is one. */
  area({
    key: 'checklistItems',
    covers: ['checklists'],
    tables: ['checklist'],
    from: 'checklist_item ci JOIN checklist c ON c.id = ci.checklist_id',
    uuid: 'ci.uuid',
    date: { kind: 'epochDay', column: 'c.appointment_epoch_day' },
    columns: ['ci.content'],
    context: 'c.owner_kind'
  }),
  area({
    key: 'sideEffects',
    covers: ['sideEffects'],
    tables: ['sideEffect'],
    from: 'side_effect',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['name']
  }),
  /* A felt sense hangs off a tryout or off a milestone (feltSense.ts), and
     the hit has to go back to whichever one - so the tryout's travelling id
     is the context, and a null one means the owner is a milestone. */
  area({
    key: 'feltSense',
    covers: ['feltSenseEntries'],
    tables: ['feltSense', 'tryout'],
    from: 'felt_sense fs LEFT JOIN tryout t ON t.id = fs.tryout_id',
    uuid: 'fs.uuid',
    date: { kind: 'epochDay', column: 'fs.epoch_day' },
    columns: ['fs.note'],
    context: 't.uuid'
  }),
  area({
    key: 'tryouts',
    covers: ['tryouts'],
    tables: ['tryout'],
    from: 'tryout',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'start_epoch_day' },
    columns: ['label', 'description']
  }),
  /* The goals somebody added themselves. A bundled pack's goals are a
     content module rather than rows (roadmap.ts), so what is searchable
     here is the custom ones - and the tick on a bundled goal carries no
     text at all, which is why roadmapChecks is opted out below. */
  area({
    key: 'roadmapGoals',
    covers: ['roadmapGoals'],
    tables: ['roadmapGoal'],
    from: 'roadmap_goal',
    uuid: 'uuid',
    date: null,
    columns: ['text']
  }),
  /* The lines somebody wrote themselves. A built-in's row holds an empty
     `text` and its wording comes from the message catalogue (reconcile.ts),
     so what is matched here is the custom pool - the same division of labour
     tag labels have. */
  area({
    key: 'affirmations',
    covers: ['affirmations'],
    tables: ['affirmation'],
    from: 'affirmation',
    uuid: 'uuid',
    date: null,
    columns: ['text']
  }),
  /* The analyte in the person's own words, their own note and who drew it
     (ADR-0026). No value and no unit: a number is not text somebody wrote,
     and searching for "4.2" finding a lab result is not what this feature
     is for. */
  area({
    key: 'labResults',
    covers: ['labResults'],
    tables: ['lab'],
    from: 'lab_result',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['note', 'analyte', 'provider']
  }),
  area({
    key: 'sizeRecords',
    covers: ['sizeRecords'],
    tables: ['sizeRecord'],
    from: 'size_record',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['fit_note', 'brand', 'size']
  }),
  /* The wear log's own shape: a session is a moment rather than a day
     (wearSessions.ts), which is the one place `SearchDate`'s second form is
     needed. */
  area({
    key: 'wearSessions',
    covers: ['wearSessions'],
    tables: ['wearSession'],
    from: 'wear_session',
    uuid: 'uuid',
    date: { kind: 'timestamp', column: 'start_timestamp' },
    columns: ['note']
  }),
  area({
    key: 'voiceBenchmarks',
    covers: ['voiceBenchmarks'],
    tables: ['voiceBenchmark'],
    from: 'voice_benchmark',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['note']
  }),
  /* Only the free-written description, which is what the 'other' scale
     records. A graded stage is a published scale's own grade and its wording
     comes from the message catalogue above this seam, like a built-in tag's
     label (ADR-0016). */
  area({
    key: 'hairStages',
    covers: ['hairStages'],
    tables: ['hairProgress'],
    from: 'hair_stage',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['description']
  }),
  area({
    key: 'hairRemovalSessions',
    covers: ['hairRemovalSessions'],
    tables: ['hairRemoval'],
    from: 'hair_removal_session',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['provider', 'cost']
  }),
  /* The drug and the ester somebody typed for an episode (regimen.ts's own
     text fields), dated by the day the episode started. The dose, the unit
     and the route are picked from closed vocabularies and are not text. */
  area({
    key: 'regimenEpisodes',
    covers: ['regimenEpisodes'],
    tables: ['regimen'],
    from: 'regimen_episode',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'start_epoch_day' },
    columns: ['drug', 'ester']
  }),
  area({
    key: 'medicationStock',
    covers: ['medicationStock'],
    tables: ['stock'],
    from: 'medication_stock',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'recorded_epoch_day' },
    columns: ['drug']
  }),
  /* A reminder's title, which somebody either typed or accepted from the
     area that offered it (stock.ts, wearSessions.ts). Dated only where the
     reminder is a one-off: a recurring rule has no day of its own, which is
     the same reason it holds a null `epoch_day` in the schema.

     The screen it leads to is Android-only and says so on the web, which is
     where reminders exist at all - so the hit is honest on both platforms
     rather than absent on one. */
  area({
    key: 'reminders',
    covers: ['reminders'],
    tables: ['reminder'],
    from: 'reminder',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['title']
  })
] as const;

export type SearchAreaKey = (typeof AREAS)[number]['key'];

/** Which archive sections the registry above accounts for. */
type Covered = (typeof AREAS)[number]['covers'][number];

/** Every area that holds no searchable text, and why.

    This is the ticket's "registered nowhere" check, and it is a full
    `Record` over whatever the registry does not cover: an area added to the
    archive registry - which is what makes an area exist at all (ADR-0027) -
    is a compile error here until somebody either registers it above or
    writes down why it holds nothing to search. Nobody has to remember the
    check; the only way past it is to state an answer.

    The reasons, and each one is a rule rather than a case:

    *Searched already.* Entries, whose note is the one text with an index
    behind it, matched through it by the screen's own read (ADR-0005).

    *Reference data whose words live above this seam.* A built-in tag,
    dimension, body region, measurement type or effect type stores a key,
    and the words it was shown under only exist in the message catalogue
    (ADR-0016) - which is exactly why tag labels have always been matched in
    memory over the mirrored vocabulary rather than in SQL (searchQuery.ts).
    Searching those is that mechanism's job, not this one's.

    *No text of its own.* A row of numbers, days or picked vocabulary. A
    measurement is a value and a unit; a cycle event is one of three kinds;
    a dose event's site and vehicle come from closed lists.

    *Its own reason*, for the two that need one. */
export const SEARCH_OPT_OUTS: Record<Exclude<ArchiveSectionName, Covered>, string> = {
  entries: 'searched through the entry FTS index, by the screen’s own read (ADR-0005)',

  dimensions: 'reference data: a built-in stores a key, and its words live above this seam',
  presets: 'reference data: a built-in stores a key, and its words live above this seam',
  tagGroups: 'reference data: tag labels are matched in memory over the mirrored vocabulary',
  bodyRegions: 'reference data: a built-in stores a key, and its words live above this seam',
  measurementTypes: 'reference data: a built-in stores a key, and its words live above this seam',
  effectCategories: 'reference data: a built-in stores a key, and its words live above this seam',
  personalEffectTypes: 'reference data: a built-in stores a key, and its words live above this seam',
  // The marker itself carries the effect's key rather than its name
  // (personalEffects.ts), so what a person would search for is the
  // vocabulary's wording, one line above.
  personalEffects: 'no text of its own: the marker is a day and an effect key',

  measurements: 'no text of its own: a type, a value and a unit',
  cycleEvents: 'no text of its own: one of three kinds on a day',
  // `tally_event.context` is a column with no reader and no writer left
  // (tally.ts: register finding 32.4 dropped its entry point, and a
  // forward-only migration cannot un-write it from journals that hold it).
  // Registering it would offer a search over text nothing can put there.
  tallyEvents: 'no text of its own: a kind on a day, and a context column nothing writes',
  dosePauses: 'no text of its own: a start day, an end day and a reason from a closed pair',
  journalingPauses: 'no text of its own: a start day and an end day',
  roadmapChecks: 'no text of its own: a tick against a bundled pack’s goal',
  hairPhotos: 'no text of its own: a dated photograph',
  doseSchedules: 'no text of its own: a recurrence, weekdays and dose amounts',
  doseEvents: 'no text of its own: a drug, a dose and sites picked from closed lists',

  // ADR-0037 and ADR-0040. A snapshot holds copies of entry notes, so its
  // text is already searchable where it was written; matching it here would
  // show the same words twice and file a bad hour into an ordinary search.
  counterevidenceSnapshots: 'a Safe Space artefact, and its text is the entries’ own'
};

export const SEARCH_AREAS: readonly SearchArea[] = AREAS;

/** Every area's key, in the order they are declared - which is the order
    hits are grouped in on the screen, so it never names an area itself. */
export const SEARCH_AREA_KEYS: readonly string[] = AREAS.map((a) => a.key);

/** Every table any area reads, de-duplicated: what `textSearch.search`
    depends on, single-sourced here because this is the module that knows
    (the same reasoning DAY_TABLES gives). */
export const SEARCH_TABLES: TableName[] = [...new Set(AREAS.flatMap((a) => a.tables))];

/** Runs of letters and digits, the same notion of "something to look for"
    the FTS side uses (searchQuery.ts's TOKENS). A query with none of them -
    punctuation only, or nothing at all - is not a search. */
const SOMETHING_TO_FIND = /[\p{L}\p{N}]/u;

/** A LIKE pattern for the folded query, or null when there is nothing to
    look for. Null means "do not go to the database", the same rule
    ftsMatchExpression follows for an empty MATCH expression - and it is the
    same rule, so a query the entry index refuses does not quietly become
    twenty table scans.

    `%` and `_` in what somebody typed are literal characters they want
    found, not wildcards, so they are escaped along with the escape
    character itself: "100%" is a search for a hundred percent, not for
    everything. */
export function likePattern(query: string): string | null {
  const folded = foldText(query).trim();
  if (!SOMETHING_TO_FIND.test(folded)) return null;
  const escaped = folded.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

interface Branch {
  sql: string;
  params: unknown[];
}

/** One area as a branch of the compound select: the same five columns in the
    same order, whatever the area's own table looks like.

    `value` is a CASE over the declared columns in declaration order, so a
    row that matched on two of them shows the one the area prefers rather
    than an arbitrary one. */
function branchFor(declared: SearchArea, pattern: string, request: SearchRequest): Branch {
  const params: unknown[] = [];
  const matches = declared.columns.map((column) => `${foldedSql(column)} LIKE ? ESCAPE '\\'`);

  const value: string[] = [];
  for (const [index, column] of declared.columns.entries()) {
    value.push(`WHEN ${matches[index]} THEN ${column}`);
    params.push(pattern);
  }

  const where: string[] = [`(${matches.join(' OR ')})`];
  params.push(...declared.columns.map(() => pattern));

  if (declared.where) {
    where.push(`(${declared.where.sql})`);
    params.push(...declared.where.params(request));
  }

  const { startEpochDay, endEpochDay } = request;
  if (declared.date && startEpochDay != null) {
    const bound =
      declared.date.kind === 'epochDay' ? startEpochDay : startOfDayTimestamp(startEpochDay);
    where.push(`${declared.date.column} >= ?`);
    params.push(bound);
  }
  if (declared.date && endEpochDay != null) {
    if (declared.date.kind === 'epochDay') {
      where.push(`${declared.date.column} <= ?`);
      params.push(endEpochDay);
    } else {
      // The end day inclusive, as a moment: everything before the next day
      // begins.
      where.push(`${declared.date.column} < ?`);
      params.push(startOfDayTimestamp(endEpochDay + 1));
    }
  }

  const epochDay = declared.date?.kind === 'epochDay' ? declared.date.column : 'NULL';
  const timestamp = declared.date?.kind === 'timestamp' ? declared.date.column : 'NULL';
  /* One number every branch can be ordered by, whichever form its date takes.
     A timestamp is divided into days rather than compared as a moment,
     because the two forms are otherwise nine orders of magnitude apart and
     the compound select carries one ORDER BY over all of them. Ordering
     only: the day a hit reports is `epoch_day` or the converted
     `timestamp`, never this. */
  const sortKey =
    declared.date === null
      ? 'NULL'
      : declared.date.kind === 'epochDay'
        ? declared.date.column
        : `${declared.date.column} / 86400000`;

  return {
    sql: `SELECT '${declared.key}' AS area, ${declared.uuid} AS id, ${epochDay} AS epoch_day,
            ${timestamp} AS timestamp, CASE ${value.join(' ')} END AS value,
            ${declared.context ?? 'NULL'} AS context, ${sortKey} AS sort_key
          FROM ${declared.from}
          WHERE ${where.join(' AND ')}`,
    params
  };
}

interface HitRow extends Record<string, unknown> {
  area: string;
  id: string;
  epoch_day: number | null;
  timestamp: number | null;
  value: string;
  context: string | null;
}

export interface SearchResults {
  hits: SearchHit[];
  /** Whether the limit cut the answer short, read off one row more than was
      asked for rather than off "the page came back full" - which cannot tell
      a last page that happens to be exactly full from a full one. */
  hasMore: boolean;
}

export interface TextSearchArea {
  /** Every registered area's text matched against one query, newest first.
      Reads only (phase 5 deepening ticket 24) - searching writes nothing. */
  search(request: SearchRequest): Promise<SearchResults>;
}

const NOTHING_FOUND: SearchResults = { hits: [], hasMore: false };

export function makeTextSearchArea(
  driver: SqliteDriver,
  areas: readonly SearchArea[] = SEARCH_AREAS
): TextSearchArea {
  return {
    async search(request) {
      const pattern = likePattern(request.query);
      if (pattern === null || areas.length === 0) return NOTHING_FOUND;

      const branches = areas.map((declared) => branchFor(declared, pattern, request));
      /* The compound select is wrapped rather than ordered directly: a
         compound's own ORDER BY may only name an output column, and the rule
         here is an expression over one - undated hits last, then newest
         first, then by area so a page is stable across runs. */
      const sql = `SELECT * FROM (
          ${branches.map((b) => b.sql).join('\nUNION ALL\n')}
        )
        ORDER BY sort_key IS NULL, sort_key DESC, area
        LIMIT ?`;
      const params = [...branches.flatMap((b) => b.params), request.limit + 1];

      const rows = await driver.query<HitRow>(sql, params);
      const hits = rows.slice(0, request.limit).map((row) => ({
        area: row.area,
        id: row.id,
        epochDay: row.epoch_day ?? (row.timestamp === null ? null : epochDayFromTimestamp(row.timestamp)),
        value: row.value,
        context: row.context
      }));
      return { hits, hasMore: rows.length > request.limit };
    }
  };
}
