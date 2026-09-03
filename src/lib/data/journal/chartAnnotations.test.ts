/* The one query behind every annotated chart (phase 5 deepening ticket 23). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { SURGERY_RECOVERY_CUTOFF_DAYS } from '../recoveryDay.ts';
import { startOfDayTimestamp } from '../epochDay.ts';

const TODAY = 20200;

async function journalWith() {
  const db = await migratedDb();
  return openJournal(db, fakeFileStore());
}

/** The same, with the built-in body regions seeded: an entry may only name a
    region the journal knows (entries.ts's assertKnownBodyRegions). */
async function journalWithRegions() {
  const journal = await journalWith();
  await journal.reconcileBuiltIns();
  return journal;
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
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 20155, endEpochDay: null });

  const found = await journal.chartAnnotations.getAnnotations(20080, 20199, TODAY);

  assert.deepEqual(
    found.map((a) => a.kind),
    ['regimen', 'milestone', 'dosePause', 'journalingPause', 'tryout', 'era', 'surgery', 'recovery']
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

/* Phase 8 features ticket 15: the hormone curve's own four kinds, which are a
   separate ask so that no chart that opted into annotations starts drawing
   them (the ticket rules out rendering any of this on /stats). */

/** A day inside the window that sets the threshold, counting back from
    TODAY. Written this way so a test says how recent a reading is rather
    than doing the arithmetic in its head. */
const daysAgo = (n: number) => TODAY - n;

/** Enough steady readings for there to be a spread at all (ownSpread.ts's
    OWN_SPREAD_MIN_READINGS), spaced a day apart under the run of interest. */
async function steadyTallies(journal: Awaited<ReturnType<typeof journalWith>>, count: number) {
  for (let i = 0; i < count; i++) {
    await journal.tally.log({ epochDay: daysAgo(20 + i), kind: 'misgendered' });
  }
}

test('the four extra kinds are the curve markers and never the ordinary annotations', async () => {
  const journal = await journalWith();

  await journal.sideEffects.upsertSideEffect({ name: 'headaches', severity: 3, epochDay: daysAgo(10) });
  await journal.milestones.upsertMilestone({ name: 'first shot', epochDay: daysAgo(10) });

  const annotations = await journal.chartAnnotations.getAnnotations(daysAgo(90), TODAY, TODAY);
  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    annotations.map((a) => a.kind),
    ['milestone']
  );
  assert.deepEqual(
    markers.map((a) => a.kind),
    ['sideEffect']
  );
});

test('a side effect marks its own day and goes to the side effects screen', async () => {
  const journal = await journalWith();

  await journal.sideEffects.upsertSideEffect({ name: 'headaches', severity: 2, epochDay: daysAgo(10) });
  await journal.sideEffects.upsertSideEffect({ name: 'long gone', severity: 2, epochDay: daysAgo(300) });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => ({ name: a.name, day: a.fromEpochDay, href: a.href })),
    [{ name: 'headaches', day: daysAgo(10), href: '/settings/side-effects' }]
  );
});

/* The band is built from injections that were actually taken, so the marks
   under it have to be the same set: a mark under a peak the curve does not
   have reads as the chart disagreeing with itself. */
test('injections mark, an oral dose does not, and a skipped injection does not', async () => {
  const journal = await journalWith();
  const at = (day: number) => startOfDayTimestamp(day) + 36000000;

  await journal.doses.upsertDose({
    timestamp: at(daysAgo(14)),
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });
  await journal.doses.upsertDose({
    timestamp: at(daysAgo(7)),
    dose: 4,
    doseUnit: 'mg',
    status: 'skipped',
    route: 'im',
    injectionSite: 'thigh-right',
    vehicle: 'oil'
  });
  await journal.doses.upsertDose({ timestamp: at(daysAgo(3)), dose: 2, doseUnit: 'mg', route: 'oral' });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => ({ kind: a.kind, day: a.fromEpochDay, href: a.href })),
    [{ kind: 'injection', day: daysAgo(14), href: '/doses' }]
  );
});

