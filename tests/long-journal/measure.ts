/* The measurement harness (phase 2 ticket 20).

   Five places decide whether a decade of Journal works: the calendar, the
   stats screen, search, Archive export and the photo grid. Each one below
   asks the journal exactly what its screen asks it, over the same
   `openJournal(driver, files)` handle (ADR-0017) - so what runs against
   SQLocal over OPFS today runs against ticket 11's native SQLite driver
   with nothing here reshaped.

   Two things are injected rather than reached for. Heap sampling, because
   how a platform answers "how much memory is in use" is the one part of
   this that is not the driver contract. And the clock is not injected at
   all: `today` arrives as an epoch day, because the journal never reads it
   for a domain answer and a benchmark whose numbers move with the date is
   not a baseline.

   Nothing here optimizes anything, and nothing here decides whether a
   number is acceptable. It reports; budgets.json judges. */

import type { Journal, PhotoFileStore } from '../../src/lib/data/journal/journal.ts';
import { packArchive } from '../../src/lib/data/archive/pack.ts';
import { portablePreferences } from '../../src/lib/data/archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../../src/lib/data/prefs/catalogue.ts';
import { thumbFileName } from '../../src/lib/data/photos/names.ts';
import type { LongJournalSummary } from './generate.ts';

export interface Measurement {
  /** Matches a key in budgets.json. */
  name: string;
  /** The screen or action, for whoever reads the run's output. */
  what: string;
  ms: number;
  /** Bytes of JS heap the result holds on to, or null where the platform
      will not say. */
  heapBytes: number | null;
  /** How much work it did, so the milliseconds can be read against
      something. */
  detail: string;
}

export interface MeasureOptions {
  /** As an epoch day, never from a clock (ADR-0001). */
  today: number;
  summary: LongJournalSummary;
  /** Bytes of JS heap in use right now, or null if this platform will not
      say. Sampled with the result still referenced, so the delta is what
      holding the answer costs. */
  sampleHeap: () => Promise<number | null>;
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

/** The password an export is packed under here. Real Argon2id parameters
    ride with it (pack.ts's default), because the KDF is part of what an
    export costs and a cheap one would flatter the number. */
const EXPORT_PASSWORD = 'benchmark-export-password';

export async function measureLongJournal(
  journal: Journal,
  files: PhotoFileStore,
  options: MeasureOptions
): Promise<Measurement[]> {
  const { today, summary, sampleHeap } = options;
  const measurements: Measurement[] = [];
  /* Keeps every result alive until its heap sample has been taken. Without
     it the engine is free to collect the answer before it is measured,
     which is how a benchmark reports that a decade of stats costs nothing. */
  const held: unknown[] = [];

  async function measure(
    name: string,
    what: string,
    operation: () => Promise<{ result: unknown; detail: string }>
  ): Promise<void> {
    const heapBefore = await sampleHeap();
    const startedAt = performance.now();
    const { result, detail } = await operation();
    const ms = performance.now() - startedAt;
    held.push(result);
    const heapAfter = await sampleHeap();
    measurements.push({
      name,
      what,
      ms,
      heapBytes: heapBefore === null || heapAfter === null ? null : Math.max(0, heapAfter - heapBefore),
      detail
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

  // --- search -------------------------------------------------------------
  // Both ends of it. A term in a third of the notes pages 30 hits out of
  // thousands; a term in a handful reads the index and finds almost
  // nothing. The count is its own query beside the page, as the screen
  // runs it.
  for (const [name, word, expected] of [
    ['search-common', summary.commonWord, summary.commonWordEntries],
    ['search-rare', summary.rareWord, summary.rareWordEntries]
  ] as const) {
    await measure(name, `search "${word}", one page and the total`, async () => {
      const [hits, total] = await Promise.all([
        journal.entries.searchEntries(word, [], SEARCH_PAGE),
        journal.entries.countSearchMatches(word, [])
      ]);
      return { result: [hits, total], detail: `${hits.length} shown of ${total} matches (expected ${expected})` };
    });
  }

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
      readFile: snapshot.readFile
    };
    /* Summed rather than collected. A real export streams to a file, and
       collecting the decade into one array would measure an allocation the
       app never makes. */
    let bytes = 0;
    for await (const chunk of packArchive(contents, EXPORT_PASSWORD)) bytes += chunk.length;
    return { result: bytes, detail: `${mb(bytes)} archive` };
  });

  // --- photo grid ---------------------------------------------------------
  // The rows first, which is one query however many photos there are, and
  // then the bytes, which is one read per thumbnail through the encrypting
  // store. The grid decodes thumbnails only (PhotoThumb), so this reads
  // thumbnails only.
  let photos!: Awaited<ReturnType<Journal['photos']['inJournal']>>;
  await measure('photo-grid-list', 'photo grid, listing every photo', async () => {
    photos = await journal.photos.inJournal();
    return { result: photos, detail: `${photos.length} photos` };
  });

  await measure('photo-grid-thumbs', 'photo grid, reading every thumbnail', async () => {
    let bytes = 0;
    for (const photo of photos) {
      if (!photo.fileName) continue;
      const thumb = await files.read(thumbFileName(photo.fileName));
      bytes += thumb?.length ?? 0;
    }
    return { result: bytes, detail: `${photos.length} thumbnails, ${mb(bytes)}` };
  });

  held.length = 0;
  return measurements;
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)}MB`;
