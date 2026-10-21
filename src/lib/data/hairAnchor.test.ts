import assert from 'node:assert/strict';
import { test } from 'vitest';
import { hairAnchorEpochDay } from './hairAnchor.ts';
import { hrtAnchor } from './personalEffectWindow.ts';
import type { RegimenEpisode } from './types.ts';

const episode = (id: string, drug: string, drugClass: RegimenEpisode['drugClass'], startEpochDay: number): RegimenEpisode => ({
  id,
  drug,
  drugClass,
  ester: null,
  dose: 1,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay,
  endEpochDay: null,
  endReason: null
});

const ssri = episode('s', 'sertraline', 'other', 100);
const estradiol = episode('e', 'estradiol', 'hrt', 400);

test('a date the person set on the hair screen wins over HRT, earlier or later', () => {
  const hrt = hrtAnchor([ssri, estradiol], null);
  assert.equal(hairAnchorEpochDay(300, hrt), 300);
  assert.equal(hairAnchorEpochDay(500, hrt), 500);
});

test('with no hair date set, an SSRI started first does not anchor; the earliest HRT episode does', () => {
  assert.equal(hairAnchorEpochDay(null, hrtAnchor([ssri, estradiol], null)), 400);
});

test('with no hair date set, the HRT start date set on the regimen screen anchors', () => {
  assert.equal(hairAnchorEpochDay(null, hrtAnchor([ssri, estradiol], 380)), 380);
});

test('null with nothing set and no HRT logged', () => {
  assert.equal(hairAnchorEpochDay(null, hrtAnchor([ssri], null)), null);
  assert.equal(hairAnchorEpochDay(null, null), null);
});

test('day zero is a date, not an absent one', () => {
  assert.equal(hairAnchorEpochDay(0, hrtAnchor([estradiol], null)), 0);
});
