import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RETURN_GAP_DAYS, WAITING_PER_KIND, lastWriteDay, waitingItemKey, whatIsWaiting } from './comingBack.ts';
import { adherence, expectedSlots } from './doseSchedule.ts';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, DoseSchedule, RegimenEpisode } from './types.ts';

const TODAY = 20000;
const AWAY = TODAY - 40;

const SCHEDULE: DoseSchedule = {
  id: 's1',
  episodeId: 'e1',
  recurrence: { kind: 'everyNDays', everyNDays: 7 },
  dosesPerDay: 1,
  doseAmounts: [{ dose: 4, doseUnit: 'mg' }]
};

const EPISODE: RegimenEpisode = {
  id: 'e1',
  drug: 'estradiol valerate',
  ester: 'valerate',
  route: 'intramuscular',
  interval: 'every 7 days',
  dose: 4,
  doseUnit: 'mg',
  startEpochDay: TODAY - 400,
  endEpochDay: null
};

/** The gap window's dose comparison, as `doses.getComparison` answers it:
    the slots the schedule expected between the last write and yesterday,
    with whatever was logged against them. */
function comparison(loggedSlotDays: readonly number[] = []) {
  const slots = expectedSlots(SCHEDULE, EPISODE.startEpochDay, AWAY + 1, TODAY - 1);
  const doses: DoseEvent[] = loggedSlotDays.map((epochDay, index) => ({
    id: `d${index}`,
    timestamp: startOfDayTimestamp(epochDay) + 12 * 3_600_000,
    route: 'im' as const,
    dose: 4,
    doseUnit: 'mg',
    status: 'taken' as const,
    injectionSite: 'thigh-left',
    vehicle: 'oil' as const,
    scheduled: null,
    drug: null
  }));
  return { reason: null as null, activeEpisode: EPISODE, schedule: SCHEDULE, pauses: [], comparison: adherence(slots, doses, []) };
}

const BASE = {
  todayEpochDay: TODAY,
  lastWrites: { entries: AWAY, doseEvents: AWAY - 2 },
  letters: [],
  milestones: [],
  eras: [],
  runningWearSession: null,
  doses: { reason: 'noEpisode' as const }
};

test('the last write is the newest day any area answers with, and null when none does', () => {
  assert.equal(lastWriteDay({ entries: 19000, doseEvents: 19500, labResults: null }), 19500);
  assert.equal(lastWriteDay({ entries: null, doseEvents: null }), null);
  assert.equal(lastWriteDay({}), null);
});

test('nothing is waiting inside the threshold, however much has arrived', () => {
  const nearly = TODAY - (RETURN_GAP_DAYS - 1);

  assert.equal(
    whatIsWaiting({
      ...BASE,
      lastWrites: { entries: nearly },
      letters: [{ id: 'l1', unlockEpochDay: nearly + 1 }]
    }),
    null
  );
});

test('the threshold itself is a return, not the day before it', () => {
  const exactly = TODAY - RETURN_GAP_DAYS;
  const surface = whatIsWaiting({
    ...BASE,
    lastWrites: { entries: exactly },
    letters: [{ id: 'l1', unlockEpochDay: exactly + 3 }]
  });

  assert.equal(surface?.sinceEpochDay, exactly);
  assert.deepEqual(surface?.items, [{ kind: 'letter', letterId: 'l1', unlockEpochDay: exactly + 3 }]);
});

test('a journal nobody has ever written to has nothing to come back to', () => {
  assert.equal(whatIsWaiting({ ...BASE, lastWrites: { entries: null } }), null);
});

test('a long gap with nothing waiting draws nothing', () => {
  assert.equal(whatIsWaiting(BASE), null);
});

test('a letter that unlocked before the gap is not something that arrived in it', () => {
  const surface = whatIsWaiting({
    ...BASE,
    letters: [
      { id: 'early', unlockEpochDay: AWAY - 5 },
      { id: 'in-the-gap', unlockEpochDay: AWAY + 10 },
      { id: 'today', unlockEpochDay: TODAY },
      { id: 'sealed', unlockEpochDay: TODAY + 30 }
    ]
  });

  assert.deepEqual(
    surface?.items.map((item) => (item.kind === 'letter' ? item.letterId : item.kind)),
    ['today', 'in-the-gap']
  );
});

test('a milestone whose day came while nobody looked is waiting, a future one is not', () => {
  const surface = whatIsWaiting({
    ...BASE,
    milestones: [
      { id: 'past', name: 'One year on HRT', epochDay: AWAY - 1 },
      { id: 'arrived', name: 'Name change hearing', epochDay: AWAY + 12 },
      { id: 'ahead', name: 'Surgery', epochDay: TODAY + 5 }
    ]
  });

  assert.deepEqual(surface?.items, [
    { kind: 'milestone', milestoneId: 'arrived', name: 'Name change hearing', epochDay: AWAY + 12 }
  ]);
});

