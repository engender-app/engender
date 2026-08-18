/* Factor-impact correlation cards (phase 4 ticket 21): the area that
   stitches stats' day averages and tag insights to the dose log
   (correlationCards.ts owns the ranking math and is tested without a
   driver). This is phase 4's deliberate reversal of phase 3's explicit
   exclusion of correlation analysis - not scope drift slipping back in
   unnoticed, a conscious re-decision the phase 4 spec records. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';

const DAY_0 = 20000;
const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

test('a dose day and a higher mood surface as a card, in native mood units', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const [i, day] of [0, 1, 2, 3].entries()) {
    await journal.doses.upsertDose({ timestamp: at(DAY_0 + day), route: 'oral', dose: 4, doseUnit: 'mg' });
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 5 });
    void i;
  }
  for (const day of [4, 5, 6]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 2 });
  }

  const cards = await journal.correlationCards.getCards(DAY_0, DAY_0 + 6);

  const doseCard = cards.find((c) => c.occurrence.kind === 'doseDay' && c.metric === 'mood');
  assert.ok(doseCard);
  assert.equal(doseCard!.withAvg, 5);
  assert.equal(doseCard!.withoutAvg, 2);
});

test('a skipped dose is not a dose day: it never happened', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [0, 1, 2]) {
    await journal.doses.upsertDose({ timestamp: at(DAY_0 + day), route: 'oral', dose: 4, doseUnit: 'mg', status: 'skipped' });
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 5 });
  }
  for (const day of [3, 4, 5]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 2 });
  }

  const cards = await journal.correlationCards.getCards(DAY_0, DAY_0 + 5);

  assert.equal(cards.some((c) => c.occurrence.kind === 'doseDay'), false);
});

test('a tag against a gender dimension is a card too, in the dimension\'s own range', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [0, 1, 2]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 3, tags: ['e-tired'], dims: { femininity: 20 } });
  }
  for (const day of [3, 4, 5]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 3, dims: { femininity: 80 } });
  }

  const cards = await journal.correlationCards.getCards(DAY_0, DAY_0 + 5);

  const tagCard = cards.find((c) => c.occurrence.kind === 'tag' && c.occurrence.id === 'e-tired' && c.metric === 'femininity');
  assert.ok(tagCard);
  assert.equal(tagCard!.withAvg, 20);
  assert.equal(tagCard!.withoutAvg, 80);
});

test('a hidden dimension contributes no card', async () => {
  const { journal } = await journalWithBuiltIns();
  const custom = await journal.dimensions.addCustomDimension({ name: 'Voice comfort', low: 'strained', high: 'easy', min: 0, max: 10 });
  for (const day of [0, 1, 2]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 3, tags: ['e-tired'], dims: { [custom.key]: 2 } });
  }
  for (const day of [3, 4, 5]) {
    await journal.entries.upsertEntry({ epochDay: DAY_0 + day, mood: 3, dims: { [custom.key]: 9 } });
  }
  await journal.dimensions.setDimensionHidden(custom.key, true);

  const cards = await journal.correlationCards.getCards(DAY_0, DAY_0 + 5);

  assert.equal(cards.some((c) => c.metric === custom.key), false);
});

test('with nothing logged, the range comes back with no cards rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();

  const cards = await journal.correlationCards.getCards(DAY_0, DAY_0 + 5);

  assert.deepEqual(cards, []);
});
