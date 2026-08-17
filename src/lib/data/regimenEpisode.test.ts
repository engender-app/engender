import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay.ts';
import { episodeEndEpochDay, resolveEpisodeAt } from './regimenEpisode.ts';
import type { RegimenEpisode } from './types.ts';

const episode = (id: string, startEpochDay: number): RegimenEpisode => ({
  id,
  drug: 'estradiol',
  ester: null,
  dose: 4,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay,
  hidden: false
});

test('resolves to the latest episode whose start day is at or before the timestamp', () => {
  const episodes = [episode('a', 100), episode('b', 200), episode('c', 300)];

  assert.equal(resolveEpisodeAt(episodes, startOfDayTimestamp(50)), null);
  assert.equal(resolveEpisodeAt(episodes, startOfDayTimestamp(100))?.id, 'a');
  assert.equal(resolveEpisodeAt(episodes, startOfDayTimestamp(250))?.id, 'b');
  assert.equal(resolveEpisodeAt(episodes, startOfDayTimestamp(300))?.id, 'c');
  assert.equal(resolveEpisodeAt(episodes, startOfDayTimestamp(9999))?.id, 'c');
});

test('the answer does not depend on which episode is current "now"', () => {
  // Same list, a record logged well before the latest episode started: the
  // answer is about the record's own timestamp, never about today.
  const episodes = [episode('a', 100), episode('b', 200), episode('c', 300)];
  const recordTimestamp = startOfDayTimestamp(150);

  assert.equal(resolveEpisodeAt(episodes, recordTimestamp)?.id, 'a');
  assert.equal(epochDayFromTimestamp(recordTimestamp), 150);
});

test('a retroactive correction changes what an existing record resolves to, by timestamp alone', () => {
  const before = [episode('a', 100), episode('b', 200)];
  const recordTimestamp = startOfDayTimestamp(150);
  assert.equal(resolveEpisodeAt(before, recordTimestamp)?.id, 'a');

  // Starting a new episode with a past start date - inserted in start-day
  // order, exactly as getEpisodes() would return it.
  const corrected = [episode('a', 100), episode('c', 140), episode('b', 200)];
  assert.equal(resolveEpisodeAt(corrected, recordTimestamp)?.id, 'c');
});

test('episodeEndEpochDay derives the boundary from the next episode, or null for the latest', () => {
  const episodes = [episode('a', 100), episode('b', 200), episode('c', 300)];

  assert.equal(episodeEndEpochDay(episodes, 0), 199);
  assert.equal(episodeEndEpochDay(episodes, 1), 299);
  assert.equal(episodeEndEpochDay(episodes, 2), null);
});
