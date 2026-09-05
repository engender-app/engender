import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  PLANNED_AREAS,
  RETURN_GAP_DAYS,
  WAITING_PER_KIND,
  lastWriteDay,
  medianWriteGap,
  returnGap,
  waitingItemKey,
  whatIsWaiting
} from './comingBack.ts';
import { adherence, expectedSlots } from './doseSchedule.ts';
import { startOfDayTimestamp } from './epochDay.ts';
import { persona } from './demo/persona.ts';
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
  endEpochDay: null,
  endReason: null
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
  sinceEpochDay: AWAY,
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

test('a gap inside the threshold is not a return', () => {
  const nearly = TODAY - (RETURN_GAP_DAYS - 1);

  assert.equal(returnGap({ entries: nearly }, TODAY), null);
});

test('the threshold itself is a return, not the day after it', () => {
  const exactly = TODAY - RETURN_GAP_DAYS;

  assert.equal(returnGap({ entries: exactly }, TODAY), exactly);
});

test('a journal nobody has ever written to has nothing to come back to', () => {
  assert.equal(returnGap({ entries: null, doseEvents: null }, TODAY), null);
  assert.equal(returnGap({}, TODAY), null);
});

test('a date somebody put on the calendar does not close the gap it sits in', () => {
  /* The failure this exists for: a milestone written months ago for a day
     inside the gap answers the last-write registry with that day, and the
     surface it would have been reported on never opened. A procedure consult
     is the same shape - an appointment booked ahead. */
  for (const planned of PLANNED_AREAS) {
    assert.equal(returnGap({ entries: AWAY, [planned]: TODAY - 4 }, TODAY), AWAY);
  }
  // And an ordinary area, which is a record of something that happened, does.
  assert.equal(returnGap({ entries: AWAY, measurements: TODAY - 4 }, TODAY), null);
});

test('a journal with too little history has no median, so the floor governs alone', () => {
  assert.equal(medianWriteGap({ entries: TODAY - 5, doseEvents: TODAY - 40 }, TODAY), null);
  assert.equal(medianWriteGap({}, TODAY), null);
  // Same floor a brand-new journal gets today: no median moves the threshold.
  assert.equal(returnGap({ entries: TODAY - 5, doseEvents: TODAY - 40 }, TODAY), null);
});

test("a planned day doesn't count as a write for the median, the same reason it doesn't close a gap", () => {
  const written = {
    entries: TODAY - 10,
    doseEvents: TODAY - 45,
    measurements: TODAY - 90,
    sideEffects: TODAY - 135,
    labResults: TODAY - 180
  };
  const withPlanned = { ...written, milestones: TODAY - 2, procedures: TODAY - 1 };

  assert.equal(medianWriteGap(withPlanned, TODAY), medianWriteGap(written, TODAY));
});

/** A journal's whole history, shaped around whichever day its newest write
    falls on - so testing a few different gaps means sliding one fixture
    rather than rebuilding it, and the newest write stays `since` no matter
    which day it lands on. */
function journalEndingOn(since: number, gaps: readonly number[]) {
  const areas = ['entries', 'doseEvents', 'measurements', 'sideEffects', 'labResults'] as const;
  let day = since;
  const lastWrites: Record<string, number> = {};
  areas.forEach((area, index) => {
    lastWrites[area] = day;
    day -= gaps[index] ?? gaps[gaps.length - 1];
  });
  return lastWrites;
}

test('a daily-ish journal has a small median gap, and its return threshold stays the unchanged floor', () => {
  const daily = journalEndingOn(TODAY - 1, [2, 2, 2, 3]);

  const median = medianWriteGap(daily, TODAY);
  assert.ok(median !== null && median < 7, `expected a sub-week median, got ${median}`);

  const stillAway = TODAY - (RETURN_GAP_DAYS - 1);
  assert.equal(returnGap(journalEndingOn(stillAway, [2, 2, 2, 3]), TODAY), null);
  const exactly = TODAY - RETURN_GAP_DAYS;
  assert.equal(returnGap(journalEndingOn(exactly, [2, 2, 2, 3]), TODAY), exactly);
});

test('a sparse, event-shaped journal has a wide median gap, and its threshold scales past three weeks', () => {
  const sparse = journalEndingOn(TODAY - 10, [35, 35, 35, 35]);

  const median = medianWriteGap(sparse, TODAY);
  assert.equal(median, 35);

  // A gap that would trip the plain three-week floor does not, for this journal.
  const stillAway = TODAY - RETURN_GAP_DAYS;
  assert.equal(returnGap(journalEndingOn(stillAway, [35, 35, 35, 35]), TODAY), null);
  // But a gap that clears the scaled threshold (1.5 * 35 = 52.5) still does.
  const gone = TODAY - 53;
  assert.equal(returnGap(journalEndingOn(gone, [35, 35, 35, 35]), TODAY), gone);
});

test('the median only looks back roughly a year, so an old write from a dormant area does not widen it', () => {
  const recent = {
    entries: TODAY - 5,
    doseEvents: TODAY - 12,
    measurements: TODAY - 19,
    sideEffects: TODAY - 26,
    labResults: TODAY - 33
  };
  assert.equal(medianWriteGap(recent, TODAY), 7);

  const withAncientOutlier = { ...recent, personalEffects: TODAY - 400 };
  assert.equal(medianWriteGap(withAncientOutlier, TODAY), 7);
});

test("the demo persona's own journal is fitted against it too: near-daily entries, but few enough distinct areas that the median stays null and the floor governs, unchanged", () => {
  /* Alice (demo/persona.ts) writes an entry almost every day, but the
     last-write registry only ever sees three of her areas touched at all:
     milestones is excluded as planned, and the persona has no dose log, no
     measurements, no wear sessions - "the demo seeds tags, entries,
     milestones, reminders and labs, and nothing else" (persona.ts). Three
     distinct areas is short of a median's five, so this real journal's own
     rhythm is unknowable from the registry alone, and RETURN_GAP_DAYS keeps
     governing by itself - the "unchanged from today" acceptance criterion,
     reached through the "not enough history" path rather than a small
     median, which is worth fitting against and stating rather than
     assuming. */
  const alice = persona(TODAY);
  const aliceLastWrites = {
    entries: Math.max(...alice.entries.map((entry) => entry.epochDay)),
    labResults: Math.max(...alice.labResults.map((lab) => lab.epochDay)),
    tallyEvents: Math.max(...alice.tallyEvents.map((tally) => tally.epochDay))
  };

  assert.equal(medianWriteGap(aliceLastWrites, TODAY), null);
  assert.equal(returnGap(aliceLastWrites, TODAY), null);
});

test('a gap with nothing waiting in it draws nothing', () => {
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
