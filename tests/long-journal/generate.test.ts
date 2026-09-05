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
import { generateLongJournal, type LongJournalSummary } from './generate.ts';
import { bytePatternPhoto } from './test-support.ts';

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

test('the tag word is a tag label, carried by entries, and in no note', async () => {
  const { journal, summary } = await generate({ seed: 3, days: 400 });

  const tags = (await journal.tags.getTagGroups()).flatMap((g) => g.tags);
  const match = tags.find((t) => t.label === summary.tagWord);
  expect(match, 'the tag word has to name a tag or the union branch is never taken').toBeDefined();

  expect(await journal.entries.entriesWithTag(match!.id, 10_000)).toHaveLength(summary.tagWordEntries);
  expect(summary.tagWordEntries).toBeGreaterThan(0);
  // In no note, or the measurement would not tell the two branches apart.
  expect(await journal.entries.countSearchMatches(summary.tagWord, [])).toBe(0);
});

test('every dimension the stats screen charts carries values', async () => {
  const { journal } = await generate({ seed: 4, days: 400 });

  for (const dimension of await journal.dimensions.getDimensions()) {
    const points = await journal.stats.dayAverages(dimension.key, 0, 30000);
    expect(points.length, `no values logged against ${dimension.key}`).toBeGreaterThan(0);
  }
});

test('it writes the phase 5 content the new measurements read (ticket 01)', async () => {
  const { journal, summary } = await generate({ seed: 8, days: 400 });

  expect(summary.regionEuphoriaEntries).toBeGreaterThan(0);
  const entries = await journal.entries.recentDays(400);
  const withRegions = entries.filter((e) => Object.keys(e.bodyRegions).length > 0);
  expect(withRegions.length).toBeGreaterThan(0);
  expect(withRegions.some((e) => Object.values(e.bodyRegions).some((f) => (f.euphoria ?? 0) >= 50))).toBe(true);

  expect(summary.hairStagings).toBeGreaterThan(0);
  expect(await journal.hairProgress.getStages()).toHaveLength(summary.hairStagings);
  expect((await journal.hairProgress.getPhotos()).length).toBeGreaterThan(0);

  // Three episodes as of ticket 36: the original plus two more that overlap
  // it (concurrent-episode coverage lives in the next test, below).
  const episodes = await journal.regimen.getEpisodes();
  expect(episodes).toHaveLength(3);
  const schedules = await journal.doses.getSchedules();
  expect(schedules).toHaveLength(3);
  expect(schedules.map((s) => s.episodeId).sort()).toEqual(episodes.map((e) => e.id).sort());

  expect(summary.doseEvents).toBeGreaterThan(0);
  const firstEpisodeDoses = (await journal.doses.getDoses(0, summary.lastEpochDay)).filter((d) => d.route === 'oral' && d.drug === 'Estradiol');
  expect(firstEpisodeDoses).toHaveLength(summary.doseEvents);
});

