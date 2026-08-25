import { describe, expect, it } from 'vitest';

import { epochDayFromDateInputValue } from './epochDay';
import {
  WRAPPED_RANGE_CHOICES,
  WRAPPED_RANGE_DEFAULT,
  parseWrappedRangeParams,
  resolveWrappedRange,
  wrappedRangeCadence,
  wrappedRangeQuery
} from './wrappedRange';

/* A fixed local day, so every case below is arithmetic rather than a
   read of the clock: 15 June 2026. */
const TODAY = epochDayFromDateInputValue('2026-06-15') as number;
const day = (value: string) => epochDayFromDateInputValue(value) as number;

describe('the named ranges wrapped absorbed from recap', () => {
  it('offers every one of recap\'s own choices', () => {
    expect([...WRAPPED_RANGE_CHOICES]).toEqual(['prevMonth', 'prevYear', 'd7', 'd30', 'd90', 'ytd', 'custom']);
  });

  it('sends the two completed periods to the cadence that already has a screen', () => {
    expect(wrappedRangeCadence('prevMonth')).toBe('month');
    expect(wrappedRangeCadence('prevYear')).toBe('year');
    for (const choice of ['d7', 'd30', 'd90', 'ytd', 'custom'] as const) {
      expect(wrappedRangeCadence(choice), choice).toBeNull();
    }
    /* And neither resolves to a range, because a navigation is not one. */
    expect(resolveWrappedRange('prevMonth', TODAY)).toBeNull();
    expect(resolveWrappedRange('prevYear', TODAY)).toBeNull();
  });

  it('counts a rolling window inclusively, ending today', () => {
    expect(resolveWrappedRange('d7', TODAY)).toEqual({ start: TODAY - 6, end: TODAY });
    expect(resolveWrappedRange('d30', TODAY)).toEqual({ start: TODAY - 29, end: TODAY });
    expect(resolveWrappedRange('d90', TODAY)).toEqual({ start: TODAY - 89, end: TODAY });
  });

  it('runs year to date from 1 January through today', () => {
    expect(resolveWrappedRange('ytd', TODAY)).toEqual({ start: day('2026-01-01'), end: TODAY });
  });
});

describe('a custom range', () => {
  it('needs both boundaries', () => {
    expect(resolveWrappedRange('custom', TODAY, { start: '2026-05-01', end: '' })).toBeNull();
    expect(resolveWrappedRange('custom', TODAY, { start: '', end: '2026-05-31' })).toBeNull();
    expect(resolveWrappedRange('custom', TODAY, { start: '', end: '' })).toBeNull();
    expect(resolveWrappedRange('custom', TODAY)).toBeNull();
  });

  it('takes both ends inclusively, in order', () => {
    expect(resolveWrappedRange('custom', TODAY, { start: '2026-05-01', end: '2026-05-31' })).toEqual({
      start: day('2026-05-01'),
      end: day('2026-05-31')
    });
    expect(resolveWrappedRange('custom', TODAY, { start: '2026-05-31', end: '2026-05-01' })).toBeNull();
  });

  it('does not run past today, since there is nothing there to look back on', () => {
    expect(resolveWrappedRange('custom', TODAY, { start: '2026-06-01', end: '2026-06-15' })).not.toBeNull();
    expect(resolveWrappedRange('custom', TODAY, { start: '2026-06-01', end: '2026-06-16' })).toBeNull();
  });
});

describe('the range in the URL', () => {
  it('defaults with no parameters at all', () => {
    const parsed = parseWrappedRangeParams(null, null, null, TODAY);
    expect(parsed.choice).toBe(WRAPPED_RANGE_DEFAULT);
    expect(parsed.range).toEqual({ start: TODAY - 29, end: TODAY });
  });

  it('reads a named window back', () => {
    expect(parseWrappedRangeParams('d90', null, null, TODAY)).toMatchObject({
      choice: 'd90',
      range: { start: TODAY - 89, end: TODAY }
    });
  });

  it('reads a custom range back from its two dates, named or not', () => {
    for (const named of ['custom', null]) {
      const parsed = parseWrappedRangeParams(named, '2026-05-01', '2026-05-31', TODAY);
      expect(parsed.choice, String(named)).toBe('custom');
      expect(parsed.customStart).toBe('2026-05-01');
      expect(parsed.customEnd).toBe('2026-05-31');
      expect(parsed.range).toEqual({ start: day('2026-05-01'), end: day('2026-05-31') });
    }
  });

  /* These arrive from a bookmark, a hand-typed URL or a build that knew a
     choice this one does not. A wrapped is a screen you open to look back,
     so it opens on something rather than on an error. */
  it('falls back to the default rather than throwing on a choice it does not know', () => {
    expect(parseWrappedRangeParams('d1000', null, null, TODAY).choice).toBe(WRAPPED_RANGE_DEFAULT);
    expect(parseWrappedRangeParams('', 'not-a-date', 'nor-this', TODAY).choice).toBe(WRAPPED_RANGE_DEFAULT);
  });

  it('holds a half-finished custom range as the choice with no range yet', () => {
    const parsed = parseWrappedRangeParams('custom', '2026-05-01', null, TODAY);
    expect(parsed.choice).toBe('custom');
    expect(parsed.customStart).toBe('2026-05-01');
    expect(parsed.range).toBeNull();
  });

  it('writes back the query it reads', () => {
    for (const choice of ['d7', 'd30', 'd90', 'ytd'] as const) {
      const parsed = parseWrappedRangeParams(
        new URLSearchParams(wrappedRangeQuery(choice)).get('named'),
        null,
        null,
        TODAY
      );
      expect(parsed.choice, choice).toBe(choice);
    }
    const custom = new URLSearchParams(wrappedRangeQuery('custom', { start: '2026-05-01', end: '2026-05-31' }));
    expect(parseWrappedRangeParams(custom.get('named'), custom.get('from'), custom.get('to'), TODAY)).toMatchObject({
      choice: 'custom',
      range: { start: day('2026-05-01'), end: day('2026-05-31') }
    });
  });
});
