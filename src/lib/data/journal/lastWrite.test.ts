/* The last-write registry (phase 8 features ticket 03): that every area
   either has an entry or is written down as deliberately having none, that
   each entry's read is a bounded MAX rather than a fetched list, that a row
   dated after today never counts, and that one call answers for every area
   at once.

   What each area's own read means is not tested here - that is each area's
   own test file (measurements.test.ts, doses.test.ts, ...). This is the
   registry: which areas answer, what a read costs, and the today bound. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from '../epochDay.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import {
  LAST_WRITE_ENTRIES,
  LAST_WRITE_OPT_OUTS,
  LAST_WRITE_TABLES,
  makeLastWriteArea,
  type LastWriteEntry
} from './lastWrite.ts';
import { openJournal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';

const TODAY = 20000;
const at = (epochDay: number, hour = 9) => startOfDayTimestamp(epochDay) + hour * 3600000;

const photo = () => ({ full: new Uint8Array([0xff, 0xd8, 0xff]), thumb: new Uint8Array([0xff, 0xd8]) });

test('every archive section either has a last-write entry or says why it does not', () => {
  const registered = new Set(LAST_WRITE_ENTRIES.map((e) => e.key));
  const optedOut = new Set(Object.keys(LAST_WRITE_OPT_OUTS));

  for (const name of ARCHIVE_SECTION_NAMES) {
    assert.ok(
      registered.has(name) || optedOut.has(name),
      `${name} is registered nowhere: give it a last-write entry, or a reason in LAST_WRITE_OPT_OUTS`
    );
  }
});

test('nothing is both registered and opted out, and no opt-out names an area that no longer travels', () => {
  const travelling = new Set<string>(ARCHIVE_SECTION_NAMES);
  const registered = new Set(LAST_WRITE_ENTRIES.map((e) => e.key));

  for (const [name, reason] of Object.entries(LAST_WRITE_OPT_OUTS) as [string, string][]) {
    assert.ok(travelling.has(name), `LAST_WRITE_OPT_OUTS names ${name}, which is not an archive section any more`);
    assert.ok(!registered.has(name), `${name} is both registered and opted out`);
    assert.ok(reason.length > 0, `${name} is opted out with no reason`);
  }
});

test('a registry short of an entry fails the coverage rule the real one passes', () => {
  /* The check above is only worth having if it can fail, and over the real
     registry it never does. So it is driven again over a registry with one
     entry taken out: the same rule, the same opt-out list, and the area
     that entry covered is now accounted for nowhere. */
  const withoutDoses = LAST_WRITE_ENTRIES.filter((e) => e.key !== 'doseEvents');
  const registered = new Set(withoutDoses.map((e) => e.key));
  const optedOut = new Set(Object.keys(LAST_WRITE_OPT_OUTS));

  const unaccounted = ARCHIVE_SECTION_NAMES.filter((name) => !registered.has(name) && !optedOut.has(name));

  assert.deepEqual(unaccounted, ['doseEvents']);
});

test('every entry is unique and LAST_WRITE_TABLES is every entry\'s tables, de-duplicated', () => {
  const keys = LAST_WRITE_ENTRIES.map((e) => e.key);
  assert.equal(keys.length, new Set(keys).size, 'an area is registered twice');

  for (const e of LAST_WRITE_ENTRIES) {
    for (const table of e.tables) {
      assert.ok(LAST_WRITE_TABLES.includes(table), `${e.key} reads ${table}, which LAST_WRITE_TABLES does not include`);
    }
  }
  assert.equal(LAST_WRITE_TABLES.length, new Set(LAST_WRITE_TABLES).size, 'LAST_WRITE_TABLES repeats a table');
});

test('a journal with no writes at all answers null for every area', async () => {
  const { journal } = await journalWithBuiltIns();

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.deepEqual(Object.keys(lastWrites).sort(), LAST_WRITE_ENTRIES.map((e) => e.key).sort());
  for (const key of Object.keys(lastWrites)) {
    assert.equal(lastWrites[key as keyof typeof lastWrites], null, `${key} answered something over an empty journal`);
  }
});

