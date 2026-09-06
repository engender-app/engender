import { describe, expect, it } from 'vitest';

import { share } from './share';

describe('share', () => {
  it('is a percentage of the largest value in the set', () => {
    expect(share(5, 10)).toBe(50);
    expect(share(10, 10)).toBe(100);
  });

  it('is zero rather than NaN when nothing has been logged', () => {
    expect(share(0, 0)).toBe(0);
  });

  it('never goes negative', () => {
    expect(share(-3, 10)).toBe(0);
  });
});
