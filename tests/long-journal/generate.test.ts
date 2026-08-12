/* The ten-year generator's own tests (phase 2 ticket 20). Node tier, over
   node:sqlite, at a scale that runs in a second - the ten-year run itself
   belongs to the browser tier, where a real encrypted driver and real OPFS
   are what the measurements are worth taking against.

   Determinism is the property everything else rests on: a benchmark whose
   fixture differs between runs measures the fixture, not the code. It is
   checked by generating twice and comparing content, which also catches a
   clock read - `timestamp` is in the comparison, so a generator that
   reached for Date.now() would differ by however long the first run took. */

import { expect, test } from 'vitest';
import { journalWithBuiltIns } from '../../src/lib/data/journal/test-support.ts';
import type { Journal } from '../../src/lib/data/journal/journal.ts';
import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';
import { generateLongJournal, TEN_YEARS, type LongJournalSummary } from './generate.ts';

/** Photo bytes without a canvas: the Node tier has none, and what these
    tests care about is that the rows and files land, not what they depict.
    Length varies with `n` so a photo is distinguishable from its neighbour. */
const bytePatternPhoto = async (n: number): Promise<NormalizedPhoto> => ({
  full: new Uint8Array(64 + (n % 8)).fill(n % 251),
  thumb: new Uint8Array(16).fill(n % 251)
});

/** Everything a run wrote, in a form two runs can be compared by.

    Ids are deliberately absent. The journal mints a uuid per row (ADR-0002)
    and a seed cannot reach into that, so identity is the one thing two runs
    of the same seed do not share - and the one thing no measurement reads.
    A tag stands for itself by its built-in key, or by its label when it is
    a custom one, both of which the seed does decide. */
async function contentOf(journal: Journal, days: number) {
  const groups = await journal.tags.getTagGroups();
  const tagNames = new Map(groups.flatMap((g) => g.tags).map((t) => [t.id, t.builtIn ? t.id : t.label]));

  const entries = (await journal.entries.recentDays(days)).map((e) => ({
    epochDay: e.epochDay,
    timestamp: e.timestamp,
    mood: e.mood,
    note: e.note,
    dims: e.dims,
    tags: e.tags.map((id) => tagNames.get(id) ?? id),
    photos: e.photos.length
  }));

  const milestones = (await journal.milestones.getMilestones()).map((m) => ({
    name: m.name,
    epochDay: m.epochDay
  }));

  const labs = [];
  for (const analyte of await journal.labs.getUsedAnalytes()) {
    for (const r of await journal.labs.getResults(analyte)) {
      labs.push({ analyte, epochDay: r.epochDay, value: r.value, unit: r.unit });
    }
  }

  return { entries, milestones, labs };
}

async function generate(options: { seed?: number; days?: number }) {
  const { journal } = await journalWithBuiltIns();
  const summary = await generateLongJournal(journal, {
    days: 120,
    makePhoto: bytePatternPhoto,
    ...options
  });
  return { journal, summary };
}

test('the same seed writes the same journal twice, timestamps included', async () => {
  const a = await generate({ seed: 5 });
  const b = await generate({ seed: 5 });

  expect(await contentOf(b.journal, 120)).toEqual(await contentOf(a.journal, 120));
  expect(b.summary).toEqual(a.summary);
});

test('a different seed writes a different journal', async () => {
  const a = await generate({ seed: 5 });
  const b = await generate({ seed: 6 });

  expect(await contentOf(b.journal, 120)).not.toEqual(await contentOf(a.journal, 120));
});

test('it writes all five kinds of content the measurements read', async () => {
  const { journal, summary } = await generate({ seed: 1 });

  expect(summary.entries).toBeGreaterThan(60);
  expect(summary.daysWithEntries).toBeGreaterThan(60);
  expect(summary.photos).toBeGreaterThan(0);
  expect(summary.labResults).toBeGreaterThan(0);
  expect(summary.milestones).toBeGreaterThan(0);

  expect(await journal.photos.inJournal()).toHaveLength(summary.photos);
  // Files, not just rows: a photo grid that reads bytes back needs bytes.
  const [first] = await journal.photos.inJournal();
  expect(await journal.entries.recentDays(120)).not.toHaveLength(0);
  expect(first.fileName).toBeTruthy();
});

test('the journal spans exactly the days it was asked for, and ends where it was told', async () => {
  const { journal, summary } = await generate({ seed: 2, days: 400 });

  expect(summary.lastEpochDay - summary.firstEpochDay).toBe(399);

  const entries = await journal.entries.recentDays(400);
  const days = entries.map((e) => e.epochDay);
  expect(Math.min(...days)).toBeGreaterThanOrEqual(summary.firstEpochDay);
  expect(Math.max(...days)).toBeLessThanOrEqual(summary.lastEpochDay);
  // Both ends carry entries, or a range query over "the first month" would
  // be measuring an empty stretch of a decade.
  expect(days.filter((d) => d < summary.firstEpochDay + 31).length).toBeGreaterThan(10);
  expect(days.filter((d) => d > summary.lastEpochDay - 31).length).toBeGreaterThan(10);
});

test('the search words are what the summary says they are', async () => {
  const { journal, summary } = await generate({ seed: 3, days: 400 });

  expect(await journal.entries.countSearchMatches(summary.commonWord, [])).toBe(summary.commonWordEntries);
  expect(await journal.entries.countSearchMatches(summary.rareWord, [])).toBe(summary.rareWordEntries);
  // A search measurement is worth nothing if both terms cost the same.
  expect(summary.commonWordEntries).toBeGreaterThan(summary.rareWordEntries * 5);
  expect(summary.rareWordEntries).toBeGreaterThan(0);
});

test('ten years is the default span', async () => {
  // Cheap: the constant is what the browser tier runs with, and getting it
  // wrong there costs a two-minute run to find out.
  expect(TEN_YEARS).toBe(3653);
});

test('every dimension the stats screen charts carries values', async () => {
  const { journal } = await generate({ seed: 4, days: 400 });

  for (const dimension of await journal.dimensions.getDimensions()) {
    const points = await journal.stats.dayAverages(dimension.key, 0, 30000);
    expect(points.length, `no values logged against ${dimension.key}`).toBeGreaterThan(0);
  }
});

test('the summary reports the counts a benchmark run prints', async () => {
  const { summary } = await generate({ seed: 7, days: 200 });
  const shape: Record<keyof LongJournalSummary, unknown> = summary;
  expect(Object.keys(shape).sort()).toEqual(
    [
      'commonWord',
      'commonWordEntries',
      'daysWithEntries',
      'entries',
      'firstEpochDay',
      'labResults',
      'lastEpochDay',
      'milestones',
      'photos',
      'rareWord',
      'rareWordEntries'
    ].sort()
  );
});
