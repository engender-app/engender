/* The reminder rule (ADR-0010). Every case lives in
   src/lib/android/fixtures/reminder-rule.json, which
   ReminderRuleFixtureTest.java iterates against the Java reimplementation;
   reminderRule.ts's header says why there are two of those.

   The cases carry their own zone, so this file drives Node's TZ rather than
   asserting in whatever zone the machine happens to sit in - a rule about
   local wall-clock time asserted only in one offset proves very little. */

import { afterAll, describe, expect, it } from 'vitest';
import {
  assertValidRule,
  choiceFromRule,
  nextOccurrence,
  ruleFromChoice,
  type ReminderRule
} from './reminderRule.ts';
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

/* The editor's two halves: the stored rule read back as one of the five
   options the segmented control offers, and an option written back out as
   a rule. They were a pair of functions inside the editor screen, where
   nothing could call them - the round trip below is the thing worth
   holding, and neither half proves it alone. */
describe('the editor choice a rule reads back as', () => {
  const rule = (over: Partial<ReminderRule>): ReminderRule => ({
    time: '20:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    ...over
  });

  it('reads a one-off as ONCE', () => {
    expect(choiceFromRule(rule({ recurrence: null, epochDay: 20000 }))).toBe('ONCE');
  });

  it('reads the two plain recurrences as themselves', () => {
    expect(choiceFromRule(rule({ recurrence: 'DAILY' }))).toBe('DAILY');
    expect(choiceFromRule(rule({ recurrence: 'WEEKLY' }))).toBe('WEEKLY');
  });

  it('splits EVERY_N_DAYS by its interval, which is the only pair offered', () => {
    /* The control offers every 3 days and every 7 days and nothing else,
       so an interval that is neither - only reachable from a stock
       reminder or an older journal - reads back as the 3-day option
       rather than as no option at all. */
    expect(choiceFromRule(rule({ recurrence: 'EVERY_N_DAYS', interval: 7, anchorEpochDay: 20000 }))).toBe(
      'EVERY_7_DAYS'
    );
    expect(choiceFromRule(rule({ recurrence: 'EVERY_N_DAYS', interval: 3, anchorEpochDay: 20000 }))).toBe(
      'EVERY_3_DAYS'
    );
    expect(choiceFromRule(rule({ recurrence: 'EVERY_N_DAYS', interval: 5, anchorEpochDay: 20000 }))).toBe(
      'EVERY_3_DAYS'
    );
  });
});

describe('the rule an editor choice writes back', () => {
  /* Set per test, the same way the fixture cases above do it: what day a
     moment falls on is a local-zone question, and the file leaves the
     zone wherever the last case put it. */
  const inWarsaw = <T,>(run: () => T): T => {
    process.env.TZ = 'Europe/Warsaw';
    return run();
  };

  const now = new Date('2026-08-27T09:00:00+02:00');
  const today = 20692;

  it('dates a one-off forward to the next time that clock reading comes round', () => {
    /* Which is why the preview never has to say a saved one-off has
       passed: every call re-dates it, so there is always a moment left. */
    expect(inWarsaw(() => ruleFromChoice('ONCE', '20:00', null, now))).toEqual({
      time: '20:00',
      recurrence: null,
      interval: null,
      anchorEpochDay: null,
      epochDay: today
    });
    /* A time already gone today lands tomorrow, from the same rule the
       preview and the Android scheduler both answer to. */
    expect(inWarsaw(() => ruleFromChoice('ONCE', '07:00', null, now)).epochDay).toBe(today + 1);
  });

  it('writes the plain recurrences with nothing else on them', () => {
    expect(inWarsaw(() => ruleFromChoice('DAILY', '20:00', null, now))).toEqual({
      time: '20:00',
      recurrence: 'DAILY',
      interval: null,
      anchorEpochDay: null,
      epochDay: null
    });
    expect(inWarsaw(() => ruleFromChoice('WEEKLY', '20:00', null, now)).recurrence).toBe('WEEKLY');
  });

  it('starts a new progression today', () => {
    expect(inWarsaw(() => ruleFromChoice('EVERY_3_DAYS', '20:00', null, now))).toEqual({
      time: '20:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 3,
      anchorEpochDay: today,
      epochDay: null
    });
  });

  it('keeps an existing progression on its own anchor', () => {
    /* Editing the title of a reminder that fires every third day must not
       silently move which third day that is. */
    const existing: ReminderRule = {
      time: '20:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 3,
      anchorEpochDay: today - 40,
      epochDay: null
    };
    expect(inWarsaw(() => ruleFromChoice('EVERY_3_DAYS', '21:00', existing, now)).anchorEpochDay).toBe(today - 40);
  });

  it('starts a fresh progression when the interval itself changes', () => {
    /* An anchor fixes a 3-day progression; carried onto a 7-day one it
       would mean a different set of days than the person just asked for. */
    const existing: ReminderRule = {
      time: '20:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 3,
      anchorEpochDay: today - 40,
      epochDay: null
    };
    expect(inWarsaw(() => ruleFromChoice('EVERY_7_DAYS', '20:00', existing, now)).anchorEpochDay).toBe(today);
  });

  it('makes a rule the schema accepts whatever the choice was', () => {
    for (const choice of ['ONCE', 'DAILY', 'EVERY_3_DAYS', 'EVERY_7_DAYS', 'WEEKLY'] as const) {
      expect(() => assertValidRule(inWarsaw(() => ruleFromChoice(choice, '20:00', null, now)))).not.toThrow();
    }
  });
});
