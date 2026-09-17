/* The reminder row's own schedule wording (audit item 2). The bug it is
   written against: a one-off reminder printed "in 0 days" for today and
   "in 1 days" for tomorrow, because the day count was clamped at zero and
   the string carried no plural.

   `relativeDayFromToday` has its own test in epochDay.test.ts - this is the
   layer above it, where a classification becomes a sentence, and it is the
   one the ticket names. The assertions are about the shape of the sentence
   rather than its exact words, except where the words are the defect: a
   label that ever contains "0 days" or "1 days" is the thing that shipped. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { Reminder } from '../types';

// vitest.config.ts (node tier) has no `$lib` alias, so the module under
// test's own `$lib/paraglide/messages` import is pointed at the real
// compiled catalogue instead of failing to resolve (the pattern
// dayAheadRows.test.ts uses for the same reason).
vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));
const { reminderScheduleLabel, reminderTypeLabel } = await import('./reminderLabel.ts');
const { todayEpochDay } = await import('../epochDay.ts');

const oneOff = (epochDay: number): Reminder => ({
  id: `r-${epochDay}`,
  title: 'take the evening dose',
  type: 'med',
  time: '20:00',
  recurrence: null,
  interval: null,
  anchorEpochDay: null,
  epochDay,
  enabled: true,
  autoSource: null
});

test('a one-off today says today, and never "in 0 days"', () => {
  const label = reminderScheduleLabel(oneOff(todayEpochDay()));
  assert.match(label, /20:00$/);
  assert.doesNotMatch(label, /0 days/);
});

test('a one-off tomorrow says tomorrow, and never "in 1 days"', () => {
  const label = reminderScheduleLabel(oneOff(todayEpochDay() + 1));
  assert.doesNotMatch(label, /1 days/);
  assert.notEqual(label, reminderScheduleLabel(oneOff(todayEpochDay())));
});

test('a one-off further out counts the days, plural', () => {
  assert.match(reminderScheduleLabel(oneOff(todayEpochDay() + 12)), /12 days/);
});

test('a one-off that has passed says so rather than counting to zero', () => {
  /* The other half of the clamp: three days ago used to read "in 0 days",
     which is a reminder claiming to be about today. */
  const label = reminderScheduleLabel(oneOff(todayEpochDay() - 3));
  assert.match(label, /3 days/);
  assert.notEqual(label, reminderScheduleLabel(oneOff(todayEpochDay() + 3)));
});

test('a recurring reminder states its recurrence and its time, never a day count', () => {
  const daily: Reminder = { ...oneOff(todayEpochDay()), recurrence: 'DAILY', epochDay: null };
  const label = reminderScheduleLabel(daily);
  assert.match(label, /20:00$/);
  assert.doesNotMatch(label, /days/);
});

test('every type has a word of its own', () => {
  const words = (['med', 'injection', 'appointment', 'other'] as const).map(reminderTypeLabel);
  assert.equal(new Set(words).size, words.length);
  for (const word of words) assert.ok(word.length > 0);
});