test('it writes the fixture every More-hub area reads (ticket 36)', async () => {
  const { journal, summary } = await generate({ seed: 9, days: 800 });

  // Regimen: the ten-year episode above plus two ticket 36 adds - the
  // second overlaps it for a stretch, the third is the injectable one the
  // hormone curve reads.
  const episodes = await journal.regimen.getEpisodes();
  expect(episodes).toHaveLength(3);
  expect(await journal.doses.getSchedules()).toHaveLength(3);
  expect(summary.additionalDoseEvents).toBeGreaterThan(0);
  const injectable = (await journal.doses.getDoses(0, summary.lastEpochDay)).filter((d) => d.route === 'im');
  expect(injectable.length).toBeGreaterThan(0);
  expect(injectable.every((d) => d.drug === 'Estradiol valerate')).toBe(true);

  expect(summary.measurements).toBeGreaterThan(0);
  const types = await journal.measurements.getMeasurementTypes();
  const loggedTypes = (
    await Promise.all(types.map(async (t) => ((await journal.measurements.getSeries(t.key)).length > 0 ? t.key : null)))
  ).filter(Boolean);
  expect(loggedTypes.length).toBeGreaterThan(0);

  expect(summary.sizeRecords).toBeGreaterThan(0);

  expect(summary.hairRemovalSessions).toBeGreaterThan(0);
  const hairRemovalSessions = await journal.hairRemoval.getSessions();
  expect(hairRemovalSessions).toHaveLength(summary.hairRemovalSessions);
  const hairRemovalPhotoCounts = await Promise.all(
    hairRemovalSessions.map((s) => journal.hairRemoval.getPhotos(s.id))
  );
  expect(hairRemovalPhotoCounts.some((photos) => photos.length > 0)).toBe(true);

  expect(summary.roadmapChecks).toBeGreaterThan(0);
  const roadmapStatuses = await journal.roadmap.getGoalStatuses('pl');
  expect(Object.keys(roadmapStatuses).length).toBeGreaterThan(0);
  expect(await journal.roadmap.getCustomGoals()).not.toHaveLength(0);

  expect(summary.letters).toBeGreaterThan(0);
  const letters = await journal.letters.getLetters(100);
  expect(letters).toHaveLength(summary.letters);
  expect(letters.some((l) => l.unlockEpochDay <= summary.lastEpochDay)).toBe(true);
  expect(letters.some((l) => l.unlockEpochDay > summary.lastEpochDay)).toBe(true);

  expect(summary.tryouts).toBeGreaterThan(0);
  const tryouts = await journal.tryouts.getTryouts();
  expect(tryouts).toHaveLength(summary.tryouts);
  const [firstTryout] = tryouts;
  expect(
    (await journal.tryouts.getPhotos(firstTryout.id)).length + (await journal.feltSense.forTryout(firstTryout.id)).length
  ).toBeGreaterThan(0);

  expect(summary.personalEffects).toBeGreaterThan(0);
  const enabledCategories = await journal.effectCategories.getEffectCategories();
  expect(enabledCategories.find((c) => c.key === 'genital_sexual')?.enabled).toBe(true);

  expect(summary.wearSessions).toBeGreaterThan(0);
  expect(summary.cycleEvents).toBeGreaterThan(0);
  expect(summary.sideEffects).toBeGreaterThan(0);

  const procedures = await journal.procedures.getProcedures();
  expect(procedures).toHaveLength(1);
  expect(procedures[0].consults.length).toBeGreaterThan(0);
  expect(await journal.procedures.getChecklist(procedures[0].id)).toBeDefined();

  expect(summary.checklistItems).toBeGreaterThan(0);
  expect(await journal.checklists.getStandaloneChecklist()).toBeDefined();

  expect(summary.stockEntries).toBeGreaterThan(0);
  expect(await journal.stock.getEntries()).toHaveLength(summary.stockEntries);

  expect(summary.voiceRecordings).toBeGreaterThan(0);
  expect(await journal.voice.inJournal()).toHaveLength(summary.voiceRecordings);
});

test('the summary reports the counts a benchmark run prints', async () => {
  const { summary } = await generate({ seed: 7, days: 200 });
  const shape: Record<keyof LongJournalSummary, unknown> = summary;
  expect(Object.keys(shape).sort()).toEqual(
    [
      'appointments',
      'checklistItems',
      'commonWord',
      'commonWordEntries',
      'cycleEvents',
      'daysWithEntries',
      'doseEvents',
      'additionalDoseEvents',
      'entries',
      'firstEpochDay',
      'hairRemovalSessions',
      'hairStagings',
      'labResults',
      'lastEpochDay',
      'lastSingleEpisodeEpochDay',
      'letters',
      'measurements',
      'milestones',
      'personalEffects',
      'photos',
      'rareWord',
      'rareWordEntries',
      'regionEuphoriaEntries',
      'roadmapChecks',
      'sideEffects',
      'sizeRecords',
      'stockEntries',
      'tagWord',
      'tagWordEntries',
      'tryouts',
      'tryoutWideOpenStartEpochDay',
      'voiceRecordings',
      'wearSessions'
    ].sort()
  );
});