test('a tally day above the person\'s own recent counts marks, and the steady ones do not', async () => {
  const journal = await journalWith();

  await steadyTallies(journal, 10);
  for (let i = 0; i < 5; i++) await journal.tally.log({ epochDay: daysAgo(5), kind: 'misgendered' });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => ({ kind: a.kind, day: a.fromEpochDay, href: a.href })),
    [{ kind: 'tallyMisgendered', day: daysAgo(5), href: '/tally' }]
  );
});

test('the two counters are two kinds, so a mark never means the opposite of what it says', async () => {
  const journal = await journalWith();

  for (let i = 0; i < 10; i++) {
    await journal.tally.log({ epochDay: daysAgo(20 + i), kind: 'correctly_gendered' });
  }
  for (let i = 0; i < 5; i++) await journal.tally.log({ epochDay: daysAgo(5), kind: 'correctly_gendered' });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => a.kind),
    ['tallyCorrectlyGendered']
  );
});

test('nothing is marked while there is too little of the person\'s own to have a spread', async () => {
  const journal = await journalWith();

  await steadyTallies(journal, 3);
  for (let i = 0; i < 20; i++) await journal.tally.log({ epochDay: daysAgo(5), kind: 'misgendered' });

  assert.deepEqual(await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY), []);
});

test('a region reading above that region\'s own spread goes to the entry it was logged on', async () => {
  const journal = await journalWithRegions();

  for (let i = 0; i < 10; i++) {
    await journal.entries.upsertEntry({
      epochDay: daysAgo(20 + i),
      mood: 3,
      bodyRegions: { chest: { dysphoria: 20, euphoria: 20 } }
    });
  }
  const stoodOut = await journal.entries.upsertEntry({
    epochDay: daysAgo(4),
    mood: 3,
    bodyRegions: { chest: { dysphoria: 95, euphoria: null } }
  });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => ({ kind: a.kind, name: a.name, day: a.fromEpochDay, href: a.href })),
    [{ kind: 'bodyRegionDysphoria', name: 'chest', day: daysAgo(4), href: `/entry/${stoodOut}` }]
  );
});

test('euphoria is marked on its own terms and not against dysphoria', async () => {
  const journal = await journalWithRegions();

  for (let i = 0; i < 10; i++) {
    await journal.entries.upsertEntry({
      epochDay: daysAgo(20 + i),
      mood: 3,
      bodyRegions: { chest: { dysphoria: 80, euphoria: 10 } }
    });
  }
  await journal.entries.upsertEntry({
    epochDay: daysAgo(4),
    mood: 3,
    bodyRegions: { chest: { dysphoria: 80, euphoria: 90 } }
  });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => a.kind),
    ['bodyRegionEuphoria']
  );
});

/* Two regions on different scales pooled into one sample would give a fence
   in the middle: every ordinary chest reading marked, and a hand reading
   marked by nothing it did. */
test('each region is judged against itself', async () => {
  const journal = await journalWithRegions();

  // Chest sits high and moves about; hands sit low and barely move.
  const chestRun = [60, 65, 70, 75, 80, 60, 65, 70, 75, 80];
  const handsRun = [2, 4, 6, 8, 10, 2, 4, 6, 8, 10];
  for (let i = 0; i < chestRun.length; i++) {
    await journal.entries.upsertEntry({
      epochDay: daysAgo(20 + i),
      mood: 3,
      bodyRegions: {
        chest: { dysphoria: chestRun[i], euphoria: null },
        hands_feet: { dysphoria: handsRun[i], euphoria: null }
      }
    });
  }
  // 78 is an ordinary day for this chest and 60 is nothing this hand has ever
  // been. Pooled into one sample the fence sits between the two runs, which
  // would mark the chest reading and miss the hand one entirely.
  await journal.entries.upsertEntry({
    epochDay: daysAgo(4),
    mood: 3,
    bodyRegions: { chest: { dysphoria: 78, euphoria: null }, hands_feet: { dysphoria: 60, euphoria: null } }
  });

  const markers = await journal.chartAnnotations.getCurveMarkers(daysAgo(90), TODAY, TODAY);

  assert.deepEqual(
    markers.map((a) => a.name),
    ['hands_feet']
  );
});
