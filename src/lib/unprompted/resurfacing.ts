import type { Journal } from '../data/journal/journal';
import { touchesMutedEra } from '../data/resurfacingConsent';

export type ResurfacingSurface =
  | 'on-this-day'
  | 'on-this-day-home-card'
  | 'wrapped'
  | 'wrapped-home-card'
  | 'on-this-day-notification'
  | 'wrapped-notification'
  | 'wrapped-share';

interface ResurfacingSurfaceRow {
  key: ResurfacingSurface;
  /** Required rather than optional: a surface with nothing to say about the
      mute layer does not belong in this list at all - the same reason
      UnpromptedRow.notify.channel is required, not optional. */
  honoursMutes: true;
  /** Present where the surface can show a photo it did not derive from a
      deliberate open. Required true wherever it is present, for the same
      reason - absent is "shows no photo of its own", true of both Home
      tiles. */
  photos?: true;
}

/* `as const`, not typed against `ResurfacingSurfaceRow[]`, for the same
   reason registry.ts's own `ROWS` is kept literal: typing each entry's `key`
   as the whole `ResurfacingSurface` union up front would widen it before
   `EverySurfaceRegistered` below ever compares them, which is the
   completeness check that could then never fail. */
const ROWS = [
  { key: 'on-this-day', honoursMutes: true, photos: true },
  { key: 'on-this-day-home-card', honoursMutes: true },
  { key: 'wrapped', honoursMutes: true, photos: true },
  { key: 'wrapped-home-card', honoursMutes: true },
  { key: 'on-this-day-notification', honoursMutes: true },
  { key: 'wrapped-notification', honoursMutes: true },
  { key: 'wrapped-share', honoursMutes: true }
] as const;

/* A kind in `ResurfacingSurface` with no entry above is a compile error
   here rather than a review catch, the same guarantee registry.ts's own
   `EveryKindRegistered` gives it. */
type Unregistered = Exclude<ResurfacingSurface, (typeof ROWS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
type EverySurfaceRegistered = AssertNoneUnregistered<Unregistered>;

export const RESURFACING_SURFACE_ROWS: readonly ResurfacingSurfaceRow[] = ROWS;

export const RESURFACING_SURFACES: readonly ResurfacingSurface[] = ROWS.map((row) => row.key);

/** The runtime half of `EverySurfaceRegistered`, the same shape
    registry.ts's `unregisteredKinds` gives its own list - so
    resurfacing.test.ts can show the completeness rule actually failing on a
    named, shortened registry. */
/* unregisteredSurfaces stays exported only for its own test (AU-09 test-only
   review). */
export function unregisteredSurfaces(rows: readonly Pick<ResurfacingSurfaceRow, 'key'>[]): ResurfacingSurface[] {
  const present = new Set(rows.map((row) => row.key));
  return RESURFACING_SURFACES.filter((key) => !present.has(key));
}

export interface ResurfacingRange {
  start: number;
  end: number;
}

/** Load consent before reading any resurfaced content. Each caller names a
    registered surface; missing or unknown keys are type errors. */
export async function resurfacing(surface: ResurfacingSurface, journal: Pick<Journal, 'eras' | 'eraMutes'>) {
  const [eras, mutedEraUuids] = await Promise.all([
    journal.eras.getEras(),
    journal.eraMutes.getMutedEraUuids()
  ]);
  const mayResurface = (range: ResurfacingRange) =>
    !touchesMutedEra(eras, mutedEraUuids, range.start, range.end);
  return {
    surface,
    mayResurface,
    allowedDays<T extends { epochDay: number }>(days: readonly T[]): T[] {
      return days.filter((day) => mayResurface({ start: day.epochDay, end: day.epochDay }));
    }
  };
}
