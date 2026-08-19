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
  pauseCoversDay,
  siteRecency
} from './doseSchedule.ts';
import type { InjectionSiteKey } from './doseSchedule.ts';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, DosePause, DoseSchedule, DoseScheduleAmount } from './types.ts';

const schedule = (
  everyNDays: number,
  dosesPerDay: number,
  doseAmounts: DoseScheduleAmount[] | null = null
): DoseSchedule => ({
  id: 's1',
  episodeId: 'e1',
  recurrence: { kind: 'everyNDays', everyNDays },
  dosesPerDay,
  doseAmounts
});

const weekdaySchedule = (weekdays: number[], dosesPerDay = 1, doseAmounts: DoseScheduleAmount[] | null = null): DoseSchedule => ({
  id: 's1',
  episodeId: 'e1',
  recurrence: { kind: 'weekdays', weekdays },
  dosesPerDay,
  doseAmounts
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
    { epochDay: 100, indexInDay: 0, amount: null },
    { epochDay: 101, indexInDay: 0, amount: null },
    { epochDay: 102, indexInDay: 0, amount: null },
    { epochDay: 103, indexInDay: 0, amount: null }
  ]);
});

test('a twice-daily schedule puts two numbered slots on each day', () => {
  const slots = expectedSlots(schedule(1, 2), 100, 100, 101);
  assert.deepEqual(slots, [
    { epochDay: 100, indexInDay: 0, amount: null },
    { epochDay: 100, indexInDay: 1, amount: null },
    { epochDay: 101, indexInDay: 0, amount: null },
    { epochDay: 101, indexInDay: 1, amount: null }
  ]);
});

test('an every-N-days schedule steps from the anchor, not from the range start', () => {
  // Anchored on day 100, asked about 101-115: slots land on 114, not 101.
  const slots = expectedSlots(schedule(14, 1), 100, 101, 115);
  assert.deepEqual(slots, [{ epochDay: 114, indexInDay: 0, amount: null }]);
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
  assert.deepEqual(expectedSlots(weekdaySchedule([]), 100, 100, 110), []);
});

test('a weekday schedule puts slots on exactly those weekdays, with no drift over multiple weeks', () => {
  // Epoch day 100 is a Saturday; Monday/Thursday (0/3) inside 100-110 fall
  // on 102, 105 and 109 - each exactly a week after the same weekday before it.
  const slots = expectedSlots(weekdaySchedule([0, 3]), 100, 100, 110);
  assert.deepEqual(
    slots.map((s) => s.epochDay),
    [102, 105, 109]
  );
});

test('a weekday schedule generates nothing before the anchor day', () => {
  const slots = expectedSlots(weekdaySchedule([0, 3]), 100, 90, 101);
  assert.deepEqual(
    slots.map((s) => s.epochDay),
    []
  );
});

test('a weekday schedule needs no anchor to stay in phase: scrolling the window changes nothing about which days match', () => {
  const full = expectedSlots(weekdaySchedule([0, 3]), 100, 100, 120);
  const scrolled = expectedSlots(weekdaySchedule([0, 3]), 100, 110, 120);
  assert.deepEqual(
    scrolled.map((s) => s.epochDay),
    full.map((s) => s.epochDay).filter((d) => d >= 110)
  );
});

test('doseAmounts cycles across an every-N-days schedule\'s slots in order: 2mg one day, 1mg the next', () => {
  const amounts: DoseScheduleAmount[] = [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ];
  const slots = expectedSlots(schedule(1, 1, amounts), 100, 100, 103);
  assert.deepEqual(
    slots.map((s) => s.amount),
    [amounts[0], amounts[1], amounts[0], amounts[1]]
  );
});

test('doseAmounts cycles by slot, not by day: a twice-daily schedule can alternate within the day instead', () => {
  const amounts: DoseScheduleAmount[] = [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ];
  const slots = expectedSlots(schedule(1, 2, amounts), 100, 100, 101);
  assert.deepEqual(
    slots.map((s) => s.amount),
    [amounts[0], amounts[1], amounts[0], amounts[1]]
  );
});

test('doseAmounts on a weekday schedule cycles by occurrence, not by calendar day', () => {
  const amounts: DoseScheduleAmount[] = [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ];
  const slots = expectedSlots(weekdaySchedule([0, 3], 1, amounts), 100, 100, 110);
  assert.deepEqual(
    slots.map((s) => [s.epochDay, s.amount]),
    [
      [102, amounts[0]],
      [105, amounts[1]],
      [109, amounts[0]]
    ]
  );
});

test('the doseAmounts cycle is counted from the anchor, not from where the window starts', () => {
  const amounts: DoseScheduleAmount[] = [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ];
  // Anchored on 100 same as the full-window test above; asking only about
  // 102-103 must not restart the cycle at 102.
  const slots = expectedSlots(schedule(1, 1, amounts), 100, 102, 103);
  assert.deepEqual(
    slots.map((s) => s.amount),
    [amounts[0], amounts[1]]
  );
});

test('no doseAmounts means no amount on any slot, same as every schedule before this field existed', () => {
  const slots = expectedSlots(schedule(1, 1), 100, 100, 101);
  assert.deepEqual(
    slots.map((s) => s.amount),
    [null, null]
  );
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

/** An IM dose at `site` on `epochDay`. `site` is `null` to model a dose
    imported with a site this build cannot place - `injectionSite` reads
    back looser than it writes (doseSchedule.ts, doses.ts). */
const injectionDose = (epochDay: number, site: InjectionSiteKey | null): DoseEvent =>
  ({
    id: `i-${epochDay}-${site}`,
    timestamp: startOfDayTimestamp(epochDay) + 8 * 3600000,
    route: 'im',
    dose: 50,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    injectionSite: site,
    vehicle: null
  }) as DoseEvent;

test('siteRecency has an entry for every site the rotation map knows, even with no doses at all', () => {
  const recency = siteRecency([], 100);
  assert.deepEqual(
    Object.keys(recency).sort(),
    INJECTION_SITES.map((s) => s.key).sort()
  );
  assert.ok(Object.values(recency).every((days) => days === null));
});

test('siteRecency counts days back from the most recent dose at each site', () => {
  const doses = [injectionDose(90, 'thigh-right'), injectionDose(95, 'deltoid-left'), injectionDose(98, 'deltoid-left')];

  const recency = siteRecency(doses, 100);

  assert.equal(recency['deltoid-left'], 2); // the later of the two deltoid-left doses, 100 - 98
  assert.equal(recency['thigh-right'], 10);
  assert.equal(recency['abdomen-left'], null);
});

test('siteRecency does not care what order the doses arrive in', () => {
  const forward = siteRecency([injectionDose(95, 'thigh-left'), injectionDose(98, 'thigh-left')], 100);
  const backward = siteRecency([injectionDose(98, 'thigh-left'), injectionDose(95, 'thigh-left')], 100);

  assert.equal(forward['thigh-left'], 2);
  assert.equal(backward['thigh-left'], 2);
});

test('siteRecency counts a dose logged today as zero days since use', () => {
  const recency = siteRecency([injectionDose(100, 'abdomen-right')], 100);
  assert.equal(recency['abdomen-right'], 0);
});

test('siteRecency ignores oral doses and injection doses with no site on record', () => {
  const doses = [dose(99, 8), injectionDose(99, null)];

  const recency = siteRecency(doses, 100);

  assert.ok(Object.values(recency).every((days) => days === null));
});
