/* The day-since-surgery counter (phase 5 ticket 07). Pure: no clock, no
   database, so every case here is a surgery date and a day. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { recoveryDay } from './recoveryDay.ts';

test('recoveryDay says nothing at all until a surgery date is set', () => {
  assert.deepEqual(recoveryDay(null, 20000), { type: 'unscheduled' });
});

test('recoveryDay counts up from the surgery day, which is day zero', () => {
  assert.deepEqual(recoveryDay(20000, 20000), { type: 'surgeryDay' });
  assert.deepEqual(recoveryDay(20000, 20001), { type: 'since', days: 1 });
  assert.deepEqual(recoveryDay(20000, 20014), { type: 'since', days: 14 });
});

test('recoveryDay counts down to a surgery date still ahead, rather than reporting negative days since', () => {
  assert.deepEqual(recoveryDay(20000, 19999), { type: 'upcoming', days: 1 });
  assert.deepEqual(recoveryDay(20000, 19910), { type: 'upcoming', days: 90 });
});

test('recoveryDay crosses year boundaries by day arithmetic alone, with no calendar reasoning', () => {
  // Two epoch days 400 apart, whatever months they land in: the counter is
  // days since, never "a year and a bit".
  assert.deepEqual(recoveryDay(19000, 19400), { type: 'since', days: 400 });
});
