import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { activeEpisodesAt, attributeDose, attributedDrug, earliestEpisode, isAmbiguousDrug } from './regimenEpisode.ts';
import type { RegimenEpisode } from './types.ts';

const episode = (
  id: string,
  startEpochDay: number,
  endEpochDay: number | null = null,
  drug = 'estradiol'
): RegimenEpisode => ({
  id,
  drug,
  ester: null,
  dose: 4,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay,
  endEpochDay,
  hidden: false
});

test('activeEpisodesAt resolves to the one episode covering the timestamp, like the old single-episode model', () => {
  const episodes = [episode('a', 100, 199), episode('b', 200, 299), episode('c', 300, null)];

  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(50)), []);
  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(100)).map((e) => e.id), ['a']);
  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(250)).map((e) => e.id), ['b']);
  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(300)).map((e) => e.id), ['c']);
  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(9999)).map((e) => e.id), ['c']);
});

test('activeEpisodesAt returns every episode overlapping the day, for concurrent episodes of different drugs', () => {
  const episodes = [
    episode('estradiol', 100, null, 'estradiol'),
    episode('spiro', 200, null, 'spironolactone')
  ];

  assert.deepEqual(activeEpisodesAt(episodes, startOfDayTimestamp(150)).map((e) => e.id), ['estradiol']);
  assert.deepEqual(
    activeEpisodesAt(episodes, startOfDayTimestamp(250))
      .map((e) => e.id)
      .sort(),
    ['estradiol', 'spiro']
  );
});

test('a retroactive correction changes what an existing record resolves to, by timestamp alone', () => {
  const before = [episode('a', 100, 199), episode('b', 200, null)];
  const recordTimestamp = startOfDayTimestamp(150);
  assert.deepEqual(activeEpisodesAt(before, recordTimestamp).map((e) => e.id), ['a']);

  const corrected = [episode('a', 100, 139), episode('c', 140, 199), episode('b', 200, null)];
  assert.deepEqual(activeEpisodesAt(corrected, recordTimestamp).map((e) => e.id), ['c']);
});

test('earliestEpisode is the first episode there has ever been, not the current one', () => {
  const episodes = [episode('a', 100, 199), episode('b', 200, 299), episode('c', 300, null)];
  assert.equal(earliestEpisode(episodes)?.id, 'a');
  assert.equal(earliestEpisode(episodes)?.startEpochDay, 100);
  assert.equal(earliestEpisode([]), null);
});

test('earliestEpisode is unaffected by episodes overlapping', () => {
  const episodes = [episode('b', 50, null, 'spironolactone'), episode('a', 100, null, 'estradiol')];
  assert.equal(earliestEpisode(episodes)?.id, 'b');
});

test('attributeDose falls back to the sole active episode when the dose names no drug of its own', () => {
  const episodes = [episode('a', 100, 199, 'estradiol'), episode('b', 200, null, 'estradiol')];
  const timestamp = startOfDayTimestamp(150);

  const result = attributeDose(episodes, { drug: null, timestamp });
  assert.equal(result.episode?.id, 'a');
  assert.equal(result.ambiguous, false);
});

test('attributeDose is ambiguous, and counted as such, when several episodes are active and the dose names no drug', () => {
  const episodes = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];
  const timestamp = startOfDayTimestamp(150);

  const result = attributeDose(episodes, { drug: null, timestamp });
  assert.equal(result.episode, null);
  assert.equal(result.ambiguous, true);
});

test('attributeDose is not ambiguous, only unresolved, when no episode covers the timestamp at all', () => {
  const episodes = [episode('a', 200, null, 'estradiol')];
  const timestamp = startOfDayTimestamp(100);

  const result = attributeDose(episodes, { drug: null, timestamp });
  assert.equal(result.episode, null);
  assert.equal(result.ambiguous, false);
});

