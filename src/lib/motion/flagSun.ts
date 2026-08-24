/* Tier 0 of the motion system (DIRECTION.md): Home's flag sun, the app's
   one authored moment and the only ambient loop that survives phase 5
   (ticket 19). Kept apart from the FlagSun component so the two things the
   ticket's acceptance actually pins numbers to - ring geometry and the
   per-theme colour nudge - are unit-testable without mounting Svelte. */

/** The sun's outer diameter, the same for every flag (DIRECTION.md): a
    fixed step per ring instead would make three-stripe pansexual a third
    the size of seven-stripe agender. */
export const SUN_OUTER = 350;

/** A stripe that is near-black disappears into a dark theme and one that
    is near-white disappears into a light one, so both get nudged toward a
    colour that still reads as the flag's own stripe. The two yellows nudge
    for the same reason on light, one shade down. These are the app's 8
    palettes' actual near-black, white and yellow stripes (DIRECTION.md) -
    not a generic contrast formula, because there are exactly 8 palettes
    and the substitutes were chosen by eye against each one. */
export function ringColour(hex: string, dark: boolean): string {
  const upper = hex.toUpperCase();
  if (dark && (upper === '#000000' || upper === '#1A1A1A' || upper === '#2C2C2C' || upper === '#2F2F2F')) {
    return '#524C5E';
  }
  if (!dark && upper === '#FFFFFF') return '#DAD4DF';
  if (!dark && (upper === '#FCF434' || upper === '#FFED00')) return '#E3D300';
  return hex;
}

export interface SunRing {
  /** Diameter in px. */
  diameter: number;
  color: string;
  /** Seconds before the entrance starts. */
  inDelay: number;
  /** Seconds before the breathing loop starts. */
  breatheDelay: number;
}

/** One ring per stripe, outermost stripe outermost, all equal radial
    thickness: the innermost ring is a disc whose radius is exactly one
    band, carrying the same weight as every ring around it, the way a
    flag's stripes are all the same width. Bisexual's doubled stops
    (`#D60270, #D60270, #9B4F96, ...`) turn into two adjacent equal rings
    of the same colour, which reads as one thicker band - its 2:1:2
    proportion for free, no special-casing here. */
export function sunRings(stripes: string[], dark: boolean): SunRing[] {
  const n = stripes.length;
  return stripes.map((hex, i) => ({
    diameter: (SUN_OUTER * (n - i)) / n,
    color: ringColour(hex, dark),
    inDelay: i * 0.11,
    breatheDelay: i * 0.11 + 0.85
  }));
}

/** `--motif-stripes`'s value is a bare comma list of colours, read via
    getComputedStyle rather than duplicated in a parallel TS table - the
    same token every other palette-aware surface in the app reads, so a
    ninth palette needs no second place taught its stripes. */
export function parseMotifStripes(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
