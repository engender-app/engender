/* The day registry (phase 5 deepening ticket 21): that every dated area is
   either registered or written down as deliberately absent, that one day's
   read costs one pass per area rather than one per row, and that opening a
   day writes nothing.

   What each section's rows mean is not tested here - that is each area's
   own test file. This is the registry: which areas exist on a day, and what
   reading one costs. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from '../epochDay.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import { DAY_OPT_OUTS, DAY_SECTIONS, DAY_SECTION_KEYS, DAY_TABLES, makeDayArea, type DaySection } from './day.ts';
import { openJournal, type Journal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';

const DAY = 20000;
const at = (epochDay: number, hour = 9) => startOfDayTimestamp(epochDay) + hour * 3600000;

/* A jpeg header is enough - the fake file store keeps bytes and never
   decodes them, and normalizePhoto is not on this path. */
const photo = () => ({ full: new Uint8Array([0xff, 0xd8, 0xff]), thumb: new Uint8Array([0xff, 0xd8]) });

/** A day with something from every registered area, which is what the read
    cost and the composition both have to hold up against. */
async function fillDay(journal: Journal, epochDay = DAY): Promise<void> {
  await journal.entries.upsertEntry({ epochDay, timestamp: at(epochDay), mood: 4, note: 'a good one', tags: [] });
  await journal.milestones.upsertMilestone({ name: 'first appointment', epochDay });
  await journal.doses.upsertDose({
    timestamp: at(epochDay, 8),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });
  await journal.labs.upsertResult({ epochDay, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: 'Quest' });
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay,
    passageKey: 'rainbow',
    passageAudio: new Uint8Array([1, 2, 3]),
    vowelAudio: null,
    f0MedianHz: 171,
    f0P10Hz: 158,
    f0P90Hz: 190,
    semitoneSd: 2.4,
    wordsPerMinute: 148,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay, value: 78, unit: 'cm' });
  await journal.sizeRecords.upsertRecord({ epochDay, category: 'bras', size: '70B' });
  await journal.taper.upsertSession({ epochDay });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay });
  await journal.personalEffects.upsertMarker({ effect: 'skin_softening', firstNoticedEpochDay: epochDay });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay });
  await journal.tally.log({ kind: 'correctly_gendered', epochDay });
  await journal.wearSessions.upsertSession({ kind: 'binder', startTimestamp: at(epochDay, 10), durationMs: 3600000 });

  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Robin',
    startEpochDay: epochDay - 10,
    endEpochDay: null
  });
  await journal.feltSense.add({ tryoutId }, { epochDay, mood: 5, note: 'it fit' });
  await journal.tryouts.addPhoto(tryoutId, epochDay, photo());

  await journal.hairProgress.upsertStage({ epochDay, scale: 'other', stage: '', description: 'thinner at the front' });
  await journal.hairProgress.addPhoto(epochDay, photo());
  await journal.hairRemoval.upsertSession({ epochDay, area: 'chin', method: 'laser', painRating: 3 });

  const procedureId = await journal.procedures.upsertProcedure({ name: 'orchiectomy' });
  await journal.procedures.addConsult(procedureId, epochDay);
  await journal.procedures.addPhoto(procedureId, epochDay, photo());
}

test('every area that travels either shows on a day or says why it does not', () => {
  const covered = new Set(DAY_SECTIONS.flatMap((s) => s.covers));
  const optedOut = new Set(Object.keys(DAY_OPT_OUTS));

  for (const name of ARCHIVE_SECTION_NAMES) {
    assert.ok(
      covered.has(name) || optedOut.has(name),
      `${name} is registered nowhere: give it a day section, or a reason in DAY_OPT_OUTS`
    );
  }
});

test('nothing is both registered and opted out, and no opt-out names an area that no longer travels', () => {
  const travelling = new Set<string>(ARCHIVE_SECTION_NAMES);
  const covered = new Set(DAY_SECTIONS.flatMap((s) => s.covers));

  for (const [name, reason] of Object.entries(DAY_OPT_OUTS) as [string, string][]) {
    assert.ok(travelling.has(name), `DAY_OPT_OUTS names ${name}, which is not an archive section any more`);
    assert.ok(!covered.has(name), `${name} is both registered and opted out`);
    assert.ok(reason.length > 0, `${name} is opted out with no reason`);
  }
});

test('a registry short of a section fails the coverage rule the real one passes', () => {
  /* The check above is only worth having if it can fail, and over the real
     registry it never does. So it is driven again over a registry with one
     section taken out: the same rule, the same opt-out list, and the area
     that section covered is now accounted for nowhere. */
  const withoutDoses = DAY_SECTIONS.filter((s) => !s.covers.includes('doseEvents'));
  const covered = new Set(withoutDoses.flatMap((s) => s.covers));
  const optedOut = new Set(Object.keys(DAY_OPT_OUTS));

  const unaccounted = ARCHIVE_SECTION_NAMES.filter((name) => !covered.has(name) && !optedOut.has(name));

  assert.deepEqual(unaccounted, ['doseEvents']);
});