test('writing in one area only answers that area and leaves every other one null', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sizeRecords.upsertRecord({ epochDay: TODAY - 3, category: 'bras', size: '70B' });

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(lastWrites.sizeRecords, TODAY - 3);
  for (const key of Object.keys(lastWrites)) {
    if (key === 'sizeRecords') continue;
    assert.equal(lastWrites[key as keyof typeof lastWrites], null, `${key} answered something nobody wrote to`);
  }
});

test('an area with two writes answers the newer day, not the one written last', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'later', epochDay: TODAY - 1 });
  await journal.milestones.upsertMilestone({ name: 'earlier', epochDay: TODAY - 10 });

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(lastWrites.milestones, TODAY - 1);
});

test('a row dated after today does not count as the last write', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'past', epochDay: TODAY - 5 });
  await journal.milestones.upsertMilestone({ name: 'future', epochDay: TODAY + 5 });

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(lastWrites.milestones, TODAY - 5, 'the future row was trusted as the last write');
});

test('an area whose newest row is in the future, with nothing before it, answers null', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'future', epochDay: TODAY + 5 });

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(lastWrites.milestones, null);
});

test('an area whose rows were all deleted answers null again', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: TODAY });

  assert.equal((await journal.lastWrite.getLastWrites(TODAY)).sideEffects, TODAY);

  await journal.sideEffects.deleteSideEffect(id);

  assert.equal((await journal.lastWrite.getLastWrites(TODAY)).sideEffects, null);
});

test('a timestamp-stored area is bounded by the start of the day after today', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({
    timestamp: at(TODAY, 23),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });

  assert.equal((await journal.lastWrite.getLastWrites(TODAY)).doseEvents, TODAY, "today's own dose did not count");

  await journal.doses.upsertDose({
    timestamp: at(TODAY + 1, 0),
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });

  assert.equal(
    (await journal.lastWrite.getLastWrites(TODAY)).doseEvents,
    TODAY,
    "tomorrow's dose counted as today's last write"
  );
});

test("hair progress' two entries read their own table and never the other's", async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairProgress.upsertStage({ epochDay: TODAY - 1, scale: 'other', stage: '', description: 'softer' });
  await journal.hairProgress.addPhoto(TODAY - 9, photo());

  const lastWrites = await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(lastWrites.hairStages, TODAY - 1);
  assert.equal(lastWrites.hairPhotos, TODAY - 9);
});

test("procedures' last write is the later of a consult and a recovery photo, never the surgery date", async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'orchiectomy', surgeryEpochDay: TODAY - 100 });
  await journal.procedures.addConsult(procedureId, TODAY - 30);
  await journal.procedures.addPhoto(procedureId, TODAY - 2, photo());

  assert.equal((await journal.lastWrite.getLastWrites(TODAY)).procedures, TODAY - 2);
});

test("a tryout's last write is its photos, never its own start day", async () => {
  const { journal } = await journalWithBuiltIns();
  const withoutPhoto = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'no photo yet',
    startEpochDay: TODAY - 60,
    endEpochDay: null
  });

  assert.equal(
    (await journal.lastWrite.getLastWrites(TODAY)).tryouts,
    null,
    "the tryout's own start day counted as a last write"
  );

  await journal.tryouts.addPhoto(withoutPhoto, TODAY - 4, photo());

  assert.equal((await journal.lastWrite.getLastWrites(TODAY)).tryouts, TODAY - 4);
});

test('opening the last-write read writes nothing', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();

  resetRoundTrips();
  await journal.lastWrite.getLastWrites(TODAY);

  assert.equal(roundTrips().run, 0, 'reading last writes ran a statement that changes rows');
});

test('the assembled read costs one query per registered area', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();

  resetRoundTrips();
  await journal.lastWrite.getLastWrites(TODAY);

  /* One per registered entry - even hairProgress, which registers two
     entries against the same underlying area, runs two queries because each
     asks its own table. */
  assert.equal(roundTrips().query, LAST_WRITE_ENTRIES.length);
});

test('a test may register an entry of its own and read it back through the same path', async () => {
  const { journal } = await journalWithBuiltIns();
  const invented: LastWriteEntry = {
    key: 'invented',
    tables: [],
    read: async ({ todayEpochDay }) => todayEpochDay
  };

  const area = makeLastWriteArea(
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
    [...LAST_WRITE_ENTRIES, invented]
  );

  const lastWrites = (await area.getLastWrites(TODAY)) as Record<string, number | null>;

  assert.equal(lastWrites.invented, TODAY);
});
