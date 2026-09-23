import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './journal/test-support';
import type { Journal } from './journal/journal';
import { readWrappedEras, readWrappedPeriod } from './wrappedReads';

const TODAY = 20400;
const START = 20000;
const END = 20364;

/** The journal, with every call it is asked for written down in order. */
function recording(journal: Journal) {
  const called: string[] = [];
  const areas = new Proxy({}, {
    get: (_target, area: string) => new Proxy({}, {
      get: (_inner, operation: string) => (...args: unknown[]) => {
        called.push(`${area}.${operation}`);
        return (journal[area as keyof Journal] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[operation](...args);
      }
    })
  }) as Journal;
  return { areas, called };
}

test('each read starts every journal call before its first await', async () => {
  const { journal } = await journalWithBuiltIns();

  const eras = recording(journal);
  const erasPending = readWrappedEras(eras.areas);
  const erasBeforeAwait = [...eras.called];
  await erasPending;
  assert.deepEqual(eras.called, erasBeforeAwait);
  assert.deepEqual(erasBeforeAwait, ['eras.getEras', 'eras.getJournalBounds', 'eraMutes.getMutedEraUuids']);

  for (const year of [true, false]) {
    const period = recording(journal);
    const pending = readWrappedPeriod(period.areas, { start: START, end: END, today: TODAY, metric: 'mood', year });
    const beforeAwait = [...period.called];
    await pending;
    assert.deepEqual(period.called, beforeAwait);
    // A year also reads its scale's series and its letters; nothing else does.
    assert.equal(beforeAwait.length, year ? 7 : 5);
    assert.equal(beforeAwait.includes('letters.getLetters'), year);
  }
});

test('a year carries its unlocked letters and the tallies, a week or a month neither letters nor a scale', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: START + 10, mood: 4, tags: ['e-happy'] });
  await journal.tally.log({ epochDay: START + 10, kind: 'misgendered' });
  await journal.tally.log({ epochDay: START + 11, kind: 'correctly_gendered' });
  await journal.tally.log({ epochDay: START + 12, kind: 'correctly_gendered' });
  await journal.letters.addLetter({ epochDay: START + 5, text: 'dear future me', unlockEpochDay: TODAY - 1 });
  await journal.letters.addLetter({ epochDay: START + 6, text: 'not yet', unlockEpochDay: TODAY + 30 });

  const year = await readWrappedPeriod(journal, { start: START, end: END, today: TODAY, metric: 'mood', year: true });
  assert.equal(year.recap.entryCount, 1);
  assert.deepEqual(year.tally, { misgendered: 1, correctlyGendered: 2 });
  assert.deepEqual(year.letters.map(({ letter }) => letter.text), ['dear future me']);
  assert.equal(year.moodTrend.length, 1);
  assert.equal(year.scaleTrend.length, 1);

  const month = await readWrappedPeriod(journal, { start: START, end: START + 29, today: TODAY, metric: 'mood', year: false });
  assert.deepEqual(month.letters, []);
  assert.deepEqual(month.scaleTrend, []);
  assert.equal(month.moodTrend.length, 1);
});
