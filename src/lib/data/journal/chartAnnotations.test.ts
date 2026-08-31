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
    endEpochDay: null
  });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 20120, endEpochDay: 20125, reason: 'planned' });
  await journal.journalingPauses.upsertPause({ startEpochDay: 20130, endEpochDay: 20134 });
  await journal.tryouts.upsertTryout({ kind: 'name', label: 'Ada', startEpochDay: 20140, endEpochDay: 20150 });
  await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20160 });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20199, TODAY);

  assert.deepEqual(
    found.map((a) => a.kind),
    ['regimen', 'milestone', 'dosePause', 'journalingPause', 'tryout', 'surgery', 'recovery']
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
    endEpochDay: null
  });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 20120, endEpochDay: 20125, reason: 'planned' });

  const found = await journal.chartAnnotations.getAnnotations(20110, 20130, TODAY);
  const pause = found.find((a) => a.kind === 'dosePause');

  assert.equal(pause?.name, 'estradiol valerate');
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
    endEpochDay: null
  });

  const [found] = await journal.chartAnnotations.getAnnotations(20080, 20300, 20150);

  assert.equal(found.toEpochDay, 20150);
  assert.equal(found.endsInRange, false);
});