test("the live layer's dependency list is every registered section's tables", () => {
  for (const s of DAY_SECTIONS) {
    for (const table of s.tables) {
      assert.ok(DAY_TABLES.includes(table), `${s.key} reads ${table}, which getDay does not depend on`);
    }
  }
  assert.equal(DAY_TABLES.length, new Set(DAY_TABLES).size, 'DAY_TABLES repeats a table');
});

test('a day holds one section per registered key, and each one is a list', async () => {
  const { journal } = await journalWithBuiltIns();
  await fillDay(journal);

  const day = await journal.day.getDay(DAY);

  assert.deepEqual(Object.keys(day).sort(), [...DAY_SECTION_KEYS].sort());
  for (const key of DAY_SECTION_KEYS) {
    assert.ok(Array.isArray(day[key]), `${key} is not a list`);
    assert.ok(day[key].length > 0, `${key} has nothing on a day that filled every area`);
  }
});

test('a day with nothing on it holds every section, all empty', async () => {
  const { journal } = await journalWithBuiltIns();
  await fillDay(journal);

  const day = await journal.day.getDay(DAY + 1);

  assert.deepEqual(Object.keys(day).sort(), [...DAY_SECTION_KEYS].sort());
  for (const key of DAY_SECTION_KEYS) assert.deepEqual(day[key], [], `${key} reached into another day`);
});

test('a section reads only its own day', async () => {
  const { journal } = await journalWithBuiltIns();
  await fillDay(journal, DAY);
  await fillDay(journal, DAY + 3);

  const day = await journal.day.getDay(DAY);

  assert.equal(day.entries.length, 1);
  assert.equal(day.entries[0].epochDay, DAY);
  assert.equal(day.doses.length, 1);
  assert.equal(day.labResults.length, 1);
  assert.equal(day.labResults[0].epochDay, DAY);
  assert.equal(day.tallyEvents.length, 1);
  assert.equal(day.procedureRecords.length, 2);
  // The marker is one row per effect that a later date replaces in place,
  // so filling a second day moves it rather than adding one.
  assert.equal(day.personalEffects.length, 0);
});

test('a felt-sense row says which tryout it belongs to, and a procedure record which procedure', async () => {
  const { journal } = await journalWithBuiltIns();
  await fillDay(journal);

  const day = await journal.day.getDay(DAY);

  assert.deepEqual(
    day.feltSense.map((f) => [f.owner.kind, f.owner.name]),
    [['tryout', 'Robin']]
  );
  assert.deepEqual(
    day.procedureRecords.map((r) => [r.kind, r.procedureName]).sort(),
    [
      ['consult', 'orchiectomy'],
      ['recovery-photo', 'orchiectomy']
    ]
  );
  assert.deepEqual(
    day.tryoutPhotos.map((p) => p.tryoutLabel),
    ['Robin']
  );
});

test('opening a day writes nothing', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await fillDay(journal);

  resetRoundTrips();
  await journal.day.getDay(DAY);

  assert.equal(roundTrips().run, 0, 'reading a day ran a statement that changes rows');
});

test('a maximal day costs one pass per area, not one per row', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await fillDay(journal);

  resetRoundTrips();
  await journal.day.getDay(DAY);
  const sparse = roundTrips().query;

  /* Ten more of everything on the same day. A read that walked its rows -
     a photo query per procedure, a felt-sense query per tryout - would grow
     with this; one that asks each area once does not. */
  for (let i = 0; i < 10; i += 1) await fillDay(journal);

  resetRoundTrips();
  await journal.day.getDay(DAY);
  const busy = roundTrips().query;

  assert.equal(
    busy,
    sparse,
    `a busy day cost ${busy} queries against a sparse day's ${sparse}: something reads per row`
  );
  /* 27 for 19 sections as this lands: entries hydrate their dimension
     values, tags, body regions, photos, recordings and video notes,
     milestones read their photos, and procedures asks for consults and
     recovery photos separately. Held as a number rather than derived so
     that a section quietly gaining a query has to come back here and say
     so. */
  assert.equal(busy, 27, `a day costs ${busy} queries across ${DAY_SECTIONS.length} sections`);
});

test('a test may register a section of its own and read it back through the same path', async () => {
  const { journal } = await journalWithBuiltIns();
  const invented: DaySection = {
    key: 'invented',
    covers: [],
    tables: [],
    read: async ({ epochDay }) => [{ epochDay }]
  };

  const area = makeDayArea(
    {
      entries: journal.entries,
      milestones: journal.milestones,
      doses: journal.doses,
      labs: journal.labs,
      voiceBenchmarks: journal.voiceBenchmarks,
      measurements: journal.measurements,
      sizeRecords: journal.sizeRecords,
      taper: journal.taper,
      sideEffects: journal.sideEffects,
      personalEffects: journal.personalEffects,
      cycleEvents: journal.cycleEvents,
      tally: journal.tally,
      wearSessions: journal.wearSessions,
      feltSense: journal.feltSense,
      hairProgress: journal.hairProgress,
      hairRemoval: journal.hairRemoval,
      procedures: journal.procedures,
      tryouts: journal.tryouts
    },
    [invented]
  );

  assert.deepEqual(await area.getDay(DAY), { invented: [{ epochDay: DAY }] } as never);
});
