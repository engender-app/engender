/* The one query behind every annotated chart (phase 5 deepening ticket 23). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { SURGERY_RECOVERY_CUTOFF_DAYS } from '../recoveryDay.ts';

const TODAY = 20200;

async function journalWith() {
  const db = await migratedDb();
  return openJournal(db, fakeFileStore());
}

test('gathers every dated area a chart can be annotated with', async () => {
  const journal = await journalWith();

  await journal.milestones.upsertMilestone({ name: 'first shot', epochDay: 20100 });
  const episode = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay: 20090,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 20120, endEpochDay: 20125, reason: 'planned' });
  await journal.tryouts.upsertTryout({ kind: 'name', label: 'Ada', startEpochDay: 20140, endEpochDay: 20150 });
  await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20160 });
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 20155, endEpochDay: null });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20199, TODAY);

  assert.deepEqual(
    found.map((a) => a.kind),
    ['regimen', 'milestone', 'dosePause', 'tryout', 'era', 'surgery', 'recovery']
  );
});

/* Phase 6 ticket 03: an era joins the six other areas, but only where it has
   a day to mark. An open start reaches back before the journal and has no
   boundary of its own to draw. */
test('a bounded era marks the day it starts, and an open start marks nothing', async () => {
  const journal = await journalWith();

  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 20100, endEpochDay: 20200 });
  await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 20099 });

  const found = await journal.chartAnnotations.getAnnotations(20000, 20300, TODAY);

  assert.deepEqual(
    found.filter((a) => a.kind === 'era').map((a) => ({ name: a.name, from: a.fromEpochDay, to: a.toEpochDay })),
    [{ name: 'first year', from: 20100, to: 20100 }]
  );
});

test('a dose pause is named by the drug of the episode it belongs to', async () => {
  const journal = await journalWith();

  const episode = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay: 20090,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 20120, endEpochDay: 20125, reason: 'planned' });

  const found = await journal.chartAnnotations.getAnnotations(20110, 20130, TODAY);
  const pause = found.find((a) => a.kind === 'dosePause');

  assert.equal(pause?.name, 'estradiol valerate');
});

/* Ticket 43: the regimen source carries the episode's end reason straight
   through, null on every episode that is still open or has none. */
test('a regimen annotation carries its episode\'s end reason', async () => {
  const journal = await journalWith();

  const withReason = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay: 20000,
    endEpochDay: null,
    endReason: null
  });
  await journal.regimen.endEpisode(withReason, 20050, 'pausedForNow');
  await journal.regimen.upsertEpisode({
    drug: 'progesterone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 20060,
    endEpochDay: null,
    endReason: null
  });

  const found = await journal.chartAnnotations.getAnnotations(20000, 20200, TODAY);
  const ended = found.find((a) => a.kind === 'regimen' && a.name === 'estradiol valerate');
  const ongoing = found.find((a) => a.kind === 'regimen' && a.name === 'progesterone');

  assert.equal(ended?.endReason, 'pausedForNow');
  assert.equal(ongoing?.endReason, null);
});

/* The surgery day and the weeks after it are two different marks: one is a
   day something happened on, the other is the stretch that followed. */
test('a procedure yields its surgery day and the recovery window after it', async () => {
  const journal = await journalWith();

  await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20100 });

  const found = await journal.chartAnnotations.getAnnotations(20000, 20199, TODAY);
  const surgery = found.find((a) => a.kind === 'surgery');
  const recovery = found.find((a) => a.kind === 'recovery');

  assert.equal(surgery?.fromEpochDay, 20100);
  assert.equal(surgery?.toEpochDay, 20100);
  assert.equal(recovery?.fromEpochDay, 20101);
  assert.equal(recovery?.toEpochDay, 20100 + SURGERY_RECOVERY_CUTOFF_DAYS);
  assert.equal(recovery?.name, 'top surgery');
});

