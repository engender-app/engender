import { describe, expect, it } from 'vitest';

import { tallyInWords } from './tallyWords';

/* A tally with one tap in the range drew a lone ring in an empty plot that
   read as a chart failing to load (after-release 27, audit UI-12). Under two
   plotted positions the card says the count in words instead. */
describe('a tally too small to draw says its count in words', () => {
  it('says nothing was logged when the range is empty', () => {
    expect(tallyInWords([], 0)).toEqual({ kind: 'none' });
  });

  it('says once, and the day, for a single tap', () => {
    expect(tallyInWords([{ day: 20500, value: 1 }], 1)).toEqual({ kind: 'once', day: 20500 });
  });

  it('says how many and the day when every tap fell on one day', () => {
    expect(tallyInWords([{ day: 20500, value: 3 }], 1)).toEqual({ kind: 'one-day', count: 3, day: 20500 });
  });

  it('says how many and from when to when, when several days share one plotted position', () => {
    expect(
      tallyInWords(
        [
          { day: 20500, value: 1 },
          { day: 20503, value: 2 }
        ],
        1
      )
    ).toEqual({ kind: 'span', count: 3, from: 20500, to: 20503 });
  });

  it('draws the chart from two plotted positions up', () => {
    expect(
      tallyInWords(
        [
          { day: 20500, value: 1 },
          { day: 20510, value: 1 }
        ],
        2
      )
    ).toBeNull();
  });
});
