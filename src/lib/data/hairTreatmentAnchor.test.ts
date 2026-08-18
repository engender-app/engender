import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { earliestHairTreatmentDoseEpochDay } from './hairTreatmentAnchor.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';

const episode = (id: string, startEpochDay: number, drug: string): RegimenEpisode => ({
  id,
  drug,
  ester: null,
  dose: 1,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay,
  hidden: false
});

const dose = (id: string, epochDay: number, status: DoseEvent['status'] = 'taken'): DoseEvent => ({
  id,
  timestamp: startOfDayTimestamp(epochDay),
  dose: 1,
  doseUnit: 'mg',
  status,
  scheduled: null,
  route: 'oral'
});

test('anchors to the earliest dose resolved to one of the three named drugs', () => {
  const episodes = [episode('a', 100, 'estradiol'), episode('b', 150, 'finasteride')];
  const doses = [dose('d1', 120), dose('d2', 160)];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), 160);
});

test('null with no qualifying dose logged yet', () => {
  const episodes = [episode('a', 100, 'estradiol')];
  const doses = [dose('d1', 120)];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), null);
  assert.equal(earliestHairTreatmentDoseEpochDay([], []), null);
});

test('a skipped dose is not the anchor - nothing was taken', () => {
  const episodes = [episode('a', 100, 'minoxidil')];
  const doses = [dose('d1', 120, 'skipped'), dose('d2', 140, 'taken')];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), 140);
});

test('a changed dose still counts - it was taken, just not as scheduled', () => {
  const episodes = [episode('a', 100, 'dutasteride')];
  const doses = [dose('d1', 120, 'changed')];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), 120);
});

test('matched exactly, trimmed - no case fold and no partial match', () => {
  const episodes = [episode('a', 100, 'Finasteride'), episode('b', 200, ' minoxidil ')];
  const doses = [dose('d1', 110), dose('d2', 210)];

  // 'Finasteride' does not match the lowercase canonical name; the second
  // episode's drug matches only once trimmed.
  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), 210);
});

test('a dose logged before any episode existed has no drug to anchor on', () => {
  const episodes = [episode('a', 200, 'finasteride')];
  const doses = [dose('d1', 100)];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), null);
});

test('distinct from the earliest episode start: the anchor is the dose, not the episode', () => {
  // A finasteride episode logged well before its first actual dose - the
  // anchor is when treatment began, not when the episode was recorded.
  const episodes = [episode('a', 100, 'finasteride')];
  const doses = [dose('d1', 130)];

  assert.equal(earliestHairTreatmentDoseEpochDay(doses, episodes), 130);
});
