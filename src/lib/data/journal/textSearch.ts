/* Register searchable text beyond entry notes (ADR-0005, ADR-0027). Each source declares
   its archive sections, read dependencies, columns, UUID, date and owner context. Exclude
   sealed letters. Fold text inside SQLite and match substrings with LIKE, without any
   stored search history (ADR-0020). One UNION ALL and a count before LIMIT keep results and
   totals in one query. searchHitRows.ts adds localized copy and routes. */

import { epochDayFromTimestamp, startOfDayTimestamp } from '../epochDay';
import { foldedSql } from '../fold';
import { likePattern } from '../searchQuery';
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
    goal, a checklist nobody dated. Those are never narrowed
    by a range and sort after everything that has a date. */
type SearchDate =
  | { kind: 'epochDay'; column: string }
  | { kind: 'timestamp'; column: string }
  | null;

/** What the caller asks of a search. `today` arrives rather than being read
    off a clock, for the reason every dated read here takes it (ADR-0001). */
interface SearchRequest {
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
  area: SearchAreaKey;
  /** The record's travelling id (ADR-0002), which is what a hit navigates
      by where its area has a screen per record. */
  id: string;
  epochDay: number | null;
  value: string;
  /** Whatever the area declared it needs to place the hit, or null. */
  context: string | null;
}

/** One area's declaration that its text is searchable, over whatever key and
    whatever `covers` it was written with. Every area answers in the same
    shape, so unlike the day registry there is no per-area row type to keep
    honest; what the two parameters carry is the literals `SearchAreaKey` and
    the opt-out record are read off. */
interface DeclaredArea<Key extends string, Covers extends readonly ArchiveSectionName[]> {
  key: Key;
  covers: Covers;
  tables: readonly TableName[];
  /** The table, or the join, the text lives in. */
  from: string;
  uuid: string;
  date: SearchDate;
  columns: readonly string[];
  context?: string;
  where?: { sql: string; params(request: SearchRequest): unknown[] };
}

/** One declaration with its literals erased, which is what the list holds
    and what everything below reads. */
type SearchArea = DeclaredArea<string, readonly ArchiveSectionName[]>;

/** Keeps the key and `covers` from widening at the declaration site.

    `const` for the reason day.ts's is: declared as a plain
    `readonly ArchiveSectionName[]` it widens to every section name, which
    makes `Covered` below the whole union, `Exclude` empty, and the opt-out
    record accept anything at all - a compile-time check that silently
    checks nothing. The key is a `const` parameter for the mirror of that
    reason: widened to `string` it makes `SearchAreaKey` a string, and
    searchHitRows.ts's full Record over the keys - the half of the registry's
    promise that says what a hit looks like - would accept anything at all
    too. */
