import { describe, expect, it } from 'vitest';

import * as gateFlag from './gateFlag';

const { gateDrawsFlag } = gateFlag;

describe('which gates draw the sun', () => {
  it('draws it on an unlock only, and never under disguise', () => {
    expect(gateDrawsFlag({ unlock: true, disguised: false })).toBe(true);
    expect(gateDrawsFlag({ unlock: true, disguised: true })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguised: false })).toBe(false);
    expect(gateDrawsFlag({ unlock: false, disguised: true })).toBe(false);
  });
});

describe('one field height ships', () => {
  it('has no demo switch left for the height', () => {
    expect(Object.keys(gateFlag).sort()).toEqual(['gateDrawsFlag']);
  });
});
