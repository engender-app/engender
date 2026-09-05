import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { activeEpisodesAt, attributeDose, attributeDrug, drugSpans, earliestEpisode } from './regimenEpisode.ts';
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
  endEpochDay
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

test('attributeDrug takes the dose\'s own drug even with no episode backing it, never ambiguous', () => {
  const episodes: RegimenEpisode[] = [];
  const timestamp = startOfDayTimestamp(150);
  assert.deepEqual(attributeDrug(episodes, { drug: 'melatonin', timestamp }), { drug: 'melatonin', ambiguous: false });
});

test('attributeDrug falls back to the sole active episode, tolerates several agreeing on the same drug, and is ambiguous only when they disagree', () => {
  const none: RegimenEpisode[] = [];
  const single = [episode('a', 100, null, 'estradiol')];
  const sameDrugTwice = [episode('a', 100, null, 'estradiol'), episode('b', 100, null, 'estradiol')];
  const differentDrugs = [episode('e', 100, null, 'estradiol'), episode('s', 100, null, 'spironolactone')];
  const timestamp = startOfDayTimestamp(150);

  assert.deepEqual(attributeDrug(single, { drug: null, timestamp }), { drug: 'estradiol', ambiguous: false });
  assert.deepEqual(attributeDrug(sameDrugTwice, { drug: null, timestamp }), { drug: 'estradiol', ambiguous: false });
  // No episode covers the timestamp at all - the pre-existing, silent
  // "nothing to attribute" case, and not the new ambiguous kind.
  assert.deepEqual(attributeDrug(none, { drug: null, timestamp }), { drug: null, ambiguous: false });
  // Two episodes actively disagreeing on the drug is the only new kind of
  // failure ticket 38 introduces.
  assert.deepEqual(attributeDrug(differentDrugs, { drug: null, timestamp }), { drug: null, ambiguous: true });
  // A dose naming its own drug is never ambiguous for this question, even
  // among several active episodes disagreeing - attributeDrug takes it as-is.
  assert.deepEqual(attributeDrug(differentDrugs, { drug: 'spironolactone', timestamp }), {
    drug: 'spironolactone',
    ambiguous: false
  });
});

test('drugSpans partitions a range into stretches a drug-less dose resolves the same way', () => {
  /* Estradiol throughout, spironolactone overlapping it in the middle: the
     overlap is the stretch where a dose naming no drug of its own cannot be
     told apart. */
  const episodes = [episode('e', 100, null, 'estradiol'), episode('s', 150, 199, 'spironolactone')];

  assert.deepEqual(drugSpans(episodes, 90, 250), [
    { fromEpochDay: 90, toEpochDay: 99, drug: null, ambiguous: false },
    { fromEpochDay: 100, toEpochDay: 149, drug: 'estradiol', ambiguous: false },
    { fromEpochDay: 150, toEpochDay: 199, drug: null, ambiguous: true },
    { fromEpochDay: 200, toEpochDay: 250, drug: 'estradiol', ambiguous: false }
  ]);
});

test('drugSpans agrees with attributeDrug on every day in the range', () => {
  const episodes = [
    episode('e', 100, 179, 'estradiol'),
    episode('s', 150, 199, 'spironolactone'),
    episode('e2', 190, null, 'estradiol'),
    // A second estradiol episode overlapping the first: two active episodes
    // that agree on the drug, which attributeDrug resolves rather than
    // calling ambiguous.
    episode('e3', 195, 205, 'estradiol')
  ];

  const spans = drugSpans(episodes, 95, 215);
  for (let day = 95; day <= 215; day += 1) {
    const span = spans.find((s) => day >= s.fromEpochDay && day <= s.toEpochDay);
    assert.ok(span, `day ${day} falls in no span`);
    assert.deepEqual(
      { drug: span.drug, ambiguous: span.ambiguous },
      attributeDrug(episodes, { drug: null, timestamp: startOfDayTimestamp(day) }),
      `day ${day} disagrees with attributeDrug`
    );
  }
});

test('drugSpans covers the range exactly, with no gap and no overlap', () => {
  const episodes = [episode('e', 100, 149, 'estradiol'), episode('s', 300, null, 'spironolactone')];
  const spans = drugSpans(episodes, 50, 400);

  assert.equal(spans[0].fromEpochDay, 50);
  assert.equal(spans[spans.length - 1].toEpochDay, 400);
  for (const [index, span] of spans.entries()) {
    assert.ok(span.fromEpochDay <= span.toEpochDay, `span ${index} runs backwards`);
    if (index > 0) assert.equal(span.fromEpochDay, spans[index - 1].toEpochDay + 1, `gap before span ${index}`);
  }
});

test('drugSpans answers a single span when no episode boundary falls inside the range', () => {
  const episodes = [episode('e', 100, null, 'estradiol')];
  assert.deepEqual(drugSpans(episodes, 200, 300), [
    { fromEpochDay: 200, toEpochDay: 300, drug: 'estradiol', ambiguous: false }
  ]);
  assert.deepEqual(drugSpans([], 200, 300), [
    { fromEpochDay: 200, toEpochDay: 300, drug: null, ambiguous: false }
  ]);
});

test('drugSpans answers nothing for a range that runs backwards', () => {
  assert.deepEqual(drugSpans([episode('e', 100, null)], 300, 200), []);
});
