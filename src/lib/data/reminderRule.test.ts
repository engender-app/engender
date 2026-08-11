/* The reminder rule (ADR-0010): a wall-clock time plus a recurrence, never
   a stored next-fire instant. nextOccurrence() is the one function the
   editor's "Next: ..." preview and the Android scheduler share - these
   tests pin the rule arithmetic in local wall-clock terms. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { epochDayFromLocalDate } from './epochDay.ts';
import { nextOccurrence } from './reminderRule.ts';

/* A fixed local moment: 19:00 on an arbitrary day. */
const now = new Date(2026, 7, 11, 19, 0);
const today = epochDayFromLocalDate(now);

function local(epochDayOffset: number, time: string): Date {
  const [h, mi] = time.split(':').map(Number);
  return new Date(2026, 7, 11 + epochDayOffset, h, mi);
}

test('DAILY fires later today while the time has not passed', () => {
  assert.deepEqual(
    nextOccurrence({ time: '20:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null }, now),
    local(0, '20:00')
  );
});

test('DAILY rolls to tomorrow once the time has passed', () => {
  assert.deepEqual(
    nextOccurrence({ time: '18:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null }, now),
    local(1, '18:00')
  );
});

test('WEEKLY rolls a full week once the time has passed', () => {
  assert.deepEqual(
    nextOccurrence({ time: '09:30', recurrence: 'WEEKLY', interval: null, anchorEpochDay: null, epochDay: null }, now),
    local(7, '09:30')
  );
});

test('EVERY_N_DAYS lands on the anchored progression, not just "today plus N"', () => {
  // Anchored yesterday, every 3 days: the progression hits today+2 next.
  assert.deepEqual(
    nextOccurrence(
      { time: '20:00', recurrence: 'EVERY_N_DAYS', interval: 3, anchorEpochDay: today - 1, epochDay: null },
      now
    ),
    local(2, '20:00')
  );
});

test('EVERY_N_DAYS anchored today fires today until the time passes, then skips a whole interval', () => {
  const rule = { recurrence: 'EVERY_N_DAYS' as const, interval: 3, anchorEpochDay: today, epochDay: null };
  assert.deepEqual(nextOccurrence({ ...rule, time: '20:00' }, now), local(0, '20:00'));
  assert.deepEqual(nextOccurrence({ ...rule, time: '18:00' }, now), local(3, '18:00'));
});

test('EVERY_N_DAYS with a future anchor waits for the anchor day itself', () => {
  assert.deepEqual(
    nextOccurrence(
      { time: '08:00', recurrence: 'EVERY_N_DAYS', interval: 3, anchorEpochDay: today + 5, epochDay: null },
      now
    ),
    local(5, '08:00')
  );
});

test('a one-off is its own concrete day, even in the past', () => {
  assert.deepEqual(
    nextOccurrence({ time: '09:30', recurrence: null, interval: null, anchorEpochDay: null, epochDay: today + 12 }, now),
    local(12, '09:30')
  );
  // Past one-offs come back as the moment they fired; the caller decides
  // what "already happened" means (the scheduler skips, the editor shows).
  assert.deepEqual(
    nextOccurrence({ time: '09:30', recurrence: null, interval: null, anchorEpochDay: null, epochDay: today - 1 }, now),
    local(-1, '09:30')
  );
});
