import { describe, expect, it } from 'vitest';

import { wearTrendLegend } from './wearLegend';

describe('the wear trend legend promises only what is drawn', () => {
  it('wear data, region empty: one drawn entry and one note', () => {
    expect(wearTrendLegend(true, false)).toEqual([
      { series: 'wear', empty: false },
      { series: 'region', empty: true }
    ]);
  });

  it('both series present: two drawn entries', () => {
    expect(wearTrendLegend(true, true)).toEqual([
      { series: 'wear', empty: false },
      { series: 'region', empty: false }
    ]);
  });

  it('both series empty: no entries - the chart itself becomes the empty state', () => {
    expect(wearTrendLegend(false, false)).toEqual([]);
  });
});
