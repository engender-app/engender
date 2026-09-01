/* The measurement harness (phase 2 ticket 20).

   Five places decide whether a decade of Journal works: the calendar, the
   stats screen, search, Archive export and the photo grid. Search is two
   questions since phase 5 deepening ticket 24: the entry index, and one
   scan across every other area that holds text. Each one below
   asks the journal exactly what its screen asks it, over the same
   `openJournal(driver, files)` handle (ADR-0017) - so what runs against
   SQLocal over OPFS today runs against ticket 11's native SQLite driver
   with nothing here reshaped.

  `today` arrives as an epoch day rather than from a clock, because the
  journal never reads it for a domain answer and a benchmark whose numbers
  move with the date is not a baseline.

   Nothing here optimizes anything, and nothing here decides whether a
   number is acceptable. It reports; budgets.json judges. */

import type { Journal, PhotoFileStore } from '../../src/lib/data/journal/journal.ts';
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
import { hairAnchorEpochDay } from '../../src/lib/data/hairAnchor.ts';
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
}

/** The cold-start measurements the probe takes around boot() itself, before
    it hands the journal to the harness below (phase 5 audit ticket 02). They
    live in the probe rather than here because they need a real driver over
    real storage - what boot costs is the driver opening, not a fake one being
    constructed - and they are named here so budgets.json can be checked
    against the whole set of names a run produces (measure.test.ts). */
export const STARTUP_MEASUREMENT_NAMES = ['boot-ready', 'boot-purge', 'boot-sweep'] as const;

export interface MeasureOptions {
  /** As an epoch day, never from a clock (ADR-0001). */
  today: number;
  summary: LongJournalSummary;
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

/** The measurement type the measurements-screen measurement reads: the one
    generate.ts also forces two 'in' readings onto, so getSeries splits into
    two unit series rather than one. */
const MEASUREMENT_TYPE = 'waist';

/** The password an export is packed under here. Real Argon2id parameters
    ride with it (pack.ts's default), because the KDF is part of what an
    export costs and a cheap one would flatter the number. */
const EXPORT_PASSWORD = 'benchmark-export-password';

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
  const { today, summary } = options;
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
  await measure('stats-year-streak', 'stats screen, the streak', async () => {
    const streak = await journal.stats.streak(today);
    return { result: streak, detail: `streak ${streak}` };
  });

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

  // The recap over the same year: gaps-and-islands for the best streak, top
  // tags and the biggest dimension change, all in one call.
  await measure('stats-recap-year', 'recap, one year', async () => {
    const recap = await journal.stats.recap(yearStart, today);
    return {
      result: recap,
      detail: `${recap.entryCount} entries, best streak ${recap.bestStreak}, ${recap.topTags.length} top tags`
    };
  });

  // The decade in one range, which is what a recap over "everything" would
  // cost and the widest question the stats area can be asked.
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