test('a procedure with no date set annotates nothing', async () => {
  const journal = await journalWith();

  await journal.procedures.upsertProcedure({ name: 'facial surgery' });

  assert.deepEqual(await journal.chartAnnotations.getAnnotations(20000, 20199, TODAY), []);
});

/* Phase 8 features ticket 59: a past appointment joins the seam like any
   other dated area, named by the person's own kind. */
test('a past appointment marks the day it happened, named by its own kind', async () => {
  const journal = await journalWith();

  await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);
  const appointment = found.find((a) => a.kind === 'appointment');

  assert.equal(appointment?.name, 'endokrynolog');
  assert.equal(appointment?.fromEpochDay, 20100);
  assert.equal(appointment?.shape, 'point');
});

test('an appointment with no kind still draws, with no name of its own', async () => {
  const journal = await journalWith();

  await journal.appointments.upsertAppointment({
    epochDay: 20100,
    procedureId: null,
    kind: null,
    place: null,
    note: null
  });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);
  const appointment = found.find((a) => a.kind === 'appointment');

  assert.equal(appointment?.name, null);
});

test('a future appointment does not draw', async () => {
  const journal = await journalWith();

  await journal.appointments.upsertAppointment({
    epochDay: TODAY + 10,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  const found = await journal.chartAnnotations.getAnnotations(TODAY - 20, TODAY + 20, TODAY);

  assert.deepEqual(found.filter((a) => a.kind === 'appointment'), []);
});

/* A consult is an appointment whose procedureId is set (ADR-0066), and it
   draws the same way a standalone one does - no separate kind, no separate
   exclusion. */
test('a consult draws as an appointment, not as something the procedure owns alone', async () => {
  const journal = await journalWith();

  const procedureId = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20200 });
  await journal.procedures.addConsult(procedureId, 20100);

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);
  const appointment = found.find((a) => a.kind === 'appointment');

  assert.equal(appointment?.fromEpochDay, 20100);
});

test('nothing outside the range comes back', async () => {
  const journal = await journalWith();

  await journal.milestones.upsertMilestone({ name: 'long ago', epochDay: 19000 });
  await journal.milestones.upsertMilestone({ name: 'in view', epochDay: 20100 });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);

  assert.deepEqual(found.map((a) => a.name), ['in view']);
});

/* Nothing is stored about an episode that has not ended (ADR-0010), so the
   band it draws reaches to the day the caller says today is. */
test('an unfinished episode reaches to today and not to the end of the range', async () => {
  const journal = await journalWith();

  await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay: 20090,
    endEpochDay: null,
    endReason: null
  });

  const [found] = await journal.chartAnnotations.getAnnotations(20080, 20300, 20150);

  assert.equal(found.toEpochDay, 20150);
  assert.equal(found.endsInRange, false);
});

/* Phase 8 features ticket 04: the day a stream ended. */

test('a finished area marks the day it ended, on any chart covering it', async () => {
  const journal = await journalWith();
  // Both halves of the hair-progress row must be finished.
  await journal.areaStates.setAreasFinished(['hairStages', 'hairPhotos'], 20100);

  const marks = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  const finished = marks.filter((a) => a.kind === 'finishedArea');

  assert.equal(finished.length, 1);
  assert.equal(finished[0].shape, 'point');
  assert.equal(finished[0].fromEpochDay, 20100);
  // The group's key, not a section name: the words are the kit's
  // (kit/chartAnnotation.ts), and one hub row can front two sections.
  assert.equal(finished[0].name, 'hair-progress');
});

test('a row fronting two areas marks once, and not at all until both are finished', async () => {
  const journal = await journalWith();
  await journal.areaStates.setAreasFinished(['hairStages'], 20100);

  const half = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  assert.equal(half.filter((a) => a.kind === 'finishedArea').length, 0);

  await journal.areaStates.setAreasFinished(['hairPhotos'], 20100);
  const whole = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  const finished = whole.filter((a) => a.kind === 'finishedArea');

  assert.equal(finished.length, 1, 'one gesture, one mark');
  assert.equal(finished[0].name, 'hair-progress');
});

