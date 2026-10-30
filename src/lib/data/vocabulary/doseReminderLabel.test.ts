/* What a dose reminder says it is reminding about (functional audit ticket
   21, Alicja's sign-off note of 2026-10-30: "make the reminders say what they
   are reminding about"). One wording for the reminders list and the
   notification. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));
vi.mock('$lib/paraglide/runtime', async () => await import('../../paraglide/runtime.js'));
vi.mock('$lib/data/dates', async () => await import('../dates.ts'));

import type { DoseSchedule, RegimenEpisode, Reminder } from '../types.ts';

const { describeReminder, reminderNotification } = await import('./doseReminderLabel.ts');
const { overwriteGetLocale, baseLocale } = await import('../../paraglide/runtime.js');

function inLocale(locale: 'en' | 'pl', body: () => void) {
  overwriteGetLocale(() => locale);
  try {
    body();
  } finally {
    overwriteGetLocale(() => baseLocale);
  }
}

const TODAY = 20_000;

const episode = (over: Partial<RegimenEpisode> & Pick<RegimenEpisode, 'id' | 'drug'>): RegimenEpisode => ({
  drugClass: 'hrt',
  ester: null,
  dose: 4,
  doseUnit: 'mg',
  route: 'im',
  interval: 'weekly',
  startEpochDay: TODAY - 30,
  endEpochDay: null,
  endReason: null,
  ...over
});

const schedule = (over: Partial<DoseSchedule> & Pick<DoseSchedule, 'episodeId'>): DoseSchedule => ({
  id: `s-${over.episodeId}`,
  recurrence: { kind: 'everyNDays', everyNDays: 1 },
  dosesPerDay: 1,
  doseAmounts: null,
  autoLogFromEpochDay: null,
  ...over
});

let next = 0;
const reminder = (over: Partial<Reminder> & Pick<Reminder, 'title'>): Reminder => ({
  id: `r-${++next}`,
  time: '09:00',
  recurrence: 'DAILY',
  interval: null,
  anchorEpochDay: null,
  epochDay: null,
  enabled: true,
  autoSource: null,
  drug: null,
  ...over
});

const ev = episode({ id: 'ep-ev', drug: 'Estradiol valerate' });
const sertraline = episode({ id: 'ep-se', drug: 'Sertraline', drugClass: 'other', dose: 50, route: 'oral' });

test('a schedule\'s one daily reminder names the drug, its amount and its route', () => {
  const r = reminder({ title: 'Estradiol valerate', drug: 'Estradiol valerate', autoSource: 'dose:ep-ev' });
  const context = { reminders: [r], episodes: [ev], schedules: [schedule({ episodeId: 'ep-ev' })], todayEpochDay: TODAY };
  inLocale('en', () => {
    assert.deepEqual(describeReminder(r, context), { title: 'Estradiol valerate 4 mg, intramuscular', detail: null });
    assert.deepEqual(reminderNotification(r, context), { title: 'Estradiol valerate 4 mg, intramuscular', text: '09:00' });
  });
  inLocale('pl', () => {
    assert.deepEqual(reminderNotification(r, context), { title: 'Estradiol valerate 4 mg, domięśniowo', text: '09:00' });
  });
});

test('with several doses a day, each reminder says which dose of the day it is', () => {
  const morning = reminder({ title: 'Sertraline', drug: 'Sertraline', autoSource: 'dose:ep-se', time: '08:00' });
  const evening = reminder({ title: 'Sertraline', drug: 'Sertraline', autoSource: 'dose:ep-se', time: '20:00' });
  const context = {
    reminders: [evening, morning],
    episodes: [sertraline],
    schedules: [schedule({ episodeId: 'ep-se', dosesPerDay: 2 })],
    todayEpochDay: TODAY
  };
  inLocale('en', () => {
    assert.deepEqual(describeReminder(morning, context), { title: 'Sertraline 50 mg, oral', detail: 'Dose 1 of 2 a day' });
    assert.deepEqual(reminderNotification(evening, context), { title: 'Sertraline 50 mg, oral', text: 'Dose 2 of 2 a day · 20:00' });
  });
  inLocale('pl', () => {
    assert.deepEqual(reminderNotification(evening, context), { title: 'Sertraline 50 mg, doustnie', text: 'Dawka 2 z 2 na dzień · 20:00' });
  });
});

test('an amount set per dose of the day is that dose\'s amount, in the reader\'s number format', () => {
  const ep = episode({ id: 'ep-p', drug: 'Progesterone', dose: 100, route: 'oral' });
  const a = reminder({ title: 'Progesterone', drug: 'Progesterone', autoSource: 'dose:ep-p', time: '08:00' });
  const b = reminder({ title: 'Progesterone', drug: 'Progesterone', autoSource: 'dose:ep-p', time: '22:00' });
  const context = {
    reminders: [a, b],
    episodes: [ep],
    schedules: [
      schedule({ episodeId: 'ep-p', dosesPerDay: 2, doseAmounts: [{ dose: 0.5, doseUnit: 'mg' }, { dose: 200, doseUnit: 'mg' }] })
    ],
    todayEpochDay: TODAY
  };
  inLocale('en', () => {
    assert.equal(describeReminder(a, context).title, 'Progesterone 0.5 mg, oral');
    assert.equal(describeReminder(b, context).title, 'Progesterone 200 mg, oral');
  });
  inLocale('pl', () => assert.equal(describeReminder(a, context).title, 'Progesterone 0,5 mg, doustnie'));
});

test('an amount that changes from one day to the next is left out rather than guessed', () => {
  const r = reminder({ title: 'Estradiol valerate', drug: 'Estradiol valerate', autoSource: 'dose:ep-ev' });
  const context = {
    reminders: [r],
    episodes: [ev],
    schedules: [schedule({ episodeId: 'ep-ev', doseAmounts: [{ dose: 4, doseUnit: 'mg' }, { dose: 5, doseUnit: 'mg' }] })],
    todayEpochDay: TODAY
  };
  inLocale('en', () => assert.equal(describeReminder(r, context).title, 'Estradiol valerate, intramuscular'));
});

test('a route the app has no word for reads as the person wrote it', () => {
  const ep = episode({ id: 'ep-x', drug: 'Estradiol', route: 'patch, gel when travelling' });
  const r = reminder({ title: 'Estradiol', drug: 'Estradiol', autoSource: 'dose:ep-x' });
  const context = { reminders: [r], episodes: [ep], schedules: [schedule({ episodeId: 'ep-x' })], todayEpochDay: TODAY };
  inLocale('en', () => assert.equal(describeReminder(r, context).title, 'Estradiol 4 mg, patch, gel when travelling'));
});

test('a reminder made by hand for a drug keeps its own name and says what it is for underneath', () => {
  const own = reminder({ title: 'Morning pills', drug: 'Sertraline' });
  const named = reminder({ title: 'sertraline ', drug: 'Sertraline' });
  const context = { reminders: [own, named], episodes: [sertraline], schedules: [], todayEpochDay: TODAY };
  inLocale('en', () => {
    assert.deepEqual(describeReminder(own, context), { title: 'Morning pills', detail: 'Sertraline 50 mg, oral' });
    assert.deepEqual(reminderNotification(own, context), { title: 'Morning pills', text: 'Sertraline 50 mg, oral · 09:00' });
    // A name that is only the drug's says nothing the description does not.
    assert.deepEqual(describeReminder(named, context), { title: 'Sertraline 50 mg, oral', detail: null });
  });
});

test('a drug with two regimens running, or none, is named and nothing more', () => {
  const r = reminder({ title: 'Estradiol', drug: 'Estradiol' });
  const two = [episode({ id: 'a', drug: 'Estradiol' }), episode({ id: 'b', drug: 'Estradiol', route: 'gel' })];
  const ended = [episode({ id: 'c', drug: 'Estradiol', endEpochDay: TODAY - 1 })];
  inLocale('en', () => {
    assert.deepEqual(describeReminder(r, { reminders: [r], episodes: two, schedules: [], todayEpochDay: TODAY }), { title: 'Estradiol', detail: null });
    assert.deepEqual(describeReminder(r, { reminders: [r], episodes: ended, schedules: [], todayEpochDay: TODAY }), { title: 'Estradiol', detail: null });
  });
});

test('a reminder that is not about a drug is left as it is', () => {
  const r = reminder({ title: 'Call the clinic', time: '11:30' });
  const context = { reminders: [r], episodes: [ev], schedules: [], todayEpochDay: TODAY };
  assert.deepEqual(describeReminder(r, context), { title: 'Call the clinic', detail: null });
  assert.deepEqual(reminderNotification(r, context), { title: 'Call the clinic', text: '11:30' });
});
