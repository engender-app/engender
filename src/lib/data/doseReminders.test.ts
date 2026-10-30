/* Which reminders a dose schedule stands for (functional audit ticket 21):
   the rules, the default times, and which hand-made reminders count as
   being about the same drug. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { weekdayOfEpochDay } from './epochDay.ts';
import {
  defaultReminderTimes,
  doseReminderRules,
  isHandMadeReminderFor,
  reminderTimesOf,
  resizeReminderTimes
} from './doseReminders.ts';
import type { Reminder } from './types.ts';

const reminder = (overrides: Partial<Reminder>): Reminder => ({
  id: 'r',
  title: 'Water the plants',
  time: '09:00',
  recurrence: 'DAILY',
  interval: null,
  anchorEpochDay: null,
  epochDay: null,
  enabled: true,
  autoSource: null,
  drug: null,
  ...overrides
});

test('every day is one daily reminder per dose time', () => {
  assert.deepEqual(doseReminderRules({ kind: 'everyNDays', everyNDays: 1 }, 100, ['08:00', '20:00']), [
    { time: '08:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null },
    { time: '20:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null }
  ]);
});

test('every N days counts from the episode start, as the slots do', () => {
  assert.deepEqual(doseReminderRules({ kind: 'everyNDays', everyNDays: 14 }, 100, ['19:00']), [
    { time: '19:00', recurrence: 'EVERY_N_DAYS', interval: 14, anchorEpochDay: 100 }
  ]);
});

test('weekdays become one weekly reminder per weekday, anchored on or after the start', () => {
  const rules = doseReminderRules({ kind: 'weekdays', weekdays: [0, 3] }, 100, ['09:00']);
  assert.equal(rules.length, 2);
  for (const [index, weekday] of [0, 3].entries()) {
    const rule = rules[index];
    assert.equal(rule.recurrence, 'EVERY_N_DAYS');
    assert.equal(rule.interval, 7);
    assert.equal(weekdayOfEpochDay(rule.anchorEpochDay!), weekday);
    assert.ok(rule.anchorEpochDay! >= 100 && rule.anchorEpochDay! < 107);
  }
});

test('all seven weekdays is a daily reminder, not seven weekly ones', () => {
  assert.deepEqual(doseReminderRules({ kind: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, 100, ['09:00']), [
    { time: '09:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null }
  ]);
});

test('no times, no reminders', () => {
  assert.deepEqual(doseReminderRules({ kind: 'everyNDays', everyNDays: 1 }, 100, []), []);
});

test('default times spread the day\'s doses between morning and evening', () => {
  assert.deepEqual(defaultReminderTimes(1), ['09:00']);
  assert.deepEqual(defaultReminderTimes(2), ['08:00', '20:00']);
  assert.deepEqual(defaultReminderTimes(3), ['08:00', '14:00', '20:00']);
  assert.deepEqual(defaultReminderTimes(0), []);
});

test('resizing keeps the times already chosen and fills the rest', () => {
  assert.deepEqual(resizeReminderTimes(['07:30'], 2), ['07:30', '20:00']);
  assert.deepEqual(resizeReminderTimes(['07:30', '12:00', '22:00'], 2), ['07:30', '12:00']);
  assert.deepEqual(resizeReminderTimes(['07:30'], Number.NaN), ['07:30']);
});

test('a schedule\'s times read back from its reminders once each, in order', () => {
  assert.deepEqual(
    reminderTimesOf([reminder({ time: '20:00' }), reminder({ time: '08:00' }), reminder({ time: '20:00' })]),
    ['08:00', '20:00']
  );
});

test('a hand-made reminder is about a drug when it names it, or is titled with it', () => {
  assert.ok(isHandMadeReminderFor(reminder({ drug: 'Estradiol valerate', title: 'Shot' }), 'estradiol valerate'));
  assert.ok(isHandMadeReminderFor(reminder({ title: ' Progesterone ' }), 'Progesterone'));
  assert.ok(!isHandMadeReminderFor(reminder({ title: 'Progesterone refill' }), 'Progesterone'));
  assert.ok(!isHandMadeReminderFor(reminder({ title: 'Progesterone', drug: 'Sertraline' }), 'Progesterone'));
  assert.ok(!isHandMadeReminderFor(reminder({ title: 'Progesterone', autoSource: 'stock:progesterone' }), 'Progesterone'));
});
