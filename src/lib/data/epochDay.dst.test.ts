// Keep the Warsaw clock-change controls independent of the host zone.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { epochDayFromCalendarDate, startOfDayTimestamp, timestampAtLocalTime, msUntilNextLocalMidnight, epochDayFromTimestamp } from './epochDay';
import { nextOccurrence } from './reminderRule';

const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Europe/Warsaw'; });
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const H = 3600000;
const daily = (time: string) => ({ time, recurrence: 'DAILY' as const, interval: null, anchorEpochDay: null, epochDay: null });
const d = (y: number, m: number, day: number) => epochDayFromCalendarDate(y, m, day)!;
const iso = (ms: number) => new Date(ms).toISOString();

test('local day lengths on the two clock-change days', () => {
  expect(startOfDayTimestamp(d(2026, 10, 26)) - startOfDayTimestamp(d(2026, 10, 25))).toBe(25 * H);
  expect(startOfDayTimestamp(d(2027, 3, 29)) - startOfDayTimestamp(d(2027, 3, 28))).toBe(23 * H);
});

test('09:00 is 09:00 local on both sides of each change', () => {
  for (const [y, m, day] of [[2026, 10, 24], [2026, 10, 25], [2026, 10, 26], [2027, 3, 27], [2027, 3, 28], [2027, 3, 29]]) {
    const t = new Date(timestampAtLocalTime(d(y, m, day), '09:00'));
    expect([t.getHours(), t.getMinutes()], `${y}-${m}-${day}`).toEqual([9, 0]);
  }
});

test('02:30 on fall-back night is the first (summer-time) 02:30; spring-forward 02:30 lands at 03:30', () => {
  expect(iso(timestampAtLocalTime(d(2026, 10, 25), '02:30'))).toBe('2026-10-25T00:30:00.000Z');
  expect(iso(timestampAtLocalTime(d(2027, 3, 28), '02:30'))).toBe('2027-03-28T01:30:00.000Z');
});

test('daily 02:30 and 09:00 reminders step across the clock changes', () => {
  const at = (rule: ReturnType<typeof daily>, nowIso: string) => iso(nextOccurrence(rule, new Date(nowIso))!.getTime());
  // After the 00:30Z occurrence, the next 02:30 is 25 hours later.
  expect(at(daily('02:30'), '2026-10-25T00:30:01Z')).toBe('2026-10-26T01:30:00.000Z');
  expect(at(daily('09:00'), '2026-10-25T00:30:01Z')).toBe('2026-10-25T08:00:00.000Z');
  // the repeated 02:30 (01:30Z) must not fire a second time
  expect(at(daily('02:30'), '2026-10-25T01:00:00Z')).toBe('2026-10-26T01:30:00.000Z');
  // spring: after the 2027-03-27 fire, the gap day fires at 03:30 local = 01:30Z (24 h later)
  expect(at(daily('02:30'), '2027-03-27T01:30:01Z')).toBe('2027-03-28T01:30:00.000Z');
  expect(at(daily('02:30'), '2027-03-28T01:30:01Z')).toBe('2027-03-29T00:30:00.000Z');
  expect(at(daily('09:00'), '2027-03-28T01:30:01Z')).toBe('2027-03-28T07:00:00.000Z');
});

test('time until next local midnight is not DAY minus elapsed on a 25 h day', () => {
  const noon = new Date(2026, 9, 25, 12, 0, 0); // local noon on the 25 h day
  expect(msUntilNextLocalMidnight(noon)).toBe(12 * H); // 12:00 CET -> 24:00 CET = 12 h
  const early = new Date(2026, 9, 25, 0, 30, 0); // 00:30 CEST -> 25 h day, 24.5 h to go
  expect(msUntilNextLocalMidnight(early)).toBe(24.5 * H);
});

test('epoch day of the instants either side of the fall-back repeat hour', () => {
  expect(epochDayFromTimestamp(Date.parse('2026-10-25T00:59:59Z'))).toBe(d(2026, 10, 25));
  expect(epochDayFromTimestamp(Date.parse('2026-10-25T01:00:00Z'))).toBe(d(2026, 10, 25));
  expect(epochDayFromTimestamp(Date.parse('2026-10-25T22:59:59Z'))).toBe(d(2026, 10, 25));
  expect(epochDayFromTimestamp(Date.parse('2026-10-25T23:00:00Z'))).toBe(d(2026, 10, 26));
});
