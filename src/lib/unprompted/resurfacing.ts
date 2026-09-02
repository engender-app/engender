/* Which surfaces resurface the past unasked, and that each was built to
   consult the resurfacing consent layer (phase 6 ticket 05, ADR-0049,
   CONTEXT: "Resurfacing consent") - following registry.ts's own pattern, a
   surface named here without `honoursMutes: true` set does not compile, the
   same way a notify row without `channel` does not. A fifth resurfacing
   surface someone adds later has to argue with this list rather than slip
   past a review.

   Four surfaces: the on-this-day route and its Home tile, the Wrapped route
   and its Home tile - the same screen/card split the unprompted registry
   itself draws, because each keeps its own preference gate and its own
   query. What actually honours the mute for each of the four is
   resurfacingConsent.ts's `touchesMutedEra`, called once per surface at its
   own read seam (on-this-day/+page.svelte, OnThisDayHomeCard.svelte,
   wrapped/[cadence]/+page.svelte, WrappedHomeCard.svelte).

   Photos are a second, separate control (hidden by default in a resurfacing
   context, tap to reveal) rather than a second field here: it has no
   surface of its own to be missing from this list, and is enforced by
   construction instead - the two places a resurfacing surface shows a
   photo (on-this-day, Wrapped) render it through ResurfacedPhoto.svelte
   rather than PhotoThumb directly. */

export type ResurfacingSurface = 'on-this-day' | 'on-this-day-home-card' | 'wrapped' | 'wrapped-home-card';

export interface ResurfacingSurfaceRow {
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
  { key: 'wrapped-home-card', honoursMutes: true }
] as const;

/* A kind in `ResurfacingSurface` with no entry above is a compile error
   here rather than a review catch, the same guarantee registry.ts's own
   `EveryKindRegistered` gives it. */
type Unregistered = Exclude<ResurfacingSurface, (typeof ROWS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySurfaceRegistered = AssertNoneUnregistered<Unregistered>;

export const RESURFACING_SURFACE_ROWS: readonly ResurfacingSurfaceRow[] = ROWS;

export const RESURFACING_SURFACES: readonly ResurfacingSurface[] = ROWS.map((row) => row.key);

/** The runtime half of `EverySurfaceRegistered`, the same shape
    registry.ts's `unregisteredKinds` gives its own list - so
    resurfacing.test.ts can show the completeness rule actually failing on a
    named, shortened registry. */
export function unregisteredSurfaces(rows: readonly Pick<ResurfacingSurfaceRow, 'key'>[]): ResurfacingSurface[] {
  const present = new Set(rows.map((row) => row.key));
  return RESURFACING_SURFACES.filter((key) => !present.has(key));
}
