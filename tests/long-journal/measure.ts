/* Measure calendar, stats, entry and cross-area search, Archive export and
   photo reads through openJournal(driver, files) (ADR-0017). The same calls
   run against web and Android drivers. Pass a fixed epoch day for repeatable
   results. budgets.json sets the acceptance limits. */

import type { Journal, PhotoFileStore } from '../../src/lib/data/journal/journal.ts';
import { mostRecentPastAppointment } from '../../src/lib/data/journal/appointments.ts';
import { packArchive } from '../../src/lib/data/archive/pack.ts';
import { portablePreferences } from '../../src/lib/data/archive/payload.ts';
import { dateInputValueFromEpochDay } from '../../src/lib/data/epochDay.ts';
import { PREFERENCE_DEFAULTS } from '../../src/lib/data/prefs/catalogue.ts';
import { normalizePhoto } from '../../src/lib/data/photos/normalize.ts';
import { thumbFileName } from '../../src/lib/data/photos/names.ts';
import { readThumbnail, setPhotoFiles } from '../../src/lib/stores/photoFiles.ts';
import { tagIdsMatching } from '../../src/lib/data/searchQuery.ts';
import { SEARCH_AREA_KEYS } from '../../src/lib/data/journal/textSearch.ts';
import { onThisDayCandidates } from '../../src/lib/data/on-this-day.ts';
import { EUPHORIA_TAG_KEYS } from '../../src/lib/data/vocabulary/builtins.ts';
import { readReturnGap, readWhatIsWaiting } from '../../src/lib/data/comingBackReads.ts';
import { offeredWrappedPeriod } from '../../src/lib/data/wrapped.ts';
import { touchesMutedEra } from '../../src/lib/data/resurfacingConsent.ts';
import { readCare } from '../../src/lib/data/careReads.ts';
import type { RecordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver.ts';
import type { LongJournalSummary } from './generate.ts';

export interface Measurement {
  /** Matches a key in budgets.json. */
  name: string;
  /** The screen or action, for whoever reads the run's output. */
  what: string;
  ms: number;
  /** How much work it did, so the milliseconds can be read against
      something. */
  detail: string;
  /** How many statements crossed the driver seam, and how many bytes came
      back across it. Carried only by the screen-mount measurements, which
      are budgeted on these rather than on time:
      the crossing is what this architecture pays for, and on desktop it is
      the half a millisecond figure cannot see. */
  statements?: number;
  bytes?: number;
}

/** The cold-start measurements the probe takes around boot() itself, before
    it hands the journal to the harness below. They
    live in the probe rather than here because they need a real driver over
    real storage - what boot costs is the driver opening, not a fake one being
    constructed - and they are named here so budgets.json can be checked
    against the whole set of names a run produces (measure.test.ts). */
export const STARTUP_MEASUREMENT_NAMES = ['boot-ready', 'boot-purge', 'boot-sweep'] as const;

export interface MeasureOptions {
  /** As an epoch day, never from a clock (ADR-0001). */
  today: number;
  summary: LongJournalSummary;
  /** The recording adapter the journal was opened over, so the screen
      mounts can be counted in statements and bytes. Required rather than
      optional: a run that quietly produced no mount measurements would
      leave budgets.json describing measurements nobody takes. */
  recorder: RecordingDriver;
  prepareLookBack?: (journal: Journal, today: number) => Promise<() => Promise<{ result: unknown; detail: string; crossings?: { statements: number; bytes: number } }>>;
  mountHome?: (journal: Journal) => Promise<{ result: unknown; detail: string; crossings?: { statements: number; bytes: number } }>;
}

/** Metrics the stats screen charts at once: mood plus every dimension. */
const CHARTED_METRICS = [
  'mood',
  'euphoria_dysphoria',
  'femininity',
  'masculinity',
  'binary_nonbinary',
  'agender_gendered'
];

/** What the search screen asks for one page of hits. */
const SEARCH_PAGE = 30;
/** What the tryout detail asks for one page of its entries. */
const TRYOUT_ENTRIES_PAGE = 5;

/** A word the fixture writes outside the entry note - its letters are
    addressed to a future self (generate.ts) - so the registry search is
    measured over rows it actually returns rather than over a scan that
    matches nothing. */
const NON_ENTRY_SEARCH_WORD = 'future self';

/** A built-in gender dimension, for the half of the metric that is not
    mood. Any of the five would do; the generator logs values against all
    of them. */
const INSIGHT_DIMENSION = 'femininity';

/** A built-in body region, standing in for the query shape every other
    region shares (bodyRegionTrend's `region` is a plain WHERE parameter,
    not a branch). Any of the fixture's five would do. */
const BENCHMARK_REGION = 'chest';

/** The analyte the labs measurement reads: the fixture's most-logged one,
    carried in two unit spellings on purpose (generate.ts), so getResults and
    getSeries both do real work. */
const LABS_ANALYTE = 'Estradiol';

/** What Home's letter tile pages and its recent-days strip takes - the
    literals `+page.svelte` and `liveTiles.svelte.ts` pass today. */
const HOME_LETTER_PAGE = 100;
const HOME_RECENT_DAYS = 5;

/** The metric Home's week strip and the stats cards are drawn on when
    nobody has picked another, which is what a mount reads. Mood, the one
    metric that is not a gender dimension. */
const HOME_METRIC = 'mood';
const STATS_METRIC = 'mood';

/** The stats tab's default range, and the interval length its custom card
    starts on. Both are what the screen mounts with rather than what a
    person can drag it to. */
const STATS_DEFAULT_RANGE = 30;

/** The gap the return surface is measured over. A season, which is the
    length of absence the screen exists for - long enough that letters have
    unlocked and dose slots have gone unlogged inside it. */
const RETURN_GAP_DAYS = 90;

/** The password an export is packed under here. Real Argon2id parameters
    ride with it (pack.ts's default), because the KDF is part of what an
    export costs and a cheap one would flatter the number. */
const EXPORT_PASSWORD = 'benchmark-export-password';

/** Every read at once and still named, which is what a screen's mount is:
    its live queries are created in order and their promises overlap. An
    object rather than a positional `Promise.all` because a mount fires
    twenty-five reads and a list of twenty-five names written twice - once
    to await, once to hold - is a list that drifts. */
async function together<Reads extends Record<string, Promise<unknown>>>(
  reads: Reads
): Promise<{ [Name in keyof Reads]: Awaited<Reads[Name]> }> {
  const names = Object.keys(reads);
  const values = await Promise.all(Object.values(reads));
  return Object.fromEntries(names.map((name, i) => [name, values[i]])) as {
    [Name in keyof Reads]: Awaited<Reads[Name]>;
  };
}

const DAYLIO_HEADER = 'full_date,date,weekday,time,mood,activities,note_title,note';

function daylioCsv(startEpochDay: number, rows: number): string {
  const csvRows = [DAYLIO_HEADER];
  for (let i = 0; i < rows; i++) {
    const date = dateInputValueFromEpochDay(startEpochDay + i);
    csvRows.push(`${date},,,07:15,Rad,,,daylio benchmark row ${i}`);
  }
  return csvRows.join('\n');
}

export async function measureLongJournal(
  journal: Journal,
  files: PhotoFileStore,
  options: MeasureOptions
): Promise<Measurement[]> {
  const { today, summary, recorder } = options;
  const measurements: Measurement[] = [];
  /* Keeps every result alive for the rest of the run. Without it the engine
     is free to elide or collect work before the measurement can account for
     it, which is how a benchmark reports that a decade of stats costs
     nothing. What each operation hands back is therefore what it wants
     measured: the Archive export returns a byte total on purpose, because a
     real export streams and holding the decade in one array would measure an
     allocation the app never makes. */
  const held: unknown[] = [];

  /** Returns what it recorded, which only archive-restore uses: its phases
      are derived from the total rather than timed separately. */
  async function measure(
    name: string,
    what: string,
    operation: () => Promise<{ result: unknown; detail: string }>
  ): Promise<number> {
    const startedAt = performance.now();
    const { result, detail } = await operation();
    const ms = performance.now() - startedAt;
    held.push(result);
    measurements.push({
      name,
      what,
      ms,
      detail
    });
    return ms;
  }

  /** A screen's arrival, counted at the driver seam as well as timed. The
      operation's own reads are what a mount is, so nothing here mounts a
      component: `liveQuery` is an effect and an effect needs a component
      initialising around it. */
  async function mount(
    name: string,
    what: string,
    operation: () => Promise<{ result: unknown; detail: string; crossings?: { statements: number; bytes: number } }>
  ): Promise<void> {
    const startedAt = performance.now();
    const { result: measured, recording } = await recorder.record(operation);
    const ms = performance.now() - startedAt;
    held.push(measured.result);
    measurements.push({
      name,
      what,
      ms,
      detail: measured.detail,
      statements: measured.crossings?.statements ?? recording.statements.length,
      bytes: measured.crossings?.bytes ?? recording.bytes
    });
  }

  // --- calendar -----------------------------------------------------------
  // One month of heat map, taken from the middle of the decade rather than
  // its edge: the last month of a journal is the cheap one to ask for.
  const monthEnd = Math.round((summary.firstEpochDay + summary.lastEpochDay) / 2);
  const monthStart = monthEnd - 30;
  await measure('calendar-month', 'calendar, one month of heat map', async () => {
    const averages = await journal.stats.dayAverages('mood', monthStart, monthEnd);
    const counts = await journal.stats.entryCountsByDay(monthStart, monthEnd);
    return { result: [averages, counts], detail: `${averages.length} shaded days, ${counts.length} with entries` };
  });

  // --- stats --------------------------------------------------------------
  /* The stats screen at its widest range, which is what it costs when
     someone opens it and drags to 365. Its three queries are measured
     apart rather than together: the driver serializes everything through
     one worker, so the screen costs their sum, and a screen that is too
     slow is only actionable if the run says which query made it so.
     Measured in the order the screen issues them. */
  const yearStart = today - 364;
  await measure('stats-year-series', 'stats screen, 365 days of every chart', async () => {
    const series = await Promise.all(CHARTED_METRICS.map((key) => journal.stats.dayAverages(key, yearStart, today)));
    const points = series.reduce((total, s) => total + s.length, 0);
    return { result: series, detail: `${CHARTED_METRICS.length} series, ${points} points` };
  });

  /* The default range first, then the widest. The stats screen opens on 30
     days, so these two are different questions: one is what everybody pays
     and the other is what somebody pays for dragging the range. */
  await measure('stats-month-insights', 'stats screen, 30 days of tag insights', async () => {
    const insights = await journal.stats.tagInsights('mood', today - 29, today);
    return { result: insights, detail: `${insights.length} tag insights` };
  });

  await measure('stats-year-insights', 'stats screen, 365 days of tag insights', async () => {
    const insights = await journal.stats.tagInsights('mood', yearStart, today);
    return { result: insights, detail: `${insights.length} tag insights` };
  });

  /* And the same range against a gender dimension, which is the other half
     of the metric: mood is a column on the entry and a dimension is a
     two-join CTE (stats.ts, metricValues). The screen asks for whichever
     the person chose, so measuring only mood would report the cheaper of
     two branches as the cost. */
  await measure('stats-year-insights-dimension', 'stats screen, 365 days of tag insights on a dimension', async () => {
    const insights = await journal.stats.tagInsights(INSIGHT_DIMENSION, yearStart, today);
    return { result: insights, detail: `${insights.length} tag insights on ${INSIGHT_DIMENSION}` };
  });

  // The recap over the same year: top tags and the biggest dimension
  // change, all in one call.
  await measure('stats-recap-year', 'recap, one year', async () => {
    const recap = await journal.stats.recap(yearStart, today);
    return {
      result: recap,
      detail: `${recap.entryCount} entries, ${recap.topTags.length} top tags`
    };
  });

  // The decade in one range, which is what a recap over "everything" would
  // cost and the widest question the stats area can be asked.
  // In the one-year fixture this repeats year-series' range. Start a fresh
  // read generation so both sizes measure SQL, rather than one cached answer.
  await recorder.driver.readSnapshot(async () => {});
  await measure('stats-decade', 'stats, the whole decade in one range', async () => {
    const averages = await journal.stats.dayAverages('mood', summary.firstEpochDay, summary.lastEpochDay);
    return { result: averages, detail: `${averages.length} day averages` };
  });

  /* --- search -------------------------------------------------------------

     Three questions, because they take different plans. A term in a third
     of the notes pages 30 hits out of thousands; a term in a handful reads
     the index and finds almost nothing; and a term that is also a tag's
     label unions a second query over `entry_tag` onto the FTS clause
     (entries.ts), which is the one a note-only word never reaches.

     Every one of them goes through `tagIdsMatching` rather than being
     handed an empty list, because that is what the screen does - it never
     passes `[]`, it passes whatever the typed text matched. The labels
     reachable here are the custom ones: a built-in tag stores a key and its
     wording comes from the message catalogue above this seam (ADR-0016), so
     a fixture below the seam sees an empty label. The count is its own
     query beside the page, as the screen runs it. */
  const knownTags = (await journal.tags.getTagGroups()).flatMap((group) => group.tags);

  for (const [name, word, expected] of [
    ['search-common', summary.commonWord, summary.commonWordEntries],
    ['search-rare', summary.rareWord, summary.rareWordEntries],
    ['search-tag-word', summary.tagWord, summary.tagWordEntries]
  ] as const) {
    const tagIds = tagIdsMatching(word, knownTags);
    await measure(name, `search "${word}", one page and the total`, async () => {
      const [hits, total] = await Promise.all([
        journal.entries.searchEntries(word, tagIds, SEARCH_PAGE),
        journal.entries.countSearchMatches(word, tagIds)
      ]);
      return {
        result: [hits, total],
        detail: `${hits.length} shown of ${total} matches, ${tagIds.length} tag(s) matched (${expected} entries carry the term)`
      };
    });
  }

  /* Measure non-entry search at decade scale, including its count and
     the registry's UNION ALL, folded LIKE, matched-column CASE,
     ordering and limit. Use a term in fixture letters and assert that
     it still matches so the benchmark covers returning results.
  */
  await measure('search-everywhere', 'search, every area outside entries in one statement', async () => {
    const results = await journal.textSearch.search({
      query: NON_ENTRY_SEARCH_WORD,
      today,
      limit: SEARCH_PAGE
    });
    if (results.total === 0) {
      throw new Error(
        `long-journal fixture holds no non-entry text matching "${NON_ENTRY_SEARCH_WORD}", so search-everywhere would measure a scan with nothing to return`
      );
    }
    return {
      result: results,
      detail: `${results.hits.length} shown of ${results.total} matches across ${SEARCH_AREA_KEYS.length} areas`
    };
  });

  // --- photo grid ---------------------------------------------------------
  // The rows first, which is one query however many photos there are, and
  // then the bytes, through the same queue the screen reads through
  // (stores/photoFiles.ts). It used to call files.readMany in batches of 32
  // of its own, which was the fast path no screen could reach - a 65 ms
  // number standing in for a screen that read one thumbnail at a time.
  //
  // Still an upper bound on the screen rather than a picture of it: the
  // grid gates each tile on the viewport now (PhotoThumb), so it asks for
  // a screenful - about twenty - where this asks for every photo in the
  // journal, and the queue sends whatever it was asked for as one
  // readMany. What the two share is the path, not the width of it.
  let photos!: Awaited<ReturnType<Journal['photoLibrary']['inJournal']>>;
  await measure('photo-grid-list', 'photo grid, listing every photo', async () => {
    photos = await journal.photoLibrary.inJournal();
    return { result: photos, detail: `${photos.length} photos` };
  });

  setPhotoFiles(files);
  await measure('photo-grid-thumbs', 'photo grid, reading every thumbnail', async () => {
    /* Kept rather than counted. A mounted grid holds decoded thumbnails
       (PhotoThumb), so returning only a byte total would let this
       measurement do less than the screen it claims to represent.
       Desktop query timing is not Android frame or decode performance. */
    const loaded = await Promise.all(
      photos
        .filter((photo) => photo.source !== 'video')
        .flatMap((photo) => (photo.fileName ? [readThumbnail(photo.fileName)] : []))
    );
    const thumbs = loaded.filter((thumb) => thumb !== null);
    const bytes = thumbs.reduce((total, thumb) => total + thumb.length, 0);
    return { result: thumbs, detail: `${thumbs.length} thumbnails, ${mb(bytes)}` };
  });

  // --- archive export -----------------------------------------------------
  // Two halves, because they fail differently: reading the whole journal
  // out by travelling identity, and encrypting it into the container.
  let snapshot!: Awaited<ReturnType<Journal['archive']['snapshot']>>;
  await measure('archive-snapshot', 'Archive export, reading the journal out', async () => {
    snapshot = await journal.archive.snapshot();
    const bytes = snapshot.files.reduce((total, file) => total + file.length, 0);
    return {
      result: snapshot,
      detail: `${snapshot.journal.entries.length} entries, ${snapshot.files.length} files, ${mb(bytes)} of photos`
    };
  });

  await measure('archive-pack', 'Archive export, encrypting the container', async () => {
    const contents = {
      journal: snapshot.journal,
      preferences: portablePreferences(PREFERENCE_DEFAULTS),
      files: snapshot.files,
      readFile: snapshot.readFile,
      readFiles: snapshot.readFiles
    };
    /* Summed rather than collected. A real export streams to a file, and
       collecting the decade into one array would measure an allocation the
       app never makes. */
    let bytes = 0;
    for await (const chunk of packArchive(contents, EXPORT_PASSWORD)) bytes += chunk.length;
    return { result: bytes, detail: `${mb(bytes)} archive` };
  });

  // --- phase 5 features ---------------------------------------
  // Five features landed without a line here: this section checks the four
  // that turned out to be genuinely new reads. The fifth, regimen templates
  // (care/regimen/+page.svelte's vocabulary.regimenTemplates), is a
  // static built-in list with no query behind it at all, so it gets no
  // measurement - one for form's sake would report nothing a budget could
  // ever fail.

  // On-this-day checks month, six months, and each annual anniversary through
  // the journal's first entry. The decade fixture must pay for those extra
  // candidates, including isGoodDay's body-region EXISTS clause.
  const lookbackStart = (await journal.eras.getJournalBounds())?.firstEpochDay ?? today;
  const lookbackDays = onThisDayCandidates(today, lookbackStart);
  await measure('on-this-day-good-day', 'on-this-day, whether each lookback day clears the bar', async () => {
    const results = await Promise.all(lookbackDays.map((c) => journal.stats.isGoodDay(c.epochDay)));
    return {
      result: results,
      detail: `${results.filter(Boolean).length} of ${results.length} lookback days clear the bar`
    };
  });

  /* The screen reads entriesForDay only for qualifying days. This measures
     every candidate to retain a worst-case cost as the journal grows. */
  await measure('on-this-day-entries', 'on-this-day, entries and attachments for each lookback day', async () => {
    const entries = await Promise.all(lookbackDays.map((c) => journal.entries.entriesForDay(c.epochDay)));
    const photos = entries.reduce((total, day) => total + day.reduce((n, e) => n + e.photos.length, 0), 0);
    return {
      result: entries,
      detail: `${entries.map((day) => day.length).join('+')} entries across ${lookbackDays.length} lookback days, ${photos} photos`
    };
  });

  // The doubt journal (doubt/+page.svelte) always runs this pool, not from
  // a sheet someone opens: the same EUPHORIA_TAG_KEYS and limit (20) the
  // screen itself uses. Widened by the same ticket 44 to include a
  // body-region euphoria clause alongside starred entries and euphoria
  // tags.
  await measure('doubt-counterevidence', 'doubt journal, the counterevidence pool', async () => {
    const COUNTEREVIDENCE_LIMIT = 20;
    const pool = await journal.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT);
    return { result: pool, detail: `${pool.length} counterevidence entries` };
  });

  // Body-region tracking (afdae70, phase 5 ticket 31): the body-map and
  // wear screens each query one region's two axes over a range someone
  // picked, never every region at once - unlike stats-year-series, which
  // charts every gender dimension in one call but has never read a body
  // region at all. 365 days is body-map's widest range, and one region
  // ('chest') stands in for the query shape every other region shares.
  await measure('body-region-trend', 'body map, 365 days of one region, both axes', async () => {
    const [dysphoria, euphoria] = await Promise.all([
      journal.stats.bodyRegionTrend(BENCHMARK_REGION, 'dysphoria', yearStart, today),
      journal.stats.bodyRegionTrend(BENCHMARK_REGION, 'euphoria', yearStart, today)
    ]);
    return {
      result: [dysphoria, euphoria],
      detail: `${dysphoria.length} dysphoria + ${euphoria.length} euphoria points on ${BENCHMARK_REGION}`
    };
  });

  // Measure the dose log's real getComparison (ADR-0027). It reads the
  // active episode, schedule and pauses, and attributed doses, then runs
  // expectedSlots and adherence. End on the last single-episode day.
  // Assert the fixture has three cycling Monday/Wednesday/Friday
  // amounts so the benchmark exercises recurrence beyond an early return.
  await measure('dose-schedule-adherence', 'dose log, 90 days against its schedule, single-episode window', async () => {
    const ADHERENCE_WINDOW_DAYS = 90;
    const toEpochDay = summary.lastSingleEpisodeEpochDay;
    const result = await journal.doses.getComparison({
      fromEpochDay: toEpochDay - ADHERENCE_WINDOW_DAYS,
      toEpochDay
    });
    if (result.reason !== null) {
      throw new Error(`long-journal fixture left nothing to compare for dose-schedule-adherence: ${result.reason}`);
    }
    return {
      result,
      detail: `${result.comparison.rows.length} expected slots, ${result.comparison.unmatched.length} unmatched doses`
    };
  });

  // --- phase 5 ticket 36 features ------------------------------
  // Nine more More-hub areas ticket 36 seeded real content for, surveyed
  // against their actual data-layer calls and found genuinely uncovered.
  // sizes, wear and the overlapping-episode fan-out were surveyed too and
  // found not to need a line here - see ticket 05's Comments for why.

  // Labs (care/labs/+page.svelte): the screen's own five concurrent
  // queries for whichever analyte is selected, none date-bounded or LIMITed
  // (labs.ts:136-179).
  await measure('labs-series', 'labs screen, one analyte across every query the screen runs', async () => {
    const [used, offered, mostRecent, results, series] = await Promise.all([
      journal.labs.getUsedAnalytes(),
      journal.labs.getAnalytes(),
      journal.labs.getMostRecentAnalyte(),
      journal.labs.getResults(LABS_ANALYTE),
      journal.labs.getSeries(LABS_ANALYTE)
    ]);
    return {
      result: [used, offered, mostRecent, results, series],
      detail: `${used.length} used analytes, ${results.length} results for ${LABS_ANALYTE} across ${series.length} unit series`
    };
  });

  // Hair removal (settings/hair-removal/+page.svelte): getSessions() is a
  // whole-table read with no LIMIT (hairRemoval.ts:109). generate.ts seeds
  // this area at a realistic cadence (its own "a year, irregular cadence"
  // instruction), so the row count stays small on purpose - this watches for
  // a regression in the query's shape, not a volume no real journal reaches.
  await measure('hair-removal-sessions', 'hair removal, every session', async () => {
    const sessions = await journal.hairRemoval.getSessions();
    return { result: sessions, detail: `${sessions.length} sessions` };
  });

  // Cycle events (settings/cycle-events/+page.svelte): getCycleEvents()
  // reads the whole table (cycleEvents.ts:37) even though a ranged variant
  // already exists (cycleEvents.ts:44) - the screen just doesn't call it,
  // named rather than fixed (ticket 05's scope).
  await measure('cycle-events-log', 'cycle events, every event', async () => {
    const events = await journal.cycleEvents.getCycleEvents();
    return { result: events, detail: `${events.length} events` };
  });

  // Side effects (settings/side-effects/+page.svelte): getSideEffects() is
  // the unbounded overload (sideEffects.ts:62); a ranged one exists
  // (sideEffects.ts:55) and goes unused, named rather than fixed.
  await measure('side-effects-log', 'side effects, every entry', async () => {
    const effects = await journal.sideEffects.getSideEffects();
    return { result: effects, detail: `${effects.length} side effects` };
  });

  // Voice (settings/voice/+page.svelte): inJournal() joins voice_recording
  // against entry with no date bound or LIMIT (voiceRecordings.ts:120-131).
  await measure('voice-recordings', 'voice recordings, every one in the journal', async () => {
    const recordings = await journal.voice.inJournal();
    return { result: recordings, detail: `${recordings.length} recordings` };
  });

  // Stock (care/+page.svelte's stock sheet): getProjections(today) used to read
  // every dose from the oldest stock entry forward and reduce three numbers
  // per entry out of them - O(entries x doses) at decade scale, and 538KB of
  // Home's mount on this fixture. Phase 8 audit ticket 26 replaced that with
  // one grouped count per date window (stockProjection.ts's projectEveryStock),
  // so what this now measures is a handful of counts whatever the log's
  // length, and mount-home's byte figure below is the ratchet that keeps it
  // that way.
  //
  // It still exercises the fixture's three regimen episodes' overlap
  // resolution, and is still the only measurement here that does - but once
  // per attribution span now (drugSpans) rather than once per dose, so this
  // is no longer the measurement that would notice attributeDrug getting
  // slower. Nothing here would; that cost is a unit-test concern now.
  await measure('stock-projection', 'stock screen, every drug projected from counts over the dose log', async () => {
    const projections = await journal.stock.getProjections(today);
    const excluded = projections.reduce((n, p) => n + p.projection.excludedDoses, 0);
    return {
      result: projections,
      detail: `${projections.length} drugs projected, ${excluded} doses excluded as ambiguous between concurrent episodes`
    };
  });

  // Tryout detail (settings/tryouts/[id]/+page.svelte): performance ticket 07
  // found searchEntries('', [], {startEpochDay, endEpochDay}) ran with no
  // word and no page limit over a tryout's whole date span - 3634ms/3518ms
  // on Android for the fixture's open-ended tryout, too slow to ship
  // (Alicja, 2026-08-27). Ticket 08 bounded the real screen's call with
  // `PAGE * pages` and a "load more" control, the same shape the three
  // search-* measurements above already use; this measurement now mirrors
  // that bounded call rather than the unbounded one it used to guard, since
  // the unbounded shape is exactly what's gone from the app. The page is
  // five since phase 12 ticket 23, not search's thirty.
  await measure('tryout-detail-entries', 'tryout detail, one page and the total across its open-ended span', async () => {
    const range = { startEpochDay: summary.tryoutWideOpenStartEpochDay, endEpochDay: null };
    const [entries, total] = await Promise.all([
      journal.entries.searchEntries('', [], range, TRYOUT_ENTRIES_PAGE),
      journal.entries.countSearchMatches('', [], range)
    ]);
    return {
      result: [entries, total],
      detail: `${entries.length} shown of ${total} entries across the tryout's open-ended span`
    };
  });

  /* Read registered areas' last writes and the area record concurrently.
     One bounded MAX per area fits in the assembled last-write call.
     The area record supplies hidden and finished state. The cycle
     gate's small regimen lookup (ADR-0043) is outside this budget. */
  await measure('hub-last-writes', 'More hub, the last write in every area plus the area record', async () => {
    const [lastWrites, states] = await Promise.all([
      journal.lastWrite.getLastWrites(today),
      journal.areaStates.getAreaStates()
    ]);
    const written = Object.values(lastWrites).filter((day) => day !== null).length;
    return {
      result: [lastWrites, states],
      detail: `${Object.keys(lastWrites).length} areas asked, ${written} with a write, ${Object.keys(states).length} area rows`
    };
  });

  /* Measure calls, payload bytes and elapsed time for the four screen
     mounts. Payload matters across Android's JSON bridge even when SQL is
     fast. Mirror default route, tile and child reads with their real
     overlap and serial loops.

     liveQuery depends on a component effect, so this benchmark restates
     its read lists. Update those lists when the screens' queries change.
     The counts act as regression budgets. */
  const dimensionKeys = (await journal.dimensions.getDimensions()).map((dimension) => dimension.key);

  await mount('mount-home', 'Home, every read its tiles, panels and cards fire on arrival', async () => {
    if (options.mountHome) return options.mountHome(journal);
    /* Twelve live queries from `homeTiles()`, five the route holds
       itself, and the three look-back surfaces under it: the wrapped card,
       the on-this-day card and the week strip. The two cards are gated on
       the `wrapped` and `on-this-day` surface switches, which both ship on, so a
       default install pays for them.

       One of these still grows by a loop rather than by a table: the
       on-this-day card asks whether each lookback day clears the good-day
       bar, one statement per candidate. */
    const wrappedPeriod = offeredWrappedPeriod(today);
    const lookbackDays = onThisDayCandidates(today);
    /* The debrief offer's own most-recent-past-appointment lookup is a second, dependent read - Home's own liveQuery cannot ask
       getDebriefState until this one has answered, the same reason it is
       not folded into `together` below. */
    const appointments = await journal.appointments.getAppointments();
    const mostRecentPastAppointmentId = mostRecentPastAppointment(appointments, today)?.id ?? null;

    const reads = await together({
      runningWear: journal.wearSessions.getRunningSession(),
      episodes: journal.regimen.getEpisodes(),
      procedures: journal.procedures.getProcedures(),
      letters: journal.letters.getLetterSeals(HOME_LETTER_PAGE),
      latestBadEntryId: journal.entries.latestBadMomentEntryId(),
      schedules: journal.doses.getSchedules(),
      dosePauses: journal.doses.getPauses(),
      todayDoses: journal.doses.getDoses(today, today),
      areaStates: journal.areaStates.getAreaStates(),
      entryCount: journal.entries.countAll(),
      journalBounds: journal.eras.getJournalBounds(),
      debriefState: journal.checklists.getDebriefState(mostRecentPastAppointmentId),
      projections: journal.stock.getProjections(today),
      recent: journal.entries.recentDays(HOME_RECENT_DAYS),
      // The wrapped card, which asks the mute layer before it asks for a
      // recap, and the on-this-day card, which asks it before its loop.
      eras: journal.eras.getEras(),
      mutedEraUuids: journal.eraMutes.getMutedEraUuids(),
      weekAverages: journal.stats.dayAverages(HOME_METRIC, today - 6, today)
    });

    /* Serial after the mute layer, the way both cards are: each reads
       `eras` and the mute set, and only then decides whether to ask. The
       wrapped card skips its recap entirely for a muted period. */
    const muted = touchesMutedEra(reads.eras, reads.mutedEraUuids, wrappedPeriod.start, wrappedPeriod.end);
    const wrappedRecap = muted ? null : await journal.stats.recap(wrappedPeriod.start, wrappedPeriod.end);
    const goodDays = await Promise.all(lookbackDays.map((day) => journal.stats.isGoodDay(day.epochDay)));

    return {
      result: [reads, wrappedRecap, goodDays],
      detail:
        `${reads.letters.length} letter seals, `  +
        `${reads.projections.length} stock projections, ${lookbackDays.length} lookback days asked one at a time, ` +
        `${reads.entryCount} entries counted, wrapped recap ${wrappedRecap ? 'read' : 'skipped as muted'}`
    };
  });

  const mountedLookBack = await options.prepareLookBack?.(journal, today);
  await mount('mount-stats', 'Look back mounted at its default range', async () => {
    if (mountedLookBack) return mountedLookBack();
    /* Node-only harness fallback. Browser and Android probes mount /stats.
       The default range, which is what arriving costs: 30 days for every
       card that takes the picker. The two interval cards do not take it -
       they read the whole journal deliberately, since an injection interval
       rarely recurs three times inside even the 90-day preset - and that is
       most of what this mount weighs. */
    const from = today - STATS_DEFAULT_RANGE + 1;
    const [xKey, yKey] = dimensionKeys;

    const reads = await together({
      annotations: journal.chartAnnotations.getAnnotations(from, today, today),
      series: Promise.all(CHARTED_METRICS.map((key) => journal.stats.dayAverages(key, from, today))),
      insights: journal.stats.tagInsights(STATS_METRIC, from, today),
      spreads: journal.stats.daySpread(STATS_METRIC, from, today),
      correlationCards: journal.correlationCards.getCards(from, today),
      recap: journal.stats.recap(from, today),
      tagShare: journal.stats.tagShare(from, today),
      lastWrites: journal.lastWrite.getLastWrites(today),
      areaStates: journal.areaStates.getAreaStates(),
      /* Measured whether or not the fixture holds a presentation to gate
         the card on, and over the first two dimensions the journal has
         rather than the first two the vocabulary store calls active - which
         are the same two on a fixture that hides none. A budget for a
         screen is worth having at its widest mount, and this card's reveal
         is the one animation the screen exists for. */
      constellation: journal.stats.constellationReadings(xKey, yKey, from, today)
    });

    return {
      result: reads,
      detail:
        `${STATS_DEFAULT_RANGE} days for ${CHARTED_METRICS.length} metrics, ${reads.insights.length} tag insights, ` +
        `${reads.constellation.length} constellation readings, ${reads.recap.entryCount} entries in range`
    };
  });

  await mount('mount-more-hub', 'the More hub, every row it draws a live line for', async () => {
    /* `hub-last-writes` above times the two reads that answer the rows;
       this counts what the whole screen crosses for, which is those two
       plus the regimen episode list ADR-0043's cycle gate reads. Both are
       worth having: one says which read is slow, this says what the screen
       costs. */
    const reads = await together({
      episodes: journal.regimen.getEpisodes(),
      lastWrites: journal.lastWrite.getLastWrites(today),
      states: journal.areaStates.getAreaStates()
    });

    return {
      result: reads,
      detail:
        `${Object.keys(reads.lastWrites).length} areas asked, ${reads.episodes.length} regimen episodes, ` +
        `${Object.keys(reads.states).length} area rows`
    };
  });

  await mount('mount-coming-back', 'the return surface, the gap and everything waiting in it', async () => {
    /* Measure the two direct reads. The screen captures its return gap
       once because backfilling a dose could close it mid-visit.
       readReturnGap returns null on the dense fixture, and
       readWhatIsWaiting uses a synthetic gap one season long.
       Browser-tier live-reads-probe.svelte.ts covers reactive query
       round trips that this budget bypasses. */
    const gap = await readReturnGap(journal, today);
    const since = today - RETURN_GAP_DAYS;
    const waiting = await readWhatIsWaiting(journal, today, since);

    return {
      result: [gap, waiting],
      detail: `gap ${gap ?? 'none'} in the fixture, ${waiting?.items.length ?? 0} items waiting in a ${RETURN_GAP_DAYS}-day one`
    };
  });

  await mount('mount-care', 'Care, the lanes and stock cards that compose its overview', async () => {
    /* Care's overview screen (src/routes/care/+page.svelte) mounts one
       live query, `readCare(journal, today)`, which asks for every dose,
       episode, schedule, pause, stock projection, lab result and dose total
       the screen needs and composes them into lanes and run-out projections. */
    const care = await readCare(journal, today);

    return {
      result: care,
      detail:
        `${care.lanes.length} lanes, ${care.stock.length} stock projections, ` +
        `${care.stockExcludedDoses} excluded doses, lab ${care.latestLab ? 'present' : 'none'}`
    };
  });

  await mount('mount-photos', 'the photo grid, the one query the screen fires unconditionally on arrival', async () => {
    /* The photo library screen (src/routes/media/photos/+page.svelte) fires
       exactly one read on mount - the whole library, since chips and
       compare both need every photo, not the narrowed grid. Thumbnails are
       not part of that: PhotoThumb reads its own lazily, gated on its own
       IntersectionObserver (`near`, PhotoThumb.svelte) the same way every
       other mount here counts only what a screen's live queries fire, not
       what a lazy child component might read once painted. `photo-grid-
       list`/`photo-grid-thumbs` above stay the deliberate upper bound over
       every photo in the library; this is the number the screen actually
       pays to arrive (this ticket, batching the grid's DOM). */
    const mountPhotos = await journal.photoLibrary.inJournal();
    return {
      result: mountPhotos,
      detail: `${mountPhotos.length} photos in the library`
    };
  });

  // --- write paths -------------------------------------------------------
  // Ordered after the read measurements so they cannot move read baselines.
  const saveDims: Record<string, number> = {};
  const saveDimensionValues = [63, 74, 41, 58, 69];
  for (const [index, dimension] of (await journal.dimensions.getDimensions()).slice(0, 5).entries()) {
    saveDims[dimension.key] = saveDimensionValues[index % saveDimensionValues.length];
  }
  const saveTags = knownTags.slice(0, 6).map((tag) => tag.id);
  const saveEpochDay = summary.lastEpochDay + 1;
  const saveTimestamp = (saveEpochDay * 24 + 11) * 3_600_000;
  let savedEntryId = 0;

  await measure('entry-save', 'save button, one entry with realistic dimensions and tags', async () => {
    savedEntryId = await journal.entries.upsertEntry({
      epochDay: saveEpochDay,
      timestamp: saveTimestamp,
      mood: 4,
      note: 'entry-save benchmark note',
      dims: saveDims,
      tags: saveTags
    });
    return {
      result: savedEntryId,
      detail: `${Object.keys(saveDims).length} dimensions, ${saveTags.length} tags`
    };
  });

  const samplePhotoName = photos.find((photo) => photo.fileName)?.fileName;
  if (!samplePhotoName) throw new Error('long-journal fixture did not produce a sample photo for photo-add measurement');

  await measure('photo-add', 'save button, normalize and attach one realistic photo', async () => {
    if (savedEntryId === 0) throw new Error('entry-save did not produce an entry id for photo-add');

    const full = await files.read(samplePhotoName);
    if (!full) throw new Error(`sample photo is missing: ${samplePhotoName}`);

    const normalized =
      typeof globalThis.createImageBitmap === 'function'
        ? await normalizePhoto(full)
        : {
            full,
            thumb: (await files.read(thumbFileName(samplePhotoName))) ?? full
          };

    await journal.entries.upsertEntry({
      id: savedEntryId,
      attachPhotos: [normalized]
    });

    return {
      result: normalized,
      detail: `${mb(normalized.full.length)} full + ${mb(normalized.thumb.length)} thumb`
    };
  });

  /* Attribute archive restore time without adding timing hooks to restore.ts.
     replace drains and writes the photo stream, then installs all rows in one
     transaction. first-paint measures the app's separate re-read.

     -read accumulates time spent fetching photo bytes. -files measures the
     streaming window, including overlapping writes with concurrency eight.
     -db is the remaining time, mostly the transaction.

     -db includes writes still in flight after the stream ends. -read includes
     contention from concurrent writes on the event loop or Android bridge.
     Both effects understate the cost attributed to writes. */
  let restoreStartedAt = 0;
  let streamEndedAt = 0;
  let fileReadMs = 0;

  /** Reads, timed into `fileReadMs`. Both branches below need this and the
      subtraction is easy to get subtly wrong twice. */
  const timingRead = async <T>(read: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    const value = await read();
    fileReadMs += performance.now() - startedAt;
    return value;
  };

  const snapshotFiles = async function* (): AsyncIterable<{ name: string; bytes: Uint8Array }> {
    try {
      const names = snapshot.files.map((file) => file.name);
      if (snapshot.readFiles) {
        const BATCH_SIZE = 16;
        for (let i = 0; i < names.length; i += BATCH_SIZE) {
          const batch = names.slice(i, i + BATCH_SIZE);
          const bytes = await timingRead(() => snapshot.readFiles!(batch));
          for (let j = 0; j < batch.length; j++) {
            const body = bytes[j];
            if (!body) throw new Error(`archive snapshot file missing while restoring: ${batch[j]}`);
            yield { name: batch[j], bytes: body };
          }
        }
        return;
      }

      for (const name of names) {
        yield { name, bytes: await timingRead(() => snapshot.readFile(name)) };
      }
    } finally {
      // In a finally so both branches and an early break are covered: this is
      // the moment restore.ts stops streaming and starts the transaction.
      streamEndedAt = performance.now();
    }
  };

  const restoreMs = await measure('archive-restore', 'Archive import, replacing the decade fixture', async () => {
    restoreStartedAt = performance.now();
    await journal.archive.replace({
      journal: snapshot.journal,
      files: snapshotFiles()
    });
    return {
      result: snapshot.journal,
      detail: `${snapshot.journal.entries.length} entries, ${snapshot.files.length} files`
    };
  });

  /* Derived rather than timed: these three divide the measurement above, so
     they are pushed from its numbers instead of re-running any of it.

     Loudly rather than quietly, if the stream never ran: `streamEndedAt`
     would still be zero, `-files` would come out as minus the page's uptime
     and `-db` would swallow the lot. That is a wrong baseline rather than a
     missing one, and budgets.mjs's rule is that this suite fails closed. */
  if (streamEndedAt === 0) {
    throw new Error('archive-restore never streamed a file, so its phases cannot be attributed');
  }
  const streamMs = streamEndedAt - restoreStartedAt;
  const share = (part: number) => `${((part / restoreMs) * 100).toFixed(0)}%`;

  measurements.push(
    {
      name: 'archive-restore-read',
      what: 'Archive import, reading the archive photo bytes back out',
      ms: fileReadMs,
      detail: `${snapshot.files.length} files, ${share(fileReadMs)} of archive-restore, inside its streaming window`
    },
    {
      name: 'archive-restore-files',
      what: 'Archive import, streaming every photo file in',
      ms: streamMs,
      detail: `${snapshot.files.length} files read out and written back, ${share(streamMs)} of archive-restore`
    },
    {
      name: 'archive-restore-db',
      what: 'Archive import, installing every row in one transaction',
      ms: restoreMs - streamMs,
      detail: `${snapshot.journal.entries.length} entries, ${share(restoreMs - streamMs)} of archive-restore`
    }
  );

  const daylioPreview = await journal.archive.previewDaylioImport(daylioCsv(summary.lastEpochDay + 30, summary.entries), {
    tagLabels: () => []
  });
  if (daylioPreview.unmappedMoodLabels.length > 0) {
    throw new Error(`daylio benchmark preview has unmapped moods: ${daylioPreview.unmappedMoodLabels.join(', ')}`);
  }

  await measure('daylio-import', 'Daylio import, commit preview through merge restore', async () => {
    const committed = await journal.archive.commitDaylioImport(daylioPreview);
    return {
      result: committed,
      detail: `${daylioPreview.entryCount} rows, ${committed.entriesAdded} entries added`
    };
  });

  return measurements;
}

/* Its own copy rather than budgets.mjs's. That module reads budgets.json off
   disk with node:fs, and this one runs in a browser. */
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)}MB`;