  /* Everything outside the entry note (phase 5 deepening ticket 24). One
     statement across the whole registry - eighteen areas as branches of
     one UNION ALL - plus its count, which is what the screen runs per search
     beside the two entry queries above (textSearch.ts).

     The same word the first search measurement uses, and the number it
     reports is the scan rather than the hits: none of these areas has an
     index, so what this watches is what a folded LIKE over every text
     column in the journal costs at decade scale. The fixture's non-entry
     text is written in English and the word is Polish, so the hit count is
     usually zero and the cost is the same either way - a scan pays for the
     rows it reads, not for the ones it returns.

     If this ever grows out of budget, the strategy to reach for is the one
     deliberately not taken here: search on submit rather than per keystroke.
     Debouncing was not needed at these numbers and would have cost the live
     feel the entry side has.
  */
  await measure('search-everywhere', 'search, every area outside entries in one statement', async () => {
    const results = await journal.textSearch.search({
      query: summary.commonWord,
      today,
      limit: SEARCH_PAGE
    });
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
  let photos!: Awaited<ReturnType<Journal['photos']['inJournal']>>;
  await measure('photo-grid-list', 'photo grid, listing every photo', async () => {
    photos = await journal.photos.inJournal();
    return { result: photos, detail: `${photos.length} photos` };
  });

  setPhotoFiles(files);
  await measure('photo-grid-thumbs', 'photo grid, reading every thumbnail', async () => {
    /* Kept rather than counted. A mounted grid holds decoded thumbnails
       (PhotoThumb), so returning only a byte total would let this
       measurement do less than the screen it claims to represent. */
    const loaded = await Promise.all(
      photos.flatMap((photo) => (photo.fileName ? [readThumbnail(photo.fileName)] : []))
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

  // --- phase 5 features (ticket 01) ---------------------------------------
  // Five features landed without a line here: this section checks the four
  // that turned out to be genuinely new reads. The fifth, regimen templates
  // (settings/regimen/+page.svelte's vocabulary.regimenTemplates), is a
  // static built-in list with no query behind it at all, so it gets no
  // measurement - one for form's sake would report nothing a budget could
  // ever fail.

  // On-this-day (OnThisDayHomeCard.svelte) asks isGoodDay for a fixed three
  // candidates - a month, six months and a year back - never more of them
  // as the journal grows. What's new here is isGoodDay's body-region EXISTS
  // clause (phase 5 ticket 44); this measurement is what tells us whether
  // that clause stays as cheap as the rest of the check at decade scale.
  await measure('on-this-day-good-day', 'on-this-day, whether each lookback day clears the bar', async () => {
    const candidates = onThisDayCandidates(today);
    const results = await Promise.all(candidates.map((c) => journal.stats.isGoodDay(c.epochDay)));
    return {
      result: results,
      detail: `${results.filter(Boolean).length} of ${results.length} lookback days clear the bar`
    };
  });

  /* On-this-day's own screen (phase 5 UX ticket 23, spec 05) reads
     `entriesForDay` only for a lookback that already cleared the bar above
     - but this measures all three unconditionally, the same way
     `on-this-day-good-day` does, because the screen fires from a
     notification (phase 4 features ticket 04): whichever day resurfaces is
     not chosen by this run, so the worst case is that a decade-scale
     journal makes every one of the three cost something. `entriesForDay`
     replaced two one-day aggregates (`recap`, `dayAverages`) per candidate;
     nothing here measures those, because they no longer run. */
  await measure('on-this-day-entries', 'on-this-day, entries and attachments for each lookback day', async () => {
    const candidates = onThisDayCandidates(today);
    const entries = await Promise.all(candidates.map((c) => journal.entries.entriesForDay(c.epochDay)));
    const photos = entries.reduce((total, day) => total + day.reduce((n, e) => n + e.photos.length, 0), 0);
    return {
      result: entries,
      detail: `${entries.map((day) => day.length).join('+')} entries across the three lookback days, ${photos} photos`
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

  // Hair tracking (phase 5 ticket 33): the settings screen's own anchor
  // read is `doses.getDoses(0, today)` - unbounded from epoch day zero,
  // not a windowed range like every stats query above - because the
  // fallback anchor is the earliest dose of anything ever logged. Passed
  // no user-set anchor here, which is the fallback's own worst case: the
  // early-return branch (a preference is set) never touches the dose log
  // at all. getStages/getPhotos read every row, unfiltered, the same shape
  // milestones and lab results already read at decade scale.
  await measure('hair-progress-anchor', 'hair progress, every dose since day zero plus every staging and photo', async () => {
    const [doses, stages, photos] = await Promise.all([
      journal.doses.getDoses(0, today),
      journal.hairProgress.getStages(),
      journal.hairProgress.getPhotos()
    ]);
    const anchor = hairAnchorEpochDay(null, doses);
    return {
      result: [doses, stages, photos, anchor],
      detail: `${doses.length} doses read for the anchor, ${stages.length} stagings, ${photos.length} photos`
    };
  });

  // Dose schedules (schema v38, ADR-0027, phase 5 ticket 40): the one call
  // the dose log screen's schedule view makes, getComparison - four reads,
  // the episode in effect, its schedule and pauses, the doses attributed to
  // it, then expectedSlots and adherence over those, which is where the
  // weekday recurrence and the doseAmounts cycle actually run. The same
  // function the screen calls rather than a second copy of its steps: this
  // block used to assemble them itself off episodes[0] with unattributed
  // doses, so the figure below was not the screen's figure (phase 5
  // deepening ticket 17).
  //
  // Its window ends on the fixture's last single-episode day rather than on
  // `today`, and that is the fixture's own shape: its final stretch runs two
  // concurrent episodes for different drugs, where the screen has nothing to
  // compare and says so. Behind that day sit the fixture's richest
  // schedule - three cycling dose amounts on a Monday/Wednesday/Friday
  // recurrence. The reason is asserted rather than reported, so a fixture
  // that stops meeting that precondition fails here instead of quietly
  // measuring four reads and an early return.
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

  // --- phase 5 ticket 36 features (ticket 05) ------------------------------
  // Nine more More-hub areas ticket 36 seeded real content for, surveyed
  // against their actual data-layer calls and found genuinely uncovered.
  // sizes, wear and the overlapping-episode fan-out were surveyed too and
  // found not to need a line here - see ticket 05's Comments for why.

  // Hormone curve (settings/hormone-curve/+page.svelte): the one call the
  // screen makes, at its widest window (180 days) - the injectable band model
  // plus one qualitative model per hormone this app curves (estradiol,
  // testosterone), over one read of the dose log and one read per analyte any
  // of them can be drawn against. It used to be the screen's three concurrent
  // queries, which read the dose log three times between them and asked for
  // the used analytes three times (phase 5 deepening ticket 17).
  const curveFrom = today - 179;
  await measure('hormone-curve', 'hormone curve, injectable plus qualitative models, 180 days', async () => {
    const view = await journal.hormoneCurve.getCurves({
      fromEpochDay: curveFrom,
      toEpochDay: today,
      fitToOwnLabs: true
    });
    const qualCurves = view.qualitative.sections.reduce((n, section) => n + section.charts.length, 0);
    const qualPoints = view.qualitative.sections.reduce((n, section) => n + section.labPoints.length, 0);
    return {
      result: view,
      detail: `${view.injectable.charts.length} injectable curves + ${qualCurves} qualitative curves, ${view.injectable.labPoints.length + qualPoints} lab points`
    };
  });

  // Labs (settings/labs/+page.svelte): the screen's own five concurrent
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

  // Measurements (settings/measurements/+page.svelte): getMeasurements and
  // getSeries for one type, both filtered only on type, no date bound
  // (measurements.ts:98-110).
  await measure('measurements-series', 'measurements screen, one type across both queries the screen runs', async () => {
    const [measurements, series] = await Promise.all([
      journal.measurements.getMeasurements(MEASUREMENT_TYPE),
      journal.measurements.getSeries(MEASUREMENT_TYPE)
    ]);
    return {
      result: [measurements, series],
      detail: `${measurements.length} measurements for ${MEASUREMENT_TYPE} across ${series.length} unit series`
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

  // Stock (settings/stock/+page.svelte): getProjections(today) reads doses
  // from the oldest stock entry forward (stock.ts:109-121), then projects
  // per stock entry over that whole dose array - O(entries x doses) at
  // decade scale, the strongest candidate this ticket's survey found. Each
  // projection also runs attributeDrug (regimenEpisode.ts) once per dose,
  // which is where the fixture's three regimen episodes' overlap-resolution
  // path actually gets exercised - the only place in this suite that does.
  await measure('stock-projection', 'stock screen, every drug projected against the whole dose log', async () => {
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
  // the unbounded shape is exactly what's gone from the app.
  await measure('tryout-detail-entries', 'tryout detail, one page and the total across its open-ended span', async () => {
    const range = { startEpochDay: summary.tryoutWideOpenStartEpochDay, endEpochDay: null };
    const [entries, total] = await Promise.all([
      journal.entries.searchEntries('', [], range, SEARCH_PAGE),
      journal.entries.countSearchMatches('', [], range)
    ]);
    return {
      result: [entries, total],
      detail: `${entries.length} shown of ${total} entries across the tryout's open-ended span`
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

  /* --- archive-restore, and where its time goes (ticket 17) ---------------

     `replace` does two things in sequence and nothing else (restore.ts): it
     drains the photo stream, writing every file, and then it installs every
     row in one transaction. Nothing runs after the commit, so those two
     account for the whole number. There is no post-restore settle inside
     `replace` to attribute; what the app does after a restore is a re-read,
     which `first-paint` already measures.

     The stream is instrumented from here rather than from restore.ts, because
     this side owns the async iterable it hands over and production code
     should not grow a timing hook to be benchmarked. Three numbers come out,
     and the first is nested inside the second rather than beside it:

       -read   time inside the snapshot's `readFiles`, accumulated: the photo
               bytes coming back out of the store.
       -files  the whole streaming window - those reads and the writes they
               feed, interleaved eight at a time (restore.ts's
               FILE_WRITE_CONCURRENCY), so read and write overlap and only
               the window itself is a wall-clock figure.
       -db     what is left, which is the transaction.

     Two things neither number can see, both of which err the same safe way.
     `-db` carries whatever writes were still in flight when the stream ended,
     because restore.ts awaits them before opening the transaction and this
     side cannot see that await. And `-read` is wall clock around the read
     while up to eight writes contend with it, on the same event loop and, on
     Android, the same bridge - so it is the cost of reading under load rather
     than the cost of reading. Both inflate the cheap half at the expensive
     half's expense: `-db` looks worse than it is, `-read` looks worse than it
     is, and the write cost the whole floor argument rests on is therefore
     understated rather than flattered. At eight of several hundred files each
     is around a percent. */
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
