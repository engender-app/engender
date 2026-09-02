/* Which surfaces resurface the past unasked, and that each declares itself
   (phase 6 ticket 05) - the completeness guarantee, held at the level a
   module with no DOM can be, the same way registry.test.ts holds
   registry.ts's. */

import { describe, expect, it } from 'vitest';
import { RESURFACING_SURFACE_ROWS, RESURFACING_SURFACES, unregisteredSurfaces } from './resurfacing.ts';

describe('the resurfacing surface registry', () => {
  it('lists the four surfaces: a route and a Home tile, for on-this-day and for Wrapped', () => {
    expect(RESURFACING_SURFACES).toEqual(['on-this-day', 'on-this-day-home-card', 'wrapped', 'wrapped-home-card']);
  });

  it('gives every row a key of its own', () => {
    expect(new Set(RESURFACING_SURFACE_ROWS.map((row) => row.key)).size).toBe(RESURFACING_SURFACE_ROWS.length);
  });

  it('honours mutes on every row - the whole reason a surface is in this list at all', () => {
    for (const row of RESURFACING_SURFACE_ROWS) expect(row.honoursMutes, row.key).toBe(true);
  });

  it('marks a photo only where the surface can show one of its own', () => {
    expect(RESURFACING_SURFACE_ROWS.find((row) => row.key === 'on-this-day')?.photos).toBe(true);
    expect(RESURFACING_SURFACE_ROWS.find((row) => row.key === 'wrapped')?.photos).toBe(true);
    expect(RESURFACING_SURFACE_ROWS.find((row) => row.key === 'on-this-day-home-card')?.photos).toBeUndefined();
    expect(RESURFACING_SURFACE_ROWS.find((row) => row.key === 'wrapped-home-card')?.photos).toBeUndefined();
  });

  it('the completeness check can fail: a shortened registry names exactly the surface it is missing', () => {
    const shortened = RESURFACING_SURFACE_ROWS.filter((row) => row.key !== 'wrapped-home-card');
    expect(unregisteredSurfaces(shortened)).toEqual(['wrapped-home-card']);
  });
});
