/* Milestone status, which four screens read and none of them may compute
   for itself. Days are epoch days, so every case is arithmetic
   against a fixed "today" rather than against the clock. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { landingMilestone, milestoneStatus, upcomingMilestones } from './milestoneStatus.ts';
import type { Milestone } from './types.ts';

const day = (year: number, month: number, date: number) => epochDayFromLocalDate(new Date(year, month - 1, date));

const milestone = (name: string, epochDay: number): Milestone => ({
  id: name,
  name,
  epochDay,
  description: '',
  templateKey: null,
  photo: null
});

test('a future milestone counts down; the day itself is neither countdown nor anniversary', () => {
  const today = day(2026, 8, 11);
  assert.deepEqual(milestoneStatus({ epochDay: day(2026, 8, 27) }, today), { type: 'countdown', days: 16 });
  assert.deepEqual(milestoneStatus({ epochDay: today }, today), { type: 'today', days: 0 });
});

test('a past milestone reads as years since, and as the days to its next anniversary', () => {
  const today = day(2026, 8, 11);
  assert.deepEqual(milestoneStatus({ epochDay: day(2024, 8, 1) }, today), {
    type: 'anniversary',
    years: 2,
    inDays: 355,
    isAnnivToday: false
  });
});

test('the anniversary day itself is flagged, and counts the year it completes', () => {
  const today = day(2026, 8, 11);
  assert.deepEqual(milestoneStatus({ epochDay: day(2023, 8, 11) }, today), {
    type: 'anniversary',
    years: 3,
    inDays: 0,
    isAnnivToday: true
  });
});

test('a 29 February milestone reads its first anniversary as one year, not zero', () => {
  // The gap to 28 February 2027 is 364 days, so measuring years off the gap
  // rather than off the anniversary reported "0 years" on the day this flags
  // as the first one.
  const status = milestoneStatus({ epochDay: day(2024, 2, 29) }, day(2025, 2, 28));
  assert.deepEqual(status, { type: 'anniversary', years: 1, inDays: 0, isAnnivToday: true });
});

test('countdowns and anniversaries share one order: how many days away they are', () => {
  const today = day(2026, 8, 11);
  const ordered = upcomingMilestones(
    [
      milestone('far countdown', day(2026, 12, 1)),
      milestone('anniversary tomorrow', day(2020, 8, 12)),
      milestone('near countdown', day(2026, 8, 14)),
      milestone('anniversary just gone', day(2020, 8, 10))
    ],
    today
  );

  assert.deepEqual(ordered.map((x) => x.m.name), [
    'anniversary tomorrow',
    'near countdown',
    'far countdown',
    'anniversary just gone'
  ]);
});

test('a milestone landing today sorts to the front, ahead of everything counting down', () => {
  const today = day(2026, 8, 11);
  const ordered = upcomingMilestones(
    [milestone('tomorrow', today + 1), milestone('today', today)],
    today
  );
  assert.deepEqual(ordered.map((x) => x.m.name), ['today', 'tomorrow']);
});

test('Home marks the milestone landing today, on its own day or on an anniversary', () => {
  const today = day(2026, 8, 11);
  assert.equal(landingMilestone([milestone('tomorrow', today + 1), milestone('today', today)], today, () => true)?.m.name, 'today');
  assert.equal(landingMilestone([milestone('three years on', day(2023, 8, 11))], today, () => true)?.m.name, 'three years on');
  assert.equal(landingMilestone([milestone('last week', today - 7), milestone('next week', today + 7)], today, () => true), undefined);
});

test('a milestone set not to be celebrated is never marked, and the next one landing today is', () => {
  const today = day(2026, 8, 11);
  const quiet = { ...milestone('the hard one', day(2023, 8, 11)), celebrate: false };
  assert.equal(landingMilestone([quiet], today, () => true), undefined);
  assert.equal(landingMilestone([{ ...milestone('today, quietly', today), celebrate: false }], today, () => true), undefined);
  assert.equal(landingMilestone([quiet, milestone('also today', today)], today, () => true)?.m.name, 'also today');
});

test('an anniversary inside a muted era is not marked; one outside it still is', () => {
  const today = day(2026, 8, 11);
  const muted = day(2023, 8, 11);
  const mayResurface = (epochDay: number) => epochDay !== muted;
  assert.equal(landingMilestone([milestone('in the muted year', muted)], today, mayResurface), undefined);
  assert.equal(
    landingMilestone([milestone('in the muted year', muted), milestone('another year', day(2021, 8, 11))], today, mayResurface)?.m.name,
    'another year'
  );
  // Landing on its own day is not resurfacing anything, so a mute that
  // reaches today does not hold it back.
  assert.equal(landingMilestone([milestone('today', today)], today, () => false)?.m.name, 'today');
});
