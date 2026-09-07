/* The calendar-file builder (phase 10 redesign ticket 03, ADR-0067): one
   `.ics` for one dated thing, asserted as text since the builder is pure. */
import { test, expect } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { buildCalendarEvent } from './calendarFile.ts';

const NOW = Date.UTC(2026, 8, 1, 10, 15, 30); // 2026-09-01T10:15:30Z
const DAY = epochDayFromLocalDate(new Date(2026, 8, 7)); // 2026-09-07

function lines(ics: string): string[] {
  expect(ics.endsWith('\r\n')).toBe(true);
  return ics.slice(0, -2).split('\r\n');
}

test('every kind wraps in one VCALENDAR/VEVENT pair', () => {
  for (const kind of ['appointment', 'surgery', 'letterUnlock'] as const) {
    const ls = lines(buildCalendarEvent({ kind, epochDay: DAY, title: 'A title', nowEpochMs: NOW }));
    expect(ls[0]).toBe('BEGIN:VCALENDAR');
    expect(ls[1]).toBe('VERSION:2.0');
    expect(ls.at(-1)).toBe('END:VCALENDAR');
    expect(ls).toContain('BEGIN:VEVENT');
    expect(ls).toContain('END:VEVENT');
    expect(ls).toContain('DTSTAMP:20260901T101530Z');
    expect(ls.some((l) => l.startsWith('UID:'))).toBe(true);
  }
});

test('a surgery date and a letter unlock are all-day, and no recurrence is ever written', () => {
  for (const kind of ['surgery', 'letterUnlock'] as const) {
    const ls = lines(buildCalendarEvent({ kind, epochDay: DAY, title: 'A title', nowEpochMs: NOW }));
    expect(ls).toContain('DTSTART;VALUE=DATE:20260907');
    expect(ls.some((l) => l.startsWith('DTEND'))).toBe(false);
    expect(ls.some((l) => l.startsWith('DURATION'))).toBe(false);
    expect(ls.some((l) => l.startsWith('RRULE'))).toBe(false);
  }
});

test('an appointment with no time is all-day the same as the other two kinds', () => {
  const ls = lines(buildCalendarEvent({ kind: 'appointment', epochDay: DAY, title: 'A title', nowEpochMs: NOW }));
  expect(ls).toContain('DTSTART;VALUE=DATE:20260907');
  expect(ls.some((l) => l.startsWith('DURATION'))).toBe(false);
  expect(ls.some((l) => l.startsWith('RRULE'))).toBe(false);
});

test('an appointment with a time comes out as a timed event, one hour long, and still no recurrence', () => {
  const ls = lines(
    buildCalendarEvent({ kind: 'appointment', epochDay: DAY, time: '14:30', title: 'A title', nowEpochMs: NOW })
  );
  expect(ls).toContain('DTSTART:20260907T143000');
  expect(ls).toContain('DURATION:PT1H');
  expect(ls.some((l) => l.startsWith('DTSTART;VALUE=DATE'))).toBe(false);
  expect(ls.some((l) => l.startsWith('RRULE'))).toBe(false);
});

test('a caller-supplied title replaces the default verbatim, escaped characters included', () => {
  const title = 'Dr A\\B; note, "quote"\nnext line';
  const ls = lines(buildCalendarEvent({ kind: 'appointment', epochDay: DAY, title, nowEpochMs: NOW }));
  expect(ls).toContain('SUMMARY:Dr A\\\\B\\; note\\, "quote"\\nnext line');
});

test('a plain title with nothing to escape comes out unchanged', () => {
  const ls = lines(buildCalendarEvent({ kind: 'surgery', epochDay: DAY, title: 'Procedure', nowEpochMs: NOW }));
  expect(ls).toContain('SUMMARY:Procedure');
});

test('two calls a millisecond apart never share a UID', () => {
  const a = buildCalendarEvent({ kind: 'appointment', epochDay: DAY, title: 'A', nowEpochMs: NOW });
  const b = buildCalendarEvent({ kind: 'appointment', epochDay: DAY, title: 'A', nowEpochMs: NOW + 1 });
  const uidOf = (ics: string) => lines(ics).find((l) => l.startsWith('UID:'));
  expect(uidOf(a)).not.toBe(uidOf(b));
});
