/* The reminder rule (ADR-0010): a wall-clock time plus a recurrence, never
   a stored next-fire instant.

   Every case lives in src/lib/android/fixtures/reminder-rule.json, which
   ReminderRuleFixtureTest.java iterates against ReminderPlanner - the Java
   reimplementation that decides when a notification actually fires. The two
   are separate implementations in two languages by necessity, so the fixture
   is the only thing that stops them answering the same question differently,
   the shape ADR-0028 established for launch routes. Before it, the two
   suites shared no case at all and already disagreed about an elapsed
   one-off.

   The cases carry their own zone, so this file drives Node's TZ rather than
   asserting in whatever zone the machine happens to sit in - a rule about
   local wall-clock time asserted only in one offset proves very little. */

import { afterAll, describe, expect, it } from 'vitest';
import { nextOccurrence, type ReminderRule } from './reminderRule.ts';
import fixture from '../android/fixtures/reminder-rule.json';

interface Case {
  name: string;
  why?: string;
  zone: string;
  nowIso: string;
  rule: ReminderRule;
  expectedIso: string | null;
}

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('nextOccurrence against the shared fixture', () => {
  for (const testCase of fixture as Case[]) {
    it(testCase.name, () => {
      process.env.TZ = testCase.zone;
      const at = nextOccurrence(testCase.rule, new Date(testCase.nowIso));
      /* Compared as instants: the expected ISO carries its own offset, so
         this asserts the moment rather than the spelling of it. */
      expect(at === null ? null : at.getTime()).toBe(
        testCase.expectedIso === null ? null : Date.parse(testCase.expectedIso)
      );
    });
  }
});