test('a dose that names its own drug resolves to the one active episode naming that drug, even among several', () => {
  const episodes = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];
  const timestamp = startOfDayTimestamp(150);

  const result = attributeDose(episodes, { drug: 'spironolactone', timestamp });
  assert.equal(result.episode?.id, 's');
  assert.equal(result.ambiguous, false);
});

test('a dose naming a drug that matches no active episode is ambiguous, not silently unresolved', () => {
  const episodes = [episode('e', 100, null, 'estradiol')];
  const timestamp = startOfDayTimestamp(150);

  const result = attributeDose(episodes, { drug: 'testosterone', timestamp });
  assert.equal(result.episode, null);
  assert.equal(result.ambiguous, true);
});

test('case 4: a non-hormone oral dose alongside a concurrent estradiol episode never resolves to the estradiol episode', () => {
  // The bug this ticket exists to close: before ticket 38, a spironolactone
  // tablet logged by the same oral route as an active estradiol episode
  // resolved to that estradiol episode purely because it was the only one
  // active, and got drawn into its curve at full value.
  const episodes = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];
  const timestamp = startOfDayTimestamp(150);

  const withDrug = attributeDose(episodes, { drug: 'spironolactone', timestamp });
  assert.notEqual(withDrug.episode?.drug, 'estradiol');
  assert.equal(withDrug.episode?.drug, 'spironolactone');

  // And without a drug of its own, it must not silently fall back to
  // "the only episode of a curve-drawing hormone" either - it has to come
  // out ambiguous.
  const withoutDrug = attributeDose(episodes, { drug: null, timestamp });
  assert.equal(withoutDrug.episode, null);
  assert.equal(withoutDrug.ambiguous, true);
});

test('attributedDrug takes the dose\'s own drug even with no episode backing it', () => {
  const episodes: RegimenEpisode[] = [];
  const timestamp = startOfDayTimestamp(150);
  assert.equal(attributedDrug(episodes, { drug: 'melatonin', timestamp }), 'melatonin');
});

test('attributedDrug falls back to the sole active episode, tolerates several agreeing on the same drug, and is null when they disagree or none are active', () => {
  const single = [episode('a', 100, null, 'estradiol')];
  const sameDrugTwice = [episode('a', 100, null, 'estradiol'), episode('b', 100, null, 'estradiol')];
  const differentDrugs = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];
  const timestamp = startOfDayTimestamp(150);

  assert.equal(attributedDrug(single, { drug: null, timestamp }), 'estradiol');
  assert.equal(attributedDrug(sameDrugTwice, { drug: null, timestamp }), 'estradiol');
  assert.equal(attributedDrug(differentDrugs, { drug: null, timestamp }), null);
  assert.equal(attributedDrug([], { drug: null, timestamp }), null);
});

test('isAmbiguousDrug is true only for a drug-less dose whose active episodes disagree on the drug', () => {
  const timestamp = startOfDayTimestamp(150);
  const none: RegimenEpisode[] = [];
  const single = [episode('a', 100, null, 'estradiol')];
  const sameDrugTwice = [episode('a', 100, null, 'estradiol'), episode('b', 100, null, 'estradiol')];
  const differentDrugs = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];

  assert.equal(isAmbiguousDrug(none, { drug: null, timestamp }), false);
  assert.equal(isAmbiguousDrug(single, { drug: null, timestamp }), false);
  // Two episodes agreeing on the same drug - a dose change recorded as a
  // new episode before the old one was ended, say - are not ambiguous for
  // this question: there is only one honest drug name to give.
  assert.equal(isAmbiguousDrug(sameDrugTwice, { drug: null, timestamp }), false);
  assert.equal(isAmbiguousDrug(differentDrugs, { drug: null, timestamp }), true);
  // A dose naming its own drug is never ambiguous for this question, even
  // among several active episodes - attributedDrug takes it as-is.
  assert.equal(isAmbiguousDrug(differentDrugs, { drug: 'spironolactone', timestamp }), false);
});
