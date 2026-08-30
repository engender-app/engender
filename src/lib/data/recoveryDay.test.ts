/* The day-since-surgery counter (phase 5 ticket 07). Pure: no clock, no
   database, so every case here is a surgery date and a day. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { activeSurgeryProcedure, recoveryDay, SURGERY_RECOVERY_CUTOFF_DAYS } from './recoveryDay.ts';

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

test('activeSurgeryProcedure returns null when there are no procedures or no dated procedures', () => {
  assert.equal(activeSurgeryProcedure([], 20000), null);
  assert.equal(activeSurgeryProcedure([{ id: '1', name: 'Consult only', surgeryEpochDay: null }], 20000), null);
});

test('activeSurgeryProcedure selects an upcoming scheduled procedure', () => {
  const p = { id: 'top', name: 'Top Surgery', surgeryEpochDay: 20010 };
  assert.deepEqual(activeSurgeryProcedure([p], 20000), p);
});

test('activeSurgeryProcedure selects a procedure on the day of surgery and during active recovery', () => {
  const p = { id: 'top', name: 'Top Surgery', surgeryEpochDay: 20000 };
  assert.deepEqual(activeSurgeryProcedure([p], 20000), p);
  assert.deepEqual(activeSurgeryProcedure([p], 20000 + SURGERY_RECOVERY_CUTOFF_DAYS), p);
});

test('activeSurgeryProcedure ignores a procedure whose recovery is past the cutoff', () => {
  const p = { id: 'top', name: 'Top Surgery', surgeryEpochDay: 20000 };
  assert.equal(activeSurgeryProcedure([p], 20000 + SURGERY_RECOVERY_CUTOFF_DAYS + 1), null);
});

test('activeSurgeryProcedure picks the nearest procedure when multiple exist', () => {
  const futureFar = { id: 'ffs', name: 'FFS', surgeryEpochDay: 20060 };
  const futureNear = { id: 'top', name: 'Top Surgery', surgeryEpochDay: 20010 };
  const pastRecent = { id: 'vaginoplasty', name: 'Vaginoplasty', surgeryEpochDay: 19995 }; // 5 days ago
  const pastExpired = { id: 'orchie', name: 'Orchiectomy', surgeryEpochDay: 19800 }; // 200 days ago

  // Between 10 days ahead (top) and 5 days ago (vaginoplasty), vaginoplasty is nearest (dist 5 < 10)
  assert.deepEqual(activeSurgeryProcedure([futureFar, futureNear, pastRecent, pastExpired], 20000), pastRecent);

  // If pastRecent is removed, futureNear (dist 10) is chosen ahead of futureFar (dist 60)
  assert.deepEqual(activeSurgeryProcedure([futureFar, futureNear, pastExpired], 20000), futureNear);

  // If only pastExpired exists, null is returned
  assert.equal(activeSurgeryProcedure([pastExpired], 20000), null);
});
