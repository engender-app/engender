import { describe, expect, it } from 'vitest';

import { HOME_AREA_ROLE, roleAt } from './roles.ts';

describe('roleAt', () => {
  const roles = ['a', 'b', 'c'].map((stripe) => ({ stripe, ink: stripe, mark: stripe, heat: [] }));

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

  it('gives its four areas four different stripes', () => {
    /* The bug this map exists against: two areas landing on one colour.
       That is what the de-duplication above is for on the flag's side,
       and it would be undone here by a repeated index. */
    expect(indices).toHaveLength(4);
    expect(new Set(indices).size).toBe(4);
  });

  it('numbers them contiguously from the strip, so no stripe is skipped', () => {
    /* A gap would mean a screen with four areas reaching past the fourth
       role and wrapping onto a colour it already used. */
    expect([...indices].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});
