import { describe, expect, it } from 'vitest';

import { calmRole, eraBandRoles, HOME_AREA_ROLE, roleAt } from './roles.ts';

describe('roleAt', () => {
  const roles = ['a', 'b', 'c'].map((stripe) => ({
    stripe,
    ink: stripe,
    mark: stripe,
    paired: stripe,
    edge: null,
    pairedEdge: null,
    heat: []
  }));

  it('wraps, so a screen with more areas than the flag has colours still gets one', () => {
    /* trans yields three roles after de-duplication and Home has four
       areas, which is the ordinary case rather than the edge one. */
    expect(roleAt(roles, 0)?.stripe).toBe('a');
    expect(roleAt(roles, 3)?.stripe).toBe('a');
  });

  it('has nothing to give when the flag published none', () => {
    // A missing flag leaves no role to draw.
    expect(roleAt([], 0)).toBeUndefined();
  });
});

describe('eraBandRoles', () => {
  const role = (stripe: string) => ({ stripe, ink: stripe, mark: stripe, paired: stripe, edge: null, pairedEdge: null, heat: [] });

  it('cycles over the flag colours where there are two or more', () => {
    const roles = [role('#2E3192'), role('#EC008C'), role('#FFFFFF')];
    expect(eraBandRoles(roles).map((r) => r.stripe)).toEqual(['#2E3192', '#EC008C']);
  });

  it("adds a flag's own shades in behind its one colour, so a second era is not the same stripe again", () => {
    // agender's shape: one chromatic stripe, two achromatic shades.
    const roles = [role('#000000'), role('#B8B8B8'), role('#00FF00')];
    expect(eraBandRoles(roles).map((r) => r.stripe)).toEqual(['#00FF00', '#000000', '#B8B8B8']);
  });
});

describe("Home's area colours", () => {
  const indices = Object.values(HOME_AREA_ROLE);

  it('gives the week strip the one index guaranteed to be a colour', () => {
    /* Roles run colours before shades, so index 0 is the only one
       chromatic on every palette, and the strip is the one area on Home
       where the stripe is a value rather than a decoration. On trans,
       reading order handed it the white band and a heat ramp from white
       into a white page is not a ramp. */
    expect(HOME_AREA_ROLE.week).toBe(0);
  });

  it('shares role 1 across tile areas and preserves section roles', () => {
    expect(HOME_AREA_ROLE.liveTiles).toBe(1);
    expect(HOME_AREA_ROLE.lookBack).toBe(1);
    expect(HOME_AREA_ROLE.agenda).toBe(2);
    expect(HOME_AREA_ROLE.days).toBe(3);
    expect(HOME_AREA_ROLE.pinned).toBe(3);
  });

  it('gives the log strip the same guaranteed colour as the week strip', () => {
    /* Its write shapes are icon squares, a block of the stripe; on trans
       the white band would make a white square on a white page (redesign
       ticket 13). */
    expect(HOME_AREA_ROLE.log).toBe(0);
  });

  it('numbers the four distinct section roles contiguously from the strip', () => {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    expect(unique).toEqual([0, 1, 2, 3]);
  });
});

describe('calmRole', () => {
  const role = (stripe: string) => ({ stripe }) as never;
  it('skips a red stripe, so the breathing water is never blood red (bug session 18, item 75)', () => {
    const rainbow = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787'].map(role);
    expect(calmRole(rainbow)).toEqual(role('#FF8C00'));
    const lesbian = ['#D52D00', '#EF7627', '#FF9A56', '#FFFFFF', '#D162A4', '#B55690', '#A30262'].map(role);
    expect(calmRole(lesbian)).toEqual(role('#EF7627'));
  });
  it('keeps the first role where it is not red, and falls back to it when every role is', () => {
    const trans = ['#5BCEFA', '#F5A9B8', '#FFFFFF'].map(role);
    expect(calmRole(trans)).toEqual(role('#5BCEFA'));
    expect(calmRole(['#DC143C'].map(role))).toEqual(role('#DC143C'));
    expect(calmRole([])).toBeUndefined();
  });
});
