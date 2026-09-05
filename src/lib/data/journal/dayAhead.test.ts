/* The dayAhead registry (phase 8 features ticket 61, ADR-0067): that every
   archive section either earns a mark or is written down as deliberately
   earning none, that a mark never predates today even when the range asked
   for reaches back before it, and that each of the five kinds reads what the
   ticket says it should.

   What each area's own read means beyond that is not re-tested here - that
   is each area's own test file. This is the registry: which kinds answer,
   the today floor, and the five kinds' own selection rules. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { ARCHIVE_SECTION_NAMES } from './archiveSections.ts';
import {
  DAY_AHEAD_OPT_OUTS,
  DAY_AHEAD_SECTIONS,
  DAY_AHEAD_TABLES,
  makeDayAheadArea,
  type DayAheadSection
} from './dayAhead.ts';
import { openJournal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';

const TODAY = 20000;

test('every archive section either earns a mark or says why it does not', () => {
  const registered = new Set(DAY_AHEAD_SECTIONS.flatMap((s) => s.covers));
  const optedOut = new Set(Object.keys(DAY_AHEAD_OPT_OUTS));

  for (const name of ARCHIVE_SECTION_NAMES) {
    assert.ok(
      registered.has(name) || optedOut.has(name),
      `${name} is registered nowhere: give it a section above, or a reason in DAY_AHEAD_OPT_OUTS`
    );
  }
});

test('nothing is both covered and opted out, and no opt-out names an area that no longer travels', () => {
  const travelling = new Set<string>(ARCHIVE_SECTION_NAMES);
  const registered = new Set(DAY_AHEAD_SECTIONS.flatMap((s) => s.covers));

  for (const [name, reason] of Object.entries(DAY_AHEAD_OPT_OUTS) as [string, string][]) {
    assert.ok(travelling.has(name), `DAY_AHEAD_OPT_OUTS names ${name}, which is not an archive section any more`);
    assert.ok(!registered.has(name), `${name} is both covered and opted out`);
    assert.ok(reason.length > 0, `${name} is opted out with no reason`);
  }
});

test('a registry short of a section fails the coverage rule the real one passes', () => {
  const withoutMilestones = DAY_AHEAD_SECTIONS.filter((s) => s.key !== 'milestone');
  const registered = new Set(withoutMilestones.flatMap((s) => s.covers));
  const optedOut = new Set(Object.keys(DAY_AHEAD_OPT_OUTS));

  const unaccounted = ARCHIVE_SECTION_NAMES.filter((name) => !registered.has(name) && !optedOut.has(name));

  assert.deepEqual(unaccounted, ['milestones']);
});

test('every kind is unique and DAY_AHEAD_TABLES is every section\'s tables, de-duplicated', () => {
  const keys = DAY_AHEAD_SECTIONS.map((s) => s.key);
  assert.equal(keys.length, new Set(keys).size, 'a kind is registered twice');

  for (const s of DAY_AHEAD_SECTIONS) {
    for (const table of s.tables) {
      assert.ok(DAY_AHEAD_TABLES.includes(table), `${s.key} reads ${table}, which DAY_AHEAD_TABLES does not include`);
    }
  }
  assert.equal(DAY_AHEAD_TABLES.length, new Set(DAY_AHEAD_TABLES).size, 'DAY_AHEAD_TABLES repeats a table');
});

test('a journal with nothing coming up answers with no marks at all', async () => {
  const { journal } = await journalWithBuiltIns();

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 60, TODAY);

  assert.deepEqual(marks, []);
});

test('an appointment still ahead earns a mark, and one already past does not', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.appointments.upsertAppointment({
    epochDay: TODAY + 10,
    procedureId: null,
    kind: 'endocrinologist',
    place: null,
    note: null
  });
  await journal.appointments.upsertAppointment({
    epochDay: TODAY - 10,
    procedureId: null,
    kind: 'past one',
    place: null,
    note: null
  });

  const marks = await journal.dayAhead.getDayAhead(TODAY - 30, TODAY + 30, TODAY);

  assert.deepEqual(marks, [{ kind: 'appointment', epochDay: TODAY + 10 }]);
});

test("a surgery date still ahead earns its own kind, and its own milestone does not earn a second mark", async () => {
  const { journal } = await journalWithBuiltIns();
  const procedureId = await journal.procedures.upsertProcedure({ name: 'vaginoplasty', surgeryEpochDay: TODAY + 40 });
  await journal.milestones.upsertMilestone({ name: 'surgery day', epochDay: TODAY + 40, procedureId });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 60, TODAY);

  assert.deepEqual(marks, [{ kind: 'surgery', epochDay: TODAY + 40 }]);
});

test('a milestone still ahead with no procedure earns a milestone mark', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.milestones.upsertMilestone({ name: 'one year on HRT', epochDay: TODAY + 5 });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 10, TODAY);

  assert.deepEqual(marks, [{ kind: 'milestone', epochDay: TODAY + 5 }]);
});

test("a letter's unlock day earns a mark that carries no id and no text", async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.letters.addLetter({ epochDay: TODAY - 100, text: 'dear future me', unlockEpochDay: TODAY + 20 });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 30, TODAY);

  assert.deepEqual(marks, [{ kind: 'letterUnlock', epochDay: TODAY + 20 }]);
});

test('a daily dose schedule produces no marks; a weekly one does', async () => {
  const { journal } = await journalWithBuiltIns();
  const dailyEpisode = await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: 'valerate',
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: TODAY - 100,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertSchedule({
    episodeId: dailyEpisode,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: null
  });

  const weeklyEpisode = await journal.regimen.upsertEpisode({
    drug: 'testosterone',
    ester: 'cypionate',
    dose: 50,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: TODAY,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertSchedule({
    episodeId: weeklyEpisode,
    recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1,
    doseAmounts: null
  });

  // The weekly episode's own anchor is today, so its next slot after today
  // lands in a week - the range starts the day after today to keep the
  // anchor day itself, which is today's own dose rather than a mark, out of
  // the window.
  const marks = await journal.dayAhead.getDayAhead(TODAY + 1, TODAY + 7, TODAY);

  assert.deepEqual(
    marks.filter((m) => m.kind === 'doseSlot'),
    [{ kind: 'doseSlot', epochDay: TODAY + 7 }]
  );
});

test('a pause covering the next slot suppresses its mark', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await journal.regimen.upsertEpisode({
    drug: 'testosterone',
    ester: 'cypionate',
    dose: 50,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: TODAY - 100,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1,
    doseAmounts: null
  });
  await journal.doses.upsertPause({ episodeId, startEpochDay: TODAY, endEpochDay: TODAY + 7, reason: 'planned' });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 7, TODAY);

  assert.deepEqual(
    marks.filter((m) => m.kind === 'doseSlot'),
    []
  );
});

test('a mark never predates today, even when the range asked for reaches back before it', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.appointments.upsertAppointment({
    epochDay: TODAY - 5,
    procedureId: null,
    kind: 'already happened',
    place: null,
    note: null
  });

  const marks = await journal.dayAhead.getDayAhead(TODAY - 30, TODAY + 30, TODAY);

  assert.deepEqual(marks, []);
});

test("today's own fact earns a mark: dayAhead is not only the future", async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.appointments.upsertAppointment({
    epochDay: TODAY,
    procedureId: null,
    kind: 'this afternoon',
    place: null,
    note: null
  });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY, TODAY);

  assert.deepEqual(marks, [{ kind: 'appointment', epochDay: TODAY }]);
});

test('two kinds landing on the same day both come back, and the caller sees both', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.appointments.upsertAppointment({
    epochDay: TODAY + 3,
    procedureId: null,
    kind: 'checkup',
    place: null,
    note: null
  });
  await journal.milestones.upsertMilestone({ name: 'a year since', epochDay: TODAY + 3 });

  const marks = await journal.dayAhead.getDayAhead(TODAY, TODAY + 3, TODAY);

  assert.deepEqual(
    marks.sort((a, b) => a.kind.localeCompare(b.kind)),
    [
      { kind: 'appointment', epochDay: TODAY + 3 },
      { kind: 'milestone', epochDay: TODAY + 3 }
    ]
  );
});

test('opening the read writes nothing', async () => {
  const db = await migratedDb();
  const { driver, roundTrips, resetRoundTrips } = countingDriver(db);
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();

  resetRoundTrips();
  await journal.dayAhead.getDayAhead(TODAY, TODAY + 30, TODAY);

  assert.equal(roundTrips().run, 0, 'reading marks ran a statement that changes rows');
});

test('a test may register a section of its own and read it back through the same path', async () => {
  const { journal } = await journalWithBuiltIns();
  const invented: DayAheadSection = {
    key: 'milestone',
    covers: [],
    tables: [],
    read: async ({ todayEpochDay }) => [todayEpochDay]
  };

  const area = makeDayAheadArea(
    {
      appointments: journal.appointments,
      procedures: journal.procedures,
      milestones: journal.milestones,
      letters: journal.letters,
      regimen: journal.regimen,
      doses: journal.doses
    },
    [invented]
  );

  const marks = await area.getDayAhead(TODAY, TODAY, TODAY);

  assert.deepEqual(marks, [{ kind: 'milestone', epochDay: TODAY }]);
});
