/* InjectionSiteMap and BodyRegionMap share a five-step intensity ramp from
   heatLevel and roles.ts; calendar and week cells use the same scale.
   Level 0 means no reading or no prior use and has no fill. Each map puts
   real buttons over its artwork for focus and touch. Accessible names state
   what the colour means: last use for a site, side and native intensity for a
   region. */

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