test('the era covering today is waiting only while it is still open', () => {
  const open = { id: 'now', name: 'Second year', startEpochDay: AWAY - 100, endEpochDay: null };
  const closed = { id: 'then', name: 'First year', startEpochDay: AWAY - 400, endEpochDay: AWAY - 101 };

  assert.deepEqual(whatIsWaiting({ ...BASE, eras: [closed, open] })?.items, [
    { kind: 'era', eraId: 'now', name: 'Second year', startEpochDay: AWAY - 100 }
  ]);
  assert.equal(whatIsWaiting({ ...BASE, eras: [closed] }), null);
});

test('a wear session still running is waiting, and carries the day it started', () => {
  const surface = whatIsWaiting({
    ...BASE,
    runningWearSession: { id: 'w1', startTimestamp: startOfDayTimestamp(AWAY - 1) + 3_600_000 }
  });

  assert.deepEqual(surface?.items, [
    {
      kind: 'wear-session',
      sessionId: 'w1',
      startEpochDay: AWAY - 1,
      startTimestamp: startOfDayTimestamp(AWAY - 1) + 3_600_000
    }
  ]);
});

test('one dose slot is asked about, the most recent one, and never a count of the rest', () => {
  const surface = whatIsWaiting({ ...BASE, doses: comparison() });
  const dose = surface?.items.find((item) => item.kind === 'dose');

  assert.deepEqual(dose, {
    kind: 'dose',
    slotEpochDay: TODAY - 1,
    episodeId: 'e1',
    episodeRoute: 'intramuscular',
    drug: 'estradiol valerate',
    dose: 4,
    doseUnit: 'mg'
  });
  assert.equal(surface?.items.filter((item) => item.kind === 'dose').length, 1);
});

test("a slot the person has since logged is not asked about, and the gap's other slots stay unlogged", () => {
  const logged = comparison([TODAY - 1]);
  const surface = whatIsWaiting({ ...BASE, doses: logged });
  const dose = surface?.items.find((item) => item.kind === 'dose');

  assert.equal(dose?.kind === 'dose' ? dose.slotEpochDay : null, TODAY - 8);
  // The record still shows the gap: backfilling one slot fills one row.
  assert.equal(logged.comparison.rows.filter((row) => row.dose === null).length, logged.comparison.rows.length - 1);
});

test("today's own slot belongs to today, not to the gap", () => {
  const onlyToday = {
    reason: null as null,
    activeEpisode: EPISODE,
    schedule: SCHEDULE,
    pauses: [],
    comparison: adherence(expectedSlots(SCHEDULE, EPISODE.startEpochDay, TODAY, TODAY), [], [])
  };

  assert.equal(whatIsWaiting({ ...BASE, doses: onlyToday }), null);
});

test('a schedule the app cannot compare against asks nothing about doses', () => {
  for (const reason of ['noEpisode', 'multipleEpisodes'] as const) {
    assert.equal(whatIsWaiting({ ...BASE, doses: { reason } }), null);
  }
  assert.equal(whatIsWaiting({ ...BASE, doses: { reason: 'noSchedule', activeEpisode: EPISODE } }), null);
});

test('a doorway rather than an inbox: each kind stops at a few rows', () => {
  const many = Array.from({ length: WAITING_PER_KIND + 3 }, (_, index) => ({
    id: `l${index}`,
    unlockEpochDay: AWAY + 1 + index
  }));
  const surface = whatIsWaiting({ ...BASE, letters: many });

  assert.equal(surface?.items.length, WAITING_PER_KIND);
  // The newest arrivals, since those are the ones the person has not met.
  assert.deepEqual(
    surface?.items.map((item) => (item.kind === 'letter' ? item.letterId : null)),
    many.slice(-WAITING_PER_KIND).reverse().map((letter) => letter.id)
  );
});

test('what arrived comes before what can be tidied', () => {
  const surface = whatIsWaiting({
    ...BASE,
    letters: [{ id: 'l1', unlockEpochDay: AWAY + 2 }],
    milestones: [{ id: 'm1', name: 'Voice therapy starts', epochDay: AWAY + 3 }],
    eras: [{ id: 'e', name: 'Second year', startEpochDay: AWAY - 90, endEpochDay: null }],
    runningWearSession: { id: 'w1', startTimestamp: startOfDayTimestamp(AWAY - 1) },
    doses: comparison()
  });

  assert.deepEqual(surface?.items.map((item) => item.kind), ['letter', 'milestone', 'era', 'wear-session', 'dose']);
});

test('every item names itself by its own row, so two of a kind are two rows', () => {
  const surface = whatIsWaiting({
    ...BASE,
    letters: [
      { id: 'l1', unlockEpochDay: AWAY + 2 },
      { id: 'l2', unlockEpochDay: AWAY + 3 }
    ],
    eras: [{ id: 'e', name: 'Second year', startEpochDay: AWAY - 90, endEpochDay: null }],
    runningWearSession: { id: 'w1', startTimestamp: startOfDayTimestamp(AWAY - 1) },
    doses: comparison()
  });
  const keys = surface!.items.map(waitingItemKey);

  assert.deepEqual(keys, ['letter:l2', 'letter:l1', 'era:e', 'wear-session:w1', `dose:${TODAY - 1}`]);
  assert.equal(new Set(keys).size, keys.length);
});
