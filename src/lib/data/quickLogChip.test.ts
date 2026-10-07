import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { episodesWithNoDoseLogged, remainingAfterOneDose } from './quickLogChip.ts';
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
  endReason: null
});

/* The editor's quick-log chip (after-release ticket 01, L04-09). It used to
   read a dose's own `drug`, which is null on most doses, so a dose logged
   from the dose sheet left the chip up and one tap logged a second. */

const dayDose = (epochDay: number, drug: string | null = null) => ({
  drug,
  timestamp: startOfDayTimestamp(epochDay) + 9 * 3600000
});

test('a dose with no drug name of its own takes the episode off the still-to-log list', () => {
  const episodes = [episode('a', 100)];
  assert.deepEqual(episodesWithNoDoseLogged(episodes, episodes, [dayDose(150)]), []);
});

test('an episode with nothing logged that day stays on the list', () => {
  const episodes = [episode('a', 100)];
  assert.deepEqual(episodesWithNoDoseLogged(episodes, episodes, []).map((e) => e.id), ['a']);
});

test('a dose naming one of two running drugs takes only that one off, whatever its case', () => {
  const episodes = [episode('a', 100, null, 'Estradiol'), episode('b', 100, null, 'spironolactone')];
  assert.deepEqual(
    episodesWithNoDoseLogged(episodes, episodes, [dayDose(150, 'estradiol ')]).map((e) => e.id),
    ['b']
  );
});

test('a drug-less dose while two drugs run belongs to neither, so both stay', () => {
  const episodes = [episode('a', 100, null, 'estradiol'), episode('b', 100, null, 'spironolactone')];
  assert.deepEqual(
    episodesWithNoDoseLogged(episodes, episodes, [dayDose(150)]).map((e) => e.id),
    ['a', 'b']
  );
});

test('one more dose leaves a fifth of a vial less at five doses per vial, a whole unit with none set', () => {
  assert.equal(remainingAfterOneDose(2, { dosesPerUnit: 5 }), 1.8);
  assert.equal(remainingAfterOneDose(2, { dosesPerUnit: null }), 1);
});