function area<const Key extends string, const Covers extends readonly ArchiveSectionName[]>(
  declared: DeclaredArea<Key, Covers>
) {
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
    columns: ['name', 'description']
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
  /* What the appointment was, where it was and what was noted afterwards.
     The kind is a word this person chose, so it is matchable
     the same way a tryout's name is; nothing here ships, so nothing here
     matches a query in a language nobody wrote in. */
  area({
    key: 'appointments',
    covers: ['appointments'],
    tables: ['appointment'],
    from: 'appointment',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['kind', 'place', 'note']
  }),
  /* Every question anybody wrote for an appointment, and every line of a procedure's
     recovery checklist - one table, and the owner is what says which screen the hit belongs
     to (checklists.ts). `context` is the owner's travelling id: only a procedure owns a
     checklist, so a hit with one opens that procedure and a hit without one is an
     appointment question.

     `date: null`, for both kinds of item. A procedure's recovery checklist was never dated
     - it has no day of its own (checklists.ts). The standing appointment prep list used to
     borrow a manually-set `appointment_epoch_day` on its checklist row; (ADR-0066) retired
     writing it, since the list itself is standing and unowned by any one appointment, and
     schema v119 dropped the column. Nothing here could honestly date a question by an
     appointment it does not belong to. */
  area({
    key: 'checklistItems',
    covers: ['checklists'],
    tables: ['checklist'],
    from: 'checklist_item ci JOIN checklist c ON c.id = ci.checklist_id',
    uuid: 'ci.uuid',
    date: null,
    columns: ['ci.content'],
    context: 'c.owner_uuid'
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
  /* A felt sense hangs off a tryout (feltSense.ts), and the hit goes back
     to it, so the tryout's travelling id is the context. */
  area({
    key: 'feltSense',
    covers: ['feltSenseEntries'],
    tables: ['feltSense', 'tryout'],
    from: 'felt_sense fs JOIN tryout t ON t.id = fs.tryout_id',
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
  /* Every presentation name is typed by the person - there are no built-ins
     whose wording lives in the message catalogue (ADR-0048), so the
     reference-data opt-out the built-in areas above use does not apply
     here. */
  area({
    key: 'presentations',
    covers: ['presentations'],
    tables: ['presentation'],
    from: 'presentation',
    uuid: 'uuid',
    date: null,
    columns: ['name']
  }),
  /* An era's name is typed by the person too, the same reason presentations
     is covered rather than opted out - nothing ships
     seeded, so there is no built-in wording living above this seam.

     `date: null` even though an era has two: a hit is the name of a span,
     and dating it by its start would put "before I knew" - an era whose
     start is deliberately absent - at a day it never claimed. A date here
     also narrows a search by range, and narrowing a span by a range means
     choosing whether it overlaps or is contained, which is a filter this
     registry cannot state. */
  area({
    key: 'eras',
    covers: ['eras'],
    tables: ['era'],
    from: 'era',
    uuid: 'uuid',
    date: null,
    columns: ['name']
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
  /* A dilation session's own note. The schedule that expects it
     carries no text of its own - opted out below, the same reason
     doseSchedules is. */
  area({
    key: 'taperSessions',
    covers: ['taperSessions'],
    tables: ['taper'],
    from: 'taper_session',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['note']
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
  /* The provider is the one free-text field left: the cost became an amount
     and a currency (a REAL and a code, like a lab result's `value` above),
     and what was typed into the old text column moved into the note. */
  area({
    key: 'hairRemovalSessions',
    covers: ['hairRemovalSessions'],
    tables: ['hairRemoval'],
    from: 'hair_removal_session',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['provider']
  }),
  /* The drug and the ester somebody typed for an episode (regimen.ts's own text fields),
     dated by the day the episode started. The dose, the unit and the route are picked from
     closed vocabularies and are not text. An episode that was put away is not found. */
  area({
    key: 'regimenEpisodes',
    covers: ['regimenEpisodes'],
    tables: ['regimen'],
    from: 'regimen_episode',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'start_epoch_day' },
    columns: ['drug', 'ester'],
    where: { sql: 'hidden = 0', params: () => [] }
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

     The screen it leads to exists on Android only, so searchPlatform.ts
     keeps the hit off the web. */
  area({
    key: 'reminders',
    covers: ['reminders'],
    tables: ['reminder'],
    from: 'reminder',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['title']
  }),
  /* A margin note. Dated by the entry it annotates rather than by the day the note itself
     was written: an entry has no name a person would recognise it by besides its own day,
     and "a hit needs to say which entry it belongs to"  is what the visible date on a hit
     row already draws for every other area - so this is the one place that date names the
     owner rather than the row. `context` carries the entry's own id (its rowid, the same
     identity `/entry/[id]` already opens by) for the href, the way `feltSense`'s `context`
     carries its owning tryout's id - `CAST` to TEXT because `context` is a string column in
     every other area (each of them a uuid) and an entry's id is the one integer identity
     this registry ever hands back through it. Excludes a trashed entry's notes, the same
     reason `photos.ts`'s own reads do. */
  area({
    key: 'marginNotes',
    covers: ['marginNotes'],
    tables: ['marginNote', 'entry'],
    from: 'margin_note mn JOIN entry e ON e.id = mn.entry_id',
    uuid: 'mn.uuid',
    date: { kind: 'epochDay', column: 'e.epoch_day' },
    columns: ['mn.text'],
    context: 'CAST(e.id AS TEXT)',
    where: { sql: 'e.trashed_at IS NULL', params: () => [] }
  }),
  /* The title, and nothing else there is (ADR-0065). The app never reads a document's contents - no OCR, no text
     extraction - so `columns` here is not a shortened list but the whole of
     the text this area holds. Indexing what a diagnosis says would put its
     words behind a search box somebody might be looked at over. */
  area({
    key: 'documents',
    covers: ['documents'],
    tables: ['document'],
    from: 'document',
    uuid: 'uuid',
    date: { kind: 'epochDay', column: 'epoch_day' },
    columns: ['title']
  })
] as const;

export type SearchAreaKey = (typeof AREAS)[number]['key'];

/** Which archive sections the registry above accounts for. */
type Covered = (typeof AREAS)[number]['covers'][number];

/**
 * Require each Archive section to have a search entry or an explicit opt-out
 * (ADR-0027). Entry notes use their existing FTS index. Translated vocabulary
 * labels match in memory because SQL stores only their keys (ADR-0005). Rows
 * containing only values, dates or closed vocabulary have no free text to
 * search.
 */
/* SEARCH_OPT_OUTS stays exported only for its own test. */
export const SEARCH_OPT_OUTS: Record<Exclude<ArchiveSectionName, Covered>, string> = {
  entries: 'searched through the entry FTS index, by the screen’s own read (ADR-0005)',

  dimensions: 'reference data: a built-in stores a key, and its words live above this seam',
  presets: 'reference data: a built-in stores a key, and its words live above this seam',
  tagGroups: 'reference data: tag labels are matched in memory over the mirrored vocabulary',
  bodyRegions: 'reference data: a built-in stores a key, and its words live above this seam',
  effectCategories: 'reference data: a built-in stores a key, and its words live above this seam',
  personalEffectTypes: 'reference data: a built-in stores a key, and its words live above this seam',
  // The marker itself carries the effect's key rather than its name
  // (personalEffects.ts), so what a person would search for is the
  // vocabulary's wording, one line above.
  personalEffects: 'no text of its own: the marker is a day and an effect key',

  // A min, a max, a median and a felt-sense
  // rating on the app's own mood scale, none of it text.
  voicePracticeTakes: 'no text of its own: three pitch figures and a felt-sense rating',
  cycleEvents: 'no text of its own: one of three kinds on a day',
  dosePauses: 'no text of its own: a start day, an end day and a reason from a closed pair',
  // The row is a uuid pointing at an era, whose own name is what `eras`
  // above already searches - and a mute is presence, not a value.
  eraMutes: 'no text of its own: a uuid naming a muted era',
  // A judgement of a named doctor, read where
  // the person keeps it (the appointments screen lists every provider)
  // rather than surfaced by a search somebody else could be looking over.
  providers: 'private notes on a named person, read on the appointments screen',
  roadmapChecks: 'no text of its own: a tick against a bundled pack’s goal',
  roadmapCategories: 'a heading over goals, whose own text `roadmapGoals` above already searches',
  // The name of an office and short lines on
  // where a request stands there, read on the roadmap's own list.
  roadmapInstitutions: 'the name of an office on the roadmap list, read there',
  roadmapInstitutionChanges: 'a status and a short line about one office, read on the roadmap',
  progressPhotos: 'no text of its own: a dated photograph and its pose',
  progressPoses: 'a pose name, read on the Progress photos screen that files photographs under it',
  doseSchedules: 'no text of its own: a recurrence, weekdays and dose amounts',
  taper: 'no text of its own: a surgery day, a start day and a stage sequence (ticket 12)',
  doseEvents: 'no text of its own: a drug, a dose and sites picked from closed lists',

  // A template's name and note scaffold are the person's own words for an
  // authored one, but they name a creation aid rather than journal
  // content - nobody searching their journal is looking for the templates
  // they write entries from.

  // The same Safe Space artefact class as the row above, for a different
  // reason: a comfort item's text is not duplicated anywhere, but
  // built this list to be reached behind Safe Space's own single
  // tap and nowhere else. An ordinary search result is exactly the kind of
  // unasked-for door the ticket rules out.
  comfortItems: 'a Safe Space artefact, kept behind its own single-tap door',

  // The source is a fixed registry key, not a word someone typed - the
  // settings screen that lists these is where "where did this come from"
  // is answered, not an ordinary search result.
  importLog: 'no text of its own: a source key, a date and counts by kind',
  deletions: 'no text of its own: a table name, an identity and a time',

  // Deliberately not searchable rather than incidentally: a hidden or
  // finished area's own records stay searchable, because search finding
  // everything is what makes it trustworthy, and the row itself is an area
  // key and a day.
  areaStates: 'no text of its own: an area key, a flag and a day'
};

/* SEARCH_AREAS stays exported only for its own test. */
export const SEARCH_AREAS: readonly SearchArea[] = AREAS;

/** Every area's key, in the order they are declared - which is the order
    hits are grouped in on the screen, so it never names an area itself. */
/* SEARCH_AREA_KEYS stays exported for its own test, and cross-checked in measure.ts. */
export const SEARCH_AREA_KEYS: readonly SearchAreaKey[] = AREAS.map((a) => a.key);

/** Every table any area reads, de-duplicated: what `textSearch.search`
    depends on, single-sourced here because this is the module that knows
    (the same reasoning DAY_TABLES gives). */
export const SEARCH_TABLES: TableName[] = [...new Set(AREAS.flatMap((a) => a.tables))];

interface Branch {
  sql: string;
  params: unknown[];
}

/** One declared column of one area as a branch of the compound select: the
    same columns in the same order whatever the area's own table looks like,
    with the column's text as `text` and its declaration order as `col`.

    One branch per column rather than per area: the
    fold is then applied once, to `text`, outside the union, instead of once
    per column per area and again inside a CASE for the value. Spelled per
    column the statement was 123 KB of nested REPLACE() text, sent twice per
    search across the Android bridge and prepared twice by SQLite; the rows
    it scanned were the smaller cost. */
function branchesFor(declared: SearchArea, request: SearchRequest): Branch[] {
  const params: unknown[] = [];
  const where: string[] = [];

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

  return declared.columns.map((column, index) => ({
    sql: `SELECT '${declared.key}' AS area, ${declared.uuid} AS id, ${epochDay} AS epoch_day,
            ${timestamp} AS timestamp, ${index} AS col, ${column} AS text,
            ${declared.context ?? 'NULL'} AS context, ${sortKey} AS sort_key
          FROM ${declared.from}${where.length ? `\n          WHERE ${where.join(' AND ')}` : ''}`,
    params
  }));
}

interface HitRow extends Record<string, unknown> {
  area: string;
  // (the projection's own literal; narrowed where the hits are built)
  id: string;
  epoch_day: number | null;
  timestamp: number | null;
  value: string;
  context: string | null;
  total: number;
}

interface SearchResults {
  hits: SearchHit[];
  /** How many hits there are in total, which is not the page's length: the
      screen states how many results a query found and shows a page of them.
      Read as a window over the same statement (`COUNT(*) OVER ()`), so
      it counts every match rather than the page's own rows: taking it from
      the page would report thirty for a query with fifty. */
  total: number;
}

export interface TextSearchArea {
  /** Every registered area's text matched against one query, newest first.
      Reads only - searching writes nothing. */
  search(request: SearchRequest): Promise<SearchResults>;
}

/** One default for the whole answer rather than one per field: the page and
    its count come back together or not at all. */
const NOTHING_FOUND: SearchResults = { hits: [], total: 0 };

export function makeTextSearchArea(driver: SqliteDriver): TextSearchArea {
  return {
    async search(request) {
      const pattern = likePattern(request.query);
      if (pattern === null) return NOTHING_FOUND;

      const branches = SEARCH_AREAS.flatMap((declared) => branchesFor(declared, request));
      const union = branches.map((b) => b.sql).join('\nUNION ALL\n');
      const params = branches.flatMap((b) => b.params);

      /* One statement for the page and the count. The inner select is every column that
         matched, numbered per record in declaration order, and only each record's first is
         kept, so a row that matched on two columns shows the one its area prefers and is
         counted once - one pass over the union rather than a join back to it. The count is
         a window over the whole answer, which SQLite evaluates before the LIMIT, so it is
         every match and not the page's length. The outer select is ordered rather than the
         compound directly: a compound's own ORDER BY may only name an output column, and
         the rule here is an expression over one - undated hits last, then newest first,
         then by area, then by record id. The id is new with before it, two hits of one area
         on one day came back in whatever order the scan produced them, and a page of thirty
         could cut between them either way. */
      const rows = await driver.query<HitRow>(
        `SELECT area, id, epoch_day, timestamp, text AS value, context, COUNT(*) OVER () AS total
           FROM (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY area, id ORDER BY col) AS nth
               FROM (${union})
              WHERE ${foldedSql('text')} LIKE ? ESCAPE '\\'
           )
          WHERE nth = 1
          ORDER BY sort_key IS NULL, sort_key DESC, area, id
          LIMIT ?`,
        [...params, pattern, request.limit]
      );

      /* The area is cast rather than checked: every branch of the query above
         wrote its own key into the projection as a literal, so the only
         strings this column can hold are the registry's own. */
      const hits = rows.map((row) => ({
        area: row.area as SearchAreaKey,
        id: row.id,
        epochDay: row.epoch_day ?? (row.timestamp === null ? null : epochDayFromTimestamp(row.timestamp)),
        value: row.value,
        context: row.context
      }));
      return { hits, total: rows[0]?.total ?? 0 };
    }
  };
}
