import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate, epochDayMonthsAgo } from './epochDay.ts';
import { hrtAnchor, literatureWindowDays } from './personalEffectWindow.ts';
import type { RegimenEpisode } from './types.ts';

/* The effects timeline anchors on HRT, never on the first episode of any drug. Before it,
   the earliest episode of all anchored, so an SSRI started a year before estradiol moved
   every onset band a year early and, because sertraline names no literature table, took the
   bands away entirely. */

const E_START = epochDayFromLocalDate(new Date(2024, 0, 1));
const SSRI_START = epochDayMonthsAgo(E_START, 12);

const episode = (over: Partial<RegimenEpisode>): RegimenEpisode => ({
  id: 'x',
  drug: 'x',
  drugClass: 'other',
  ester: null,
  dose: 1,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay: E_START,
  endEpochDay: null,
  endReason: null,
  ...over
});

const ssri = episode({ id: 'ssri', drug: 'sertraline', drugClass: 'other', startEpochDay: SSRI_START });
const estradiol = episode({ id: 'e', drug: 'estradiol valerate', drugClass: 'hrt', startEpochDay: E_START });

test('an SSRI started before HRT leaves the onset windows counted from the HRT start', () => {
  const anchor = hrtAnchor([ssri, estradiol], null);
  assert.deepEqual(anchor, { drug: 'estradiol valerate', startEpochDay: E_START, endEpochDay: null });
  assert.equal(literatureWindowDays('breast_development', anchor!)?.onset.start, epochDayMonthsAgo(E_START, -3));
});

test('a portable HRT start date wins over the earliest HRT episode', () => {
  const set = epochDayMonthsAgo(E_START, 2);
  assert.equal(hrtAnchor([ssri, estradiol], set)?.startEpochDay, set);
  // With no HRT episode logged at all, the date still anchors; no drug means no band.
  const dateOnly = hrtAnchor([ssri], set);
  assert.deepEqual(dateOnly, { drug: '', startEpochDay: set, endEpochDay: null });
  assert.equal(literatureWindowDays('breast_development', dateOnly!), null);
});

test('no HRT episode and no date set is no anchor, whatever else was logged', () => {
  assert.equal(hrtAnchor([ssri], null), null);
  assert.equal(hrtAnchor([], null), null);
});

test('the drug a band is read against is the first HRT hormone, not an antiandrogen started before it', () => {
  const spiro = episode({ id: 's', drug: 'spironolactone', drugClass: 'hrt', startEpochDay: epochDayMonthsAgo(E_START, 1) });
  const anchor = hrtAnchor([spiro, estradiol], null);
  assert.equal(anchor?.drug, 'estradiol valerate');
  assert.equal(anchor?.startEpochDay, spiro.startEpochDay);
});

test('the HRT span ends only once every HRT episode has ended', () => {
  const end1 = epochDayMonthsAgo(E_START, -6);
  const oral = { ...estradiol, endEpochDay: end1 };
  const gel = episode({ id: 'g', drug: 'estradiol gel', drugClass: 'hrt', startEpochDay: end1 + 1 });
  assert.equal(hrtAnchor([oral, gel], null)?.endEpochDay, null);
  const end2 = epochDayMonthsAgo(E_START, -9);
  assert.equal(hrtAnchor([oral, { ...gel, endEpochDay: end2 }], null)?.endEpochDay, end2);
});