test('a finish day outside the range is not drawn, like everything else', async () => {
  const journal = await journalWith();
  await journal.areaStates.setAreasFinished(['wearSessions'], 19000);

  const marks = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  assert.equal(marks.filter((a) => a.kind === 'finishedArea').length, 0);
});

test('hiding an area draws nothing: only a finish day is a day', async () => {
  const journal = await journalWith();
  await journal.areaStates.setAreasHidden(['wearSessions'], true);

  const marks = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  assert.equal(marks.filter((a) => a.kind === 'finishedArea').length, 0);
});

/* Phase 8 features ticket 51: the day a stream was paused. Same shape as the
   finished mark above, on the one area here with a real case for it
   (hairRemovalSessions is not fronted by anything else, unlike voice). */

test('a suspended area marks the day it was paused, distinct from a finished one', async () => {
  const journal = await journalWith();
  await journal.areaStates.setAreasSuspended(['hairRemovalSessions'], 20100);

  const marks = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  const suspended = marks.filter((a) => a.kind === 'suspendedArea');

  assert.equal(suspended.length, 1);
  assert.equal(suspended[0].shape, 'point');
  assert.equal(suspended[0].fromEpochDay, 20100);
  assert.equal(suspended[0].name, 'hair-removal');
  assert.equal(marks.filter((a) => a.kind === 'finishedArea').length, 0);
});

test('a row fronting two areas marks suspended once, and not at all until both are', async () => {
  const journal = await journalWith();
  await journal.areaStates.setAreasSuspended(['voiceBenchmarks'], 20100);

  const half = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  assert.equal(half.filter((a) => a.kind === 'suspendedArea').length, 0);

  await journal.areaStates.setAreasSuspended(['voicePracticeTakes'], 20100);
  const whole = await journal.chartAnnotations.getAnnotations(20000, TODAY, TODAY);
  const suspended = whole.filter((a) => a.kind === 'suspendedArea');

  assert.equal(suspended.length, 1, 'one gesture, one mark');
  assert.equal(suspended[0].name, 'voice');
});

/* Phase 11 UI/UX ticket 49: a tick carries what the record behind it says,
   raw. The words are kit/chartAnnotation.ts's - this tier imports no
   paraglide (ADR-0016) - so what is asserted here is which field reached the
   annotation, and that a record with nothing written on it carries nothing. */

test('a milestone, a procedure and an appointment carry their own text', async () => {
  const journal = await journalWith();

  await journal.milestones.upsertMilestone({
    name: 'first shot',
    epochDay: 20100,
    description: 'hands shook the whole time'
  });
  await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: 20105,
    notes: 'two nights in'
  });
  await journal.appointments.upsertAppointment({
    epochDay: 20110,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: 'bring the labs'
  });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);
  const detailOf = (kind: string) => found.find((a) => a.kind === kind)?.detail;

  assert.deepEqual(detailOf('milestone'), { type: 'note', text: 'hands shook the whole time' });
  assert.deepEqual(detailOf('surgery'), { type: 'note', text: 'two nights in' });
  assert.deepEqual(detailOf('appointment'), { type: 'note', text: 'bring the labs' });
  // The stretch after the operation is a band, and a band says no more than
  // it did before this existed.
  assert.equal(detailOf('recovery'), undefined);
});

test('a record with nothing written on it carries nothing to print', async () => {
  const journal = await journalWith();

  await journal.milestones.upsertMilestone({ name: 'first shot', epochDay: 20100 });
  await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20105, notes: '   ' });
  await journal.appointments.upsertAppointment({
    epochDay: 20110,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20120, TODAY);
  for (const annotation of found) {
    assert.equal(annotation.detail, undefined, `${annotation.kind} invented text nobody wrote`);
  }
});
