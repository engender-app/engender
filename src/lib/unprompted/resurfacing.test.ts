/* Which surfaces resurface the past unasked, and that each declares itself
   (phase 6 ticket 05) - the completeness guarantee, held at the level a
   module with no DOM can be, the same way registry.test.ts holds
   registry.ts's. */

import { describe, expect, it } from 'vitest';
import { journalWithBuiltIns } from '../data/journal/test-support';
import { RESURFACING_SURFACE_ROWS, RESURFACING_SURFACES, unregisteredSurfaces, resurfacing } from './resurfacing.ts';

describe('the resurfacing surface registry', () => {
  it('registers routes, Home tiles, notifications and sharing', () => {
    expect(RESURFACING_SURFACES).toEqual(['on-this-day', 'on-this-day-home-card', 'wrapped', 'wrapped-home-card', 'on-this-day-notification', 'wrapped-notification', 'wrapped-share']);
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

describe('resurfacing consent through the registered interface', () => {
  it.each(RESURFACING_SURFACES)('%s excludes muted days and whole overlapping periods', async (surface) => {
    const { journal } = await journalWithBuiltIns();
    const era = await journal.eras.upsertEra({ name: 'kept out', startEpochDay: 19000, endEpochDay: 19100 });
    await journal.eraMutes.setEraMuted(era, true);

    const consent = await resurfacing(surface, journal);
    expect(consent.allowedDays([{ epochDay: 19050 }, { epochDay: 19200 }])).toEqual([{ epochDay: 19200 }]);
    expect(consent.mayResurface({ start: 18900, end: 19200 })).toBe(false);
    expect(consent.mayResurface({ start: 19101, end: 19200 })).toBe(true);

    await journal.eraMutes.setEraMuted(era, false);
    expect((await resurfacing(surface, journal)).mayResurface({ start: 19050, end: 19050 })).toBe(true);
  });
});
