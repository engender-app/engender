/* Tier 0 of the motion system (DIRECTION.md): Home's flag sun, the app's
   one authored moment and the only ambient loop that survives phase 5
   (ticket 19). Kept apart from the FlagSun component so the two things the
   ticket's acceptance actually pins numbers to - ring geometry and the
   per-theme colour nudge - are unit-testable without mounting Svelte. */

/** The sun's outer diameter, the same for every flag (DIRECTION.md): a
    fixed step per ring instead would make three-stripe pansexual a third
    the size of seven-stripe agender. */
/* SUN_OUTER stays exported only for its own test (AU-09 test-only review). */
export const SUN_OUTER = 350;

interface SunRing {
  /** Diameter in px. */
  diameter: number;
  color: string;
  /** Seconds before the entrance starts. */
  inDelay: number;
  /** Seconds before the breathing loop starts. */
  breatheDelay: number;
}

/** The ring rule on its own: `n` radii, outermost first, each one band
    thinner than the last, so the innermost is a disc exactly one band
    across. Exported because the app draws this rule twice and must not
    hold it twice - Home's sun below, and the mark
    ($lib/components/mark.ts), which is the same drawing cropped to a tile
    and is why opening the app completes what the launcher icon started. */
export function ringRadii(n: number, outer: number): number[] {
  return Array.from({ length: n }, (_, i) => (outer * (n - i)) / n);
}

/** One ring per stripe, outermost stripe outermost, all equal radial
    thickness: the innermost ring is a disc whose radius is exactly one
    band, carrying the same weight as every ring around it, the way a
    flag's stripes are all the same width. Bisexual's doubled stops
    (`#D60270, #D60270, #9B4F96, ...`) turn into two adjacent equal rings
    of the same colour, which reads as one thicker band - its 2:1:2
    proportion for free, no special-casing here. */
export function sunRings(stripes: string[], dark: boolean): SunRing[] {
  const radii = ringRadii(stripes.length, SUN_OUTER / 2);
  return stripes.map((hex, i) => ({
    diameter: radii[i] * 2,
    color: hex,
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
