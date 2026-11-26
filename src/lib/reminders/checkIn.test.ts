/* The check-in rule. Every case lives in
   src/lib/android/fixtures/check-in-rule.json, which
   CheckInRuleFixtureTest.java runs against ReminderPlanner, the side that
   actually schedules the alarm. The cases carry their own zone, so this file
   drives Node's TZ the way reminderRule.test.ts does. */

import { afterAll, describe, expect, it } from 'vitest';
import { checkInAllowedOn, nextCheckIn, type CheckInRule } from './checkIn.ts';
import fixture from '../android/fixtures/check-in-rule.json';

interface NextCase {
  name: string;
  zone: string;
  nowIso: string;
  checkIn: CheckInRule;
  expectedIso: string | null;
}

interface AllowedCase {
  name: string;
  checkIn: Pick<CheckInRule, 'enabled' | 'pausedThroughEpochDay'>;
  day: number;
  allowed: boolean;
}

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('nextCheckIn against the shared fixture', () => {
  for (const testCase of fixture.next as NextCase[]) {
    it(testCase.name, () => {
      process.env.TZ = testCase.zone;
      const at = nextCheckIn(testCase.checkIn, new Date(testCase.nowIso));
      expect(at === null ? null : at.getTime()).toBe(
        testCase.expectedIso === null ? null : Date.parse(testCase.expectedIso)
      );
    });
  }
});

describe('checkInAllowedOn against the shared fixture', () => {
  for (const testCase of fixture.allowedOn as AllowedCase[]) {
    it(testCase.name, () => {
      expect(checkInAllowedOn(testCase.checkIn, testCase.day)).toBe(testCase.allowed);
    });
  }
});
