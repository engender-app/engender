import { describe, expect, it } from 'vitest';

import { HOME_AREA_ROLE, roleAt } from './roles.ts';

describe('roleAt', () => {
  const roles = ['a', 'b', 'c'].map((stripe) => ({
    stripe,
    ink: stripe,
    mark: stripe,
    paired: stripe,
    heat: []
  }));

  it('wraps, so a screen with more areas than the flag has colours still gets one', () => {
    /* trans yields three roles after de-duplication and Home has four
       areas, which is the ordinary case rather than the edge one. */
    expect(roleAt(roles, 0)?.stripe).toBe('a');
    expect(roleAt(roles, 3)?.stripe).toBe('a');
  });

  it('has nothing to give when the flag published none', () => {
    // Which is what disguise looks like from here (ADR-0035).
    expect(roleAt([], 0)).toBeUndefined();
  });
});

describe("Home's area colours", () => {
  const indices = Object.values(HOME_AREA_ROLE);

  it('gives the week strip the one index guaranteed to be a colour', () => {
    /* Roles run colours before shades, so index 0 is the only one
       chromatic on all 8 palettes, and the strip is the one area on Home
       where the stripe is a value rather than a decoration. On trans,
       reading order handed it the white band and a heat ramp from white
       into a white page is not a ramp. */
    expect(HOME_AREA_ROLE.week).toBe(0);
  });

  it('shares role 1 across tile areas and preserves section roles', () => {
    expect(HOME_AREA_ROLE.liveTiles).toBe(1);
    expect(HOME_AREA_ROLE.lookBack).toBe(1);
    expect(HOME_AREA_ROLE.milestones).toBe(2);
    expect(HOME_AREA_ROLE.days).toBe(3);
  });

  it('numbers the four distinct section roles contiguously from the strip', () => {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    expect(unique).toEqual([0, 1, 2, 3]);
  });
});
