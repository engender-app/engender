import { describe, expect, it } from 'vitest';

import { wearTrendLegend } from './wearLegend';

describe('the wear trend legend promises only what is drawn', () => {
  it('wear data, region empty: one drawn entry and one note', () => {
    expect(wearTrendLegend(5, 0)).toEqual([
      { series: 'wear', state: 'drawn' },
      { series: 'region', state: 'empty' }
    ]);
  });

  it('both series present: two drawn entries', () => {
    expect(wearTrendLegend(3, 2)).toEqual([
      { series: 'wear', state: 'drawn' },
      { series: 'region', state: 'drawn' }
    ]);
  });

  it('both series empty: no entries - the chart itself becomes the empty state', () => {
    expect(wearTrendLegend(0, 0)).toEqual([]);
  });

  /* One day is a point, not a line (after-release 27, audit L05-14): the
     chart drew nothing and printed its own title as body text. */
  it('one day in each series draws no line, so there is no legend and the card says there is too little', () => {
    expect(wearTrendLegend(1, 1)).toEqual([]);
    expect(wearTrendLegend(1, 0)).toEqual([]);
  });

  it('a series with one day beside a drawn one says it has only one day', () => {
    expect(wearTrendLegend(4, 1)).toEqual([
      { series: 'wear', state: 'drawn' },
      { series: 'region', state: 'one-day' }
    ]);
  });
});
