import { describe, expect, it } from 'vitest';
import {
  READINGS,
  isReading,
  mostMarkedRegion,
  readingHref,
  spanFromSearch,
  topMoodStep
} from './lookBackReadings';
import { DEFAULT_SPAN_DAYS, spanRangeQuery } from './lookBackSpan';
import { dateInputValueFromEpochDay } from './epochDay';

const TODAY = 20700;

describe('a reading tile opens its screen at the door\'s span', () => {
  it('writes the span into the reading\'s address the way the body map and wrapped read it', () => {
    const span = { start: TODAY - 29, end: TODAY };
    expect(readingHref('day-by-day', span)).toBe(`/stats/day-by-day${spanRangeQuery(span)}`);
    expect(readingHref('themes', span)).toMatch(/^\/stats\/themes\?named=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  });

  it('knows its seven readings and refuses anything else', () => {
    expect(READINGS).toEqual(['day-by-day', 'plane', 'days', 'words', 'tags', 'highest', 'themes']);
    for (const key of READINGS) expect(isReading(key)).toBe(true);
    expect(isReading('body-map')).toBe(false);
    expect(isReading('')).toBe(false);
    expect(isReading(undefined)).toBe(false);
  });
});

describe('a reading screen reads the span back off its query', () => {
  const params = (from?: number, to?: number) => {
    const search = new URLSearchParams();
    if (from !== undefined) search.set('from', dateInputValueFromEpochDay(from));
    if (to !== undefined) search.set('to', dateInputValueFromEpochDay(to));
    return search;
  };

  it('takes the two days the door wrote', () => {
    expect(spanFromSearch(params(TODAY - 9, TODAY - 2), TODAY)).toEqual({ start: TODAY - 9, end: TODAY - 2 });
  });

  it('falls back to the door\'s own default window when the query is missing, half there or inverted', () => {
    const fallback = { start: TODAY - DEFAULT_SPAN_DAYS + 1, end: TODAY };
    expect(spanFromSearch(params(), TODAY)).toEqual(fallback);
    expect(spanFromSearch(params(TODAY - 5), TODAY)).toEqual(fallback);
    expect(spanFromSearch(params(TODAY, TODAY - 5), TODAY)).toEqual(fallback);
    expect(spanFromSearch(new URLSearchParams('from=yesterday&to=now'), TODAY)).toEqual(fallback);
  });

  it('accepts a one-day span', () => {
    expect(spanFromSearch(params(TODAY, TODAY), TODAY)).toEqual({ start: TODAY, end: TODAY });
  });
});

describe('the days tile\'s headline is the mood most days landed on', () => {
  it('picks the step with the most days and says what share of the days it was', () => {
    const steps = [
      { step: 1, count: 0 },
      { step: 2, count: 1 },
      { step: 3, count: 13 },
      { step: 4, count: 10 },
      { step: 5, count: 3 }
    ];
    expect(topMoodStep(steps)).toEqual({ step: 3, count: 13, share: 13 / 27 });
  });

  it('has no headline over a span with no days', () => {
    expect(topMoodStep([1, 2, 3, 4, 5].map((step) => ({ step, count: 0 })))).toBeNull();
    expect(topMoodStep([])).toBeNull();
  });

  it('breaks a tie towards the lower step, the way the strip is read', () => {
    expect(topMoodStep([{ step: 2, count: 4 }, { step: 4, count: 4 }])?.step).toBe(2);
  });
});

describe('the body map tile\'s headline is the region marked most often', () => {
  it('ranks by how many readings a region carried, not by how strongly', () => {
    const readings = [
      { region: 'chest', side: 'dysphoria' as const, value: 90, mixed: false, count: 2, sideCount: 2 },
      { region: 'hips', side: 'euphoria' as const, value: 40, mixed: true, count: 7, sideCount: 5 },
      { region: 'jaw', side: null, value: null, mixed: true, count: 3, sideCount: 0 }
    ];
    expect(mostMarkedRegion(readings)?.region).toBe('hips');
  });

  it('is absent over a span with no readings', () => {
    expect(mostMarkedRegion([])).toBeNull();
  });
});
