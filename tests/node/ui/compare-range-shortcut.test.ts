/* Tests for explicit preceding-span comparison shortcut. Verifies: - 7-day span pairing
   with immediately preceding 7 days without overlap or off-by-one. - Leap day and DST
   transitions preserve exact calendar-day counts. - replaced the shortcut: arriving with a
   span opens on that span against the one before it, and a visit without one on the last 30
   days. - Back restores the original Look back span. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { precedingWindow } from '../../../src/lib/data/compareStretch.ts';
import {
  getLastLookBackSpan,
  setLastLookBackSpan,
  type Span
} from '../../../src/lib/data/lookBackSpan.ts';
import {
  epochDayFromLocalDate,
  localDateFromEpochDay
} from '../../../src/lib/data/epochDay.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const comparePage = read('src/routes/compare/+page.svelte');
const statsPage = read('src/routes/stats/+page.svelte');
const compareTile = read('src/lib/components/readings/CompareTile.svelte');

describe('preceding-span comparison shortcut', () => {
  describe('calendar arithmetic and span pairing', () => {
    it('pairs a seven-day span with immediately preceding seven days without overlap or off-by-one', () => {
      // 7-day span: days 100 to 106 inclusive
      const current = { start: 100, end: 106 };
      const preceding = precedingWindow(current);

      expect(preceding.start).toBe(93);
      expect(preceding.end).toBe(99);

      // Current span length: 106 - 100 + 1 = 7 days
      expect(current.end - current.start + 1).toBe(7);
      // Preceding span length: 99 - 93 + 1 = 7 days
      expect(preceding.end - preceding.start + 1).toBe(7);
      // No overlap: preceding.end is strictly before current.start
      expect(preceding.end).toBe(current.start - 1);
      // Contiguous boundary without a gap: no missing day between 99 and 100
      expect(current.start - preceding.end).toBe(1);
    });

    it('preserves calendar-day count across leap day boundary', () => {
      // Leap year: 2024 (29 Feb 2024 exists)
      // 7-day span starting 28 Feb 2024: 28 Feb to 5 Mar 2024
      const start = epochDayFromLocalDate(new Date(2024, 1, 28)); // 2024-02-28
      const end = epochDayFromLocalDate(new Date(2024, 2, 5));   // 2024-03-05
      const current = { start, end };

      expect(current.end - current.start + 1).toBe(7);

      const preceding = precedingWindow(current);
      expect(preceding.end - preceding.start + 1).toBe(7);
      expect(preceding.end).toBe(current.start - 1);

      const precedingStartDate = localDateFromEpochDay(preceding.start);
      const precedingEndDate = localDateFromEpochDay(preceding.end);

      // Preceding 7 days: 2024-02-21 to 2024-02-27
      expect(precedingStartDate.getFullYear()).toBe(2024);
      expect(precedingStartDate.getMonth()).toBe(1); // Feb
      expect(precedingStartDate.getDate()).toBe(21);

      expect(precedingEndDate.getFullYear()).toBe(2024);
      expect(precedingEndDate.getMonth()).toBe(1); // Feb
      expect(precedingEndDate.getDate()).toBe(27);
    });

    it('preserves calendar-day count across DST spring transition', () => {
      // Central Europe spring transition: late March
      const start = epochDayFromLocalDate(new Date(2024, 2, 28)); // 2024-03-28
      const end = epochDayFromLocalDate(new Date(2024, 3, 3));   // 2024-04-03
      const current = { start, end };

      expect(current.end - current.start + 1).toBe(7);
      const preceding = precedingWindow(current);
      expect(preceding.end - preceding.start + 1).toBe(7);
      expect(preceding.end).toBe(current.start - 1);
    });

    it('preserves calendar-day count across DST autumn transition', () => {
      // Central Europe autumn transition: late October
      const start = epochDayFromLocalDate(new Date(2024, 9, 24)); // 2024-10-24
      const end = epochDayFromLocalDate(new Date(2024, 9, 30));   // 2024-10-30
      const current = { start, end };

      expect(current.end - current.start + 1).toBe(7);
      const preceding = precedingWindow(current);
      expect(preceding.end - preceding.start + 1).toBe(7);
      expect(preceding.end).toBe(current.start - 1);
    });
  });

  describe('Look back span persistence across navigation', () => {
    it('records and restores the last active Look back span', () => {
      setLastLookBackSpan(null);
      expect(getLastLookBackSpan()).toBeNull();

      const span: Span = { start: 19500, end: 19530 };
      setLastLookBackSpan(span);
      expect(getLastLookBackSpan()).toEqual(span);

      setLastLookBackSpan(null);
      expect(getLastLookBackSpan()).toBeNull();
    });

    it('stats page initializes and restores span via lastLookBackSpan', () => {
      expect(statsPage).toContain("getLastLookBackSpan");
      expect(statsPage).toContain("setLastLookBackSpan");
      expect(statsPage).toContain("let span = $state<Span | null>(getLastLookBackSpan());");
      expect(statsPage).toContain("setLastLookBackSpan(next);");
    });
  });

  describe('Compare surface wiring', () => {
    it('Look back CompareTile passes span via spanRangeQuery without pre-filling both sides', () => {
      expect(compareTile).toContain("href={`/compare${spanRangeQuery(span)}`}");
      expect(compareTile).not.toContain("compareStretchQuery");
    });

    it('Compare opens on A = the door span and B = the period before it, with no shortcut notice', () => {
      expect(comparePage).toContain("let aChoice = $state<PeriodChoice>(untrack(() => arrivalA(originSpan)));");
      expect(comparePage).toContain("let bChoice = $state<PeriodChoice>({ kind: 'preceding' });");
      expect(comparePage).toContain("return other ? precedingWindow(other) : null;");
      expect(comparePage).not.toContain('compare-shortcut');
      expect(comparePage).not.toContain('<Notice');
    });

    it('A visit with no span defaults A to the last 30 days', () => {
      expect(comparePage).toContain("{ kind: 'last30' }");
      expect(comparePage).toContain('return defaultSideA(today);');
    });
  });
});
