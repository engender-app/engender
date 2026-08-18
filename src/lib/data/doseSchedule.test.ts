/* Expected dose slots and the actual-vs-scheduled pairing (phase 4 ticket
   02). Pure: no clock, no database, so every case here is a table of days
   and timestamps. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  APPLICATION_SITES,
  INJECTION_SITES,
  adherence,
  expectedSlots,
  pauseCoversDay
} from './doseSchedule.ts';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, DosePause, DoseSchedule } from './types.ts';

const schedule = (everyNDays: number, dosesPerDay: number): DoseSchedule => ({
  id: 's1',
  episodeId: 'e1',
  everyNDays,
  dosesPerDay
});

const pause = (startEpochDay: number, endEpochDay: number | null): DosePause => ({
  id: 'p1',
  episodeId: 'e1',
  startEpochDay,
  endEpochDay,
  reason: 'planned'
});

/** A dose at `hour` on `epochDay`, oral so it carries no site. */
const dose = (epochDay: number, hour: number, over: Partial<DoseEvent> = {}): DoseEvent =>
  ({
    id: `d-${epochDay}-${hour}`,
    timestamp: startOfDayTimestamp(epochDay) + hour * 3600000,
    route: 'oral',
    dose: 2,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    ...over
  }) as DoseEvent;

test('a once-daily schedule puts one slot on every day of the range', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 103);
  assert.deepEqual(slots, [
    { epochDay: 100, indexInDay: 0 },
    { epochDay: 101, indexInDay: 0 },
    { epochDay: 102, indexInDay: 0 },
    { epochDay: 103, indexInDay: 0 }
  ]);
});

test('a twice-daily schedule puts two numbered slots on each day', () => {
  const slots = expectedSlots(schedule(1, 2), 100, 100, 101);
  assert.deepEqual(slots, [
    { epochDay: 100, indexInDay: 0 },
    { epochDay: 100, indexInDay: 1 },
    { epochDay: 101, indexInDay: 0 },
    { epochDay: 101, indexInDay: 1 }
  ]);
});

test('an every-N-days schedule steps from the anchor, not from the range start', () => {
  // Anchored on day 100, asked about 101-115: slots land on 114, not 101.
  const slots = expectedSlots(schedule(14, 1), 100, 101, 115);
  assert.deepEqual(slots, [{ epochDay: 114, indexInDay: 0 }]);
});

test('no slot falls before the anchor day', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 98, 101);
  assert.deepEqual(
    slots.map((s) => s.epochDay),
    [100, 101]
  );
});

test('a nonsense schedule generates nothing rather than looping forever', () => {
  assert.deepEqual(expectedSlots(schedule(0, 1), 100, 100, 110), []);
  assert.deepEqual(expectedSlots(schedule(1, 0), 100, 100, 110), []);
});

test('a pause covers its endpoints, and an open pause covers everything after its start', () => {
  assert.equal(pauseCoversDay(pause(100, 102), 99), false);
  assert.equal(pauseCoversDay(pause(100, 102), 100), true);
  assert.equal(pauseCoversDay(pause(100, 102), 102), true);
  assert.equal(pauseCoversDay(pause(100, 102), 103), false);

  assert.equal(pauseCoversDay(pause(100, null), 99), false);
  assert.equal(pauseCoversDay(pause(100, null), 5000), true);
});

test('adherence pairs each slot with the dose logged in that position of the day', () => {
  const slots = expectedSlots(schedule(1, 2), 100, 100, 100);
  const morning = dose(100, 8);
  const evening = dose(100, 20);

  const { rows, unmatched } = adherence(slots, [evening, morning], []);

  assert.deepEqual(
    rows.map((row) => [row.slot.indexInDay, row.dose?.id ?? null]),
    [
      [0, morning.id],
      [1, evening.id]
    ]
  );
  assert.deepEqual(unmatched, []);
});

test('a slot with nothing logged against it pairs with null', () => {
  const slots = expectedSlots(schedule(1, 2), 100, 100, 100);
  const { rows } = adherence(slots, [dose(100, 8)], []);

  assert.deepEqual(
    rows.map((row) => row.dose?.id ?? null),
    [dose(100, 8).id, null]
  );
});

test('a skipped dose fills its slot: the gap is recorded, not inferred from an absence', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 100);
  const skipped = dose(100, 8, { status: 'skipped' });

  const { rows } = adherence(slots, [skipped], []);

  assert.equal(rows[0].dose?.id, skipped.id);
  assert.equal(rows[0].dose?.status, 'skipped');
});

test('slots inside a pause are dropped, and the doses either side still pair up', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 104);
  const doses = [dose(100, 8), dose(104, 8)];

  const { rows } = adherence(slots, doses, [pause(101, 103)]);

  assert.deepEqual(
    rows.map((row) => [row.slot.epochDay, row.dose?.id ?? null]),
    [
      [100, doses[0].id],
      [104, doses[1].id]
    ]
  );
});

test('a dose logged during a pause is not lost: it comes back unmatched', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 104);
  const duringPause = dose(102, 8);

  const { rows, unmatched } = adherence(slots, [duringPause], [pause(101, 103)]);

  assert.deepEqual(
    rows.map((row) => row.dose?.id ?? null),
    [null, null]
  );
  assert.deepEqual(
    unmatched.map((d) => d.id),
    [duringPause.id]
  );
});

test('a dose beyond the day’s slot count is unmatched rather than overwriting one', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 100);
  const first = dose(100, 8);
  const extra = dose(100, 21);

  const { rows, unmatched } = adherence(slots, [first, extra], []);

  assert.deepEqual(
    rows.map((row) => row.dose?.id ?? null),
    [first.id]
  );
  assert.deepEqual(
    unmatched.map((d) => d.id),
    [extra.id]
  );
});

test('adherence reports counts only, with no target, streak or pass/fail verdict', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 101);
  const result = adherence(slots, [dose(100, 8)], []);

  assert.deepEqual(Object.keys(result).sort(), ['rows', 'unmatched']);
});

test('the injection rotation map and the application-site list are different vocabularies', () => {
  assert.ok(INJECTION_SITES.length > 0);
  assert.ok(APPLICATION_SITES.length > 0);
  assert.notDeepEqual(INJECTION_SITES, APPLICATION_SITES);

  // The rotation map is what makes alternating sides possible, so its
  // regions come in left/right pairs; an application site does not.
  assert.ok(INJECTION_SITES.some((site) => site.side === 'left'));
  assert.ok(INJECTION_SITES.some((site) => site.side === 'right'));
});
