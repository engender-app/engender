/* The on-this-day lookback rule. Rune-free and
   import-light for the same reason wrapped.test.ts is - run under both
   timezones:

     TZ=America/Los_Angeles npm test -- on-this-day
     TZ=Europe/Warsaw npm test -- on-this-day */
import { test, expect } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { ON_THIS_DAY_LOOKBACKS, onThisDayCandidates } from './on-this-day.ts';
import { journalWithBuiltIns } from './journal/test-support';
import { resurfacing } from '../unprompted/resurfacing.ts';

const tz = process.env.TZ ?? '(system default)';
const day = (year: number, month: number, dayOfMonth: number) =>
  epochDayFromLocalDate(new Date(year, month, dayOfMonth));

test(`each lookback names a calendar day this many months before today, under TZ=${tz}`, () => {
  const today = day(2026, 7, 20); // Thursday 20 August 2026

  expect(onThisDayCandidates(today)).toEqual([
    { key: 'year', epochDay: day(2025, 7, 20) },
    { key: 'sixMonths', epochDay: day(2026, 1, 20) },
    { key: 'month', epochDay: day(2026, 6, 20) }
  ]);
});

test(`the three lookbacks are longest first, under TZ=${tz}`, () => {
  expect(ON_THIS_DAY_LOOKBACKS.map((l) => l.key)).toEqual(['year', 'sixMonths', 'month']);
});

test(`older good days remain candidates through journal start, under TZ=${tz}`, async () => {
  const today = day(2026, 7, 20);
  const candidates = onThisDayCandidates(today, day(2022, 0, 1));
  expect(candidates.slice(0, 3)).toEqual([
    { key: 'year-4', epochDay: day(2022, 7, 20), years: 4 },
    { key: 'year-3', epochDay: day(2023, 7, 20), years: 3 },
    { key: 'year-2', epochDay: day(2024, 7, 20), years: 2 }
  ]);
  const { journal } = await journalWithBuiltIns();
  for (const [year, mood] of [[2022, 4], [2023, 4], [2024, 3], [2025, 1]]) {
    await journal.entries.upsertEntry({ epochDay: day(year, 7, 20), mood });
  }
  const muted = await journal.eras.upsertEra({ name: 'private year', startEpochDay: day(2023, 0, 1), endEpochDay: day(2023, 11, 31) });
  await journal.eraMutes.setEraMuted(muted, true);
  const consent = await resurfacing('on-this-day', journal);
  const allowed = consent.allowedDays(candidates);
  const good = await Promise.all(allowed.map((candidate) => journal.stats.isGoodDay(candidate.epochDay)));
  expect(allowed.filter((_, index) => good[index]).map((candidate) => candidate.key)).toEqual(['year-4', 'year-2']);
  expect(candidates.some((candidate) => candidate.epochDay === day(2021, 7, 20))).toBe(false);
});
