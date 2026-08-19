import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { hairAnchorEpochDay } from './hairAnchor.ts';
import type { DoseEvent } from './types.ts';

const dose = (id: string, epochDay: number, status: DoseEvent['status'] = 'taken'): DoseEvent => ({
  id,
  timestamp: startOfDayTimestamp(epochDay),
  dose: 1,
  doseUnit: 'mg',
  status,
  scheduled: null,
  route: 'oral'
});

test('a date the person set is the anchor', () => {
  assert.equal(hairAnchorEpochDay(300, []), 300);
});

test('a date the person set wins over the dose log, earlier or later', () => {
  const doses = [dose('d1', 100)];

  assert.equal(hairAnchorEpochDay(300, doses), 300);
  assert.equal(hairAnchorEpochDay(50, doses), 50);
});

test('with no date set, the earliest dose of any drug anchors', () => {
  // No drug is named here at all: an estradiol dose anchors exactly as a
  // finasteride one would, which is the whole point of ticket 33.
  const doses = [dose('d1', 160), dose('d2', 120)];

  assert.equal(hairAnchorEpochDay(null, doses), 120);
});

test('a skipped dose is not the anchor - nothing was taken', () => {
  const doses = [dose('d1', 120, 'skipped'), dose('d2', 140, 'taken')];

  assert.equal(hairAnchorEpochDay(null, doses), 140);
});

test('a changed dose still counts - it was taken, just not as scheduled', () => {
  assert.equal(hairAnchorEpochDay(null, [dose('d1', 120, 'changed')]), 120);
});

test('null with nothing set and nothing logged', () => {
  assert.equal(hairAnchorEpochDay(null, []), null);
  assert.equal(hairAnchorEpochDay(null, [dose('d1', 120, 'skipped')]), null);
});

test('day zero is a date, not an absent one', () => {
  assert.equal(hairAnchorEpochDay(0, [dose('d1', 120)]), 0);
});
