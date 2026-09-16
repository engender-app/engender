/* What the app's two body maps genuinely share (phase 10 redesign ticket 40).

   There are two of them - InjectionSiteMap.svelte, twelve anatomical points
   on limbs and abdomen, and BodyRegionMap.svelte, nine areas of a whole
   body - and the artwork deliberately stays apart, because one component
   forced over both would make both worse. What they do share is three
   rules, and only one of them is code.

   **The ramp.** Both shade a reading across the app's own five-step
   intensity ramp (metricRange.ts's `heatLevel`, and `roles.ts`'s per-stripe
   `heat` where the hue is a flag colour rather than the accent), so a
   calendar cell, a week cell, an injection dot and a body region all shade
   one reading the same way. `rampStyle` below is the one piece of that
   which was written twice.

   **Level 0 is not the bottom of the ramp.** It is the never-used site and
   the region with no readings in the range, and it is drawn by the absence
   of a fill rather than by a colour standing for absence - neither a large
   number nor zero reads as "never". That is why `rampStyle` returns nothing
   there rather than a colour.

   **A real button over the picture, never a tappable SVG path.** A
   `<button>` gets the focus ring, the touch target and the accessible name
   for free, and the drawing underneath is then just a drawing. Both maps
   follow it; it is a rule rather than a function, and this is where it is
   written down.

   **The accessible name carries what the colour says.** A fill is not
   readable, so the name says the reading in words - "where the last one
   went" on a site, the side and the native intensity on a region. Also a
   rule: the two say different things, in their own messages. */

/** A ramp step as the custom properties a map's shapes read, or nothing at
    all at level 0 and where the caller has no ramp to offer.

    The properties are the caller's own - a dot's fill is `--dot-fill` and a
    region's is `--region-fill`, and a region needs an ink beside it for the
    mark that sits on the fill - so what is shared here is the rule about
    level 0 rather than the names. */
export function rampStyle(
  level: number | null,
  variables: (level: number) => Record<string, string>
): string {
  if (level === null || level === 0) return '';
  return Object.entries(variables(level))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}
