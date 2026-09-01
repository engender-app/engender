/* The one cross-class rule in the registry (phase 6 ticket 04). Two halves
   are tested here and both matter: the window arithmetic itself, and its
   agreement with the Java side, which schedules reminder and check-in alarms
   before any WebView exists and so cannot import this file (ADR-0028's
   shared-fixture pattern, the same one reminder-rule.json already holds for
   `nextOccurrence`). */

import { describe, expect, it } from 'vitest';
import fixture from '../android/fixtures/quiet-hours.json';
import { isQuiet, minuteOfDay, type QuietHours } from './quietHours.ts';

interface Case {
  name: string;
  zone: string;
  quietHours: QuietHours;
  nowIso: string;
  atLocal: string;
  inside: boolean;
  heldIso: string | null;
}

describe('the window arithmetic', () => {
  const window = (start: string, end: string): QuietHours => ({ enabled: true, start, end });

  it('holds a time inside a window that does not cross midnight', () => {
    expect(isQuiet(minuteOfDay('13:30'), window('13:00', '14:00'))).toBe(true);
    expect(isQuiet(minuteOfDay('12:59'), window('13:00', '14:00'))).toBe(false);
  });

  it('holds a time on either side of midnight for a window that wraps', () => {
    expect(isQuiet(minuteOfDay('23:30'), window('22:00', '07:00'))).toBe(true);
    expect(isQuiet(minuteOfDay('03:00'), window('22:00', '07:00'))).toBe(true);
    expect(isQuiet(minuteOfDay('12:00'), window('22:00', '07:00'))).toBe(false);
  });

  it('is half-open, so the minute the window ends is already out of it', () => {
    /* Otherwise a notification held until the end of quiet hours arrives at
       an instant that is itself quiet, and holding it again would be a loop
       rather than a delivery. */
    expect(isQuiet(minuteOfDay('22:00'), window('22:00', '07:00'))).toBe(true);
    expect(isQuiet(minuteOfDay('07:00'), window('22:00', '07:00'))).toBe(false);
  });

  it('reads a window whose ends are equal as empty rather than as a silent day', () => {
    /* Both readings are defensible and only one is safe: a whole silent day
       from two equal times somebody scrolled past would hold every
       notification the app has, permanently, with nothing on the screen
       saying so. */
    expect(isQuiet(minuteOfDay('09:00'), window('09:00', '09:00'))).toBe(false);
    expect(isQuiet(minuteOfDay('03:00'), window('09:00', '09:00'))).toBe(false);
  });

  it('holds nothing while quiet hours are off, whatever the window says', () => {
    expect(isQuiet(minuteOfDay('23:30'), { enabled: false, start: '22:00', end: '07:00' })).toBe(false);
  });

  it('falls back to midnight on a time it cannot read, rather than throwing at an alarm', () => {
    // Same call the Java planner's parseTime makes, and for the same reason:
    // a malformed preference must not take the scheduler down with it.
    expect(minuteOfDay('nonsense')).toBe(0);
    expect(minuteOfDay('99:99')).toBe(0);
  });
});

describe('against the shared fixture', () => {
  const cases = fixture as Case[];

  it('has cases at all, so a fixture that failed to load cannot pass silently', () => {
    expect(cases.length).toBeGreaterThan(6);
  });

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(isQuiet(minuteOfDay(testCase.atLocal), testCase.quietHours)).toBe(testCase.inside);
    });
  }
});
