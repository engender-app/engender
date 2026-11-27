/* Render the launcher mark from the same ring geometry as Home's sun.
   The 100-unit tile has radius 30. The sun has radius 96.75, center (95, 5)
   and a black outer seam 3 units wide on each ring. Stripes have equal
   radial thickness and follow the flag's order. ringRadii owns that rule.

   Keep this drawing static. Mark.svelte and scripts/render-mark.mjs consume
   the same SVG string, and mark.test.ts checks geometry and motion. */

import { ringRadii } from '../motion/flagSun.ts';

/** In a 100 unit tile. */
export const MARK_R = 100;
export const MARK_SUN_X = 95;
export const MARK_SUN_Y = 5;
export const MARK_SUN_R = 96.75;
export const MARK_SEAM = 3;
export const MARK_TILE_RADIUS = 30;
export const MARK_TILE = '#FFFFFF';

/** The monochrome mark's ring count, fixed whatever the flag is: one colour
    has no bands to count, and fixing the count is what keeps the print
    header and a single-colour reproduction the same shape every time
    (ticket 38, round one's sub-decision, kept). */
export const MARK_MONO_RINGS = 4;

/** Keep the stroked tile inside Android's central 72dp safe circle
    on a 108dp canvas, radius 33.33 in 100 units. A rounded square
    with corner radius 0.6 times its half-side reaches 1.17 times that
    half-side. A 50-unit tile clears both this circle and the web
    maskable safe zone, at the cost of a smaller sun. */
export const MARK_SAFE_TILE = 50;
/** Round launcher crop: inside the circle, so even a seven-band sun shows its centre. */
export const ROUND_SUN_CENTER = 75;
export const ROUND_SUN_R = 85;

/** Every mark includes its edge. tile uses the rounded-square ground
    and stroke. round follows a circular crop. launcher-round shrinks
    and moves the sun to keep every stripe visible. bleed fills the
    mask canvas to the corners and centres MARK_SAFE_TILE. */
export type MarkCrop = 'tile' | 'round' | 'launcher-round' | 'bleed';

export interface MarkOptions {
  /** One ink and four rings, drawn as outlines, the edge included: the
      printed surfaces and any single-colour reproduction. The stripes are
      ignored when this is set, and so is the ground - paper is the ground
      there. */
  ink?: string;
  /** The ground under the drawing. Defaults to the white tile, or to
      nothing in one ink. */
  ground?: string | null;
  /** The clip path's id. Defaults to the crop's own name, which is unique
      in a file that holds one mark; a screen that draws one passes an id of
      its own, because a document can hold more than one element and two of
      the same id is not valid. */
  id?: string;
  /** An accessible name. Omitted, the mark is decorative and hidden, which
      is what it is everywhere it sits beside the app's own name in type. */
  label?: string;
}

/* markSvg's two inputs are constrained rather than trusted, the way
   icons.ts holds `size` and `cls` to one shape each (phase 12 audit finding
   S4): the string comes back out through {@html}, so an argument that could
   carry a quote could carry an attribute. A stripe has one fixed shape and
   is rejected to black when it doesn't match; a label is free text with no
   such shape, so it's escaped instead. Neither is reachable today - stripes
   come from palettes.css, no call site passes a label - which is why
   nothing here was exploitable before this. */

/** A hex colour, or black if the string carries anything else. */
function hexColor(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000';
}

/** Escaped for the `aria-label` attribute below, the only place a label is
    written. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The rings, outermost first. Each radius is pulled in by half a seam
    because the stroke straddles the boundary, so the outermost ring's black
    edge lands exactly on the sun's outside rather than half outside it. */
function ringMarkup(stripes: string[], ink: string | undefined, launcherRound = false): string {
  const n = ink ? MARK_MONO_RINGS : stripes.length;
  return ringRadii(n, launcherRound ? ROUND_SUN_R : MARK_SUN_R)
    .map((radius, i) => {
      const r = (radius - MARK_SEAM / 2).toFixed(2);
      const paint = ink
        ? `fill="none" stroke="${ink}"`
        : `fill="${hexColor(stripes[i])}" stroke="#000"`;
      const x = launcherRound ? ROUND_SUN_CENTER : MARK_SUN_X;
      const y = launcherRound ? MARK_R - ROUND_SUN_CENTER : MARK_SUN_Y;
      return `<circle cx="${x}" cy="${y}" r="${r}" ${paint} stroke-width="${MARK_SEAM}"/>`;
    })
    .join('');
}

/** Draw a seam along the crop shape. Inset the clip by half the seam and
    center an unclipped stroke on that path. Chromium antialiases the clip
    per element, so a stroke inside a full-size clip leaves a pale fringe
    over the ground. The stroke's inner half covers the clipped boundary
    and its outer half draws the only silhouette edge.

    tests/guards/mark-edge-fringe.mjs checks four sizes for pixels brighter than the
    page. Here bleed uses the tile crop at MARK_SAFE_TILE. */
function cropMarkup(crop: 'tile' | 'round', ink: string): { clip: string; edge: string } {
  const inset = MARK_SEAM / 2;
  const paint = `fill="none" stroke="${ink}" stroke-width="${MARK_SEAM}"`;
  const shape =
    crop === 'round'
      ? `<circle cx="50" cy="50" r="${(50 - inset).toFixed(2)}"`
      : `<rect x="${inset}" y="${inset}" width="${100 - MARK_SEAM}" height="${100 - MARK_SEAM}"`
        + ` rx="${(MARK_TILE_RADIUS - inset).toFixed(2)}"`;
  return { clip: `${shape}/>`, edge: `${shape} ${paint}/>` };
}

/** The whole mark as one SVG element. `size` is what the width and height
    attributes say; the drawing itself is always the same 100 unit tile. */
export function markSvg(
  stripes: string[],
  crop: MarkCrop,
  size: number | string,
  { ink, ground, id, label }: MarkOptions = {}
): string {
  const named =
    label === undefined ? `aria-hidden="true"` : `role="img" aria-label="${escapeAttr(label)}"`;
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"`
    + ` focusable="false" ${named}>`;

  if (crop === 'bleed') {
    /* A mask's canvas: ground to all four corners, the stroked tile in the
       middle of it. Composed from the tile rather than drawn again, so the
       thing a launcher shows is the same drawing an install shows, only
       smaller. */
    const offset = (100 - MARK_SAFE_TILE) / 2;
    const scale = MARK_SAFE_TILE / 100;
    const tile = markSvg(stripes, 'tile', 100, { ink, ground, id, label })
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    return (
      open
      + `<rect width="100" height="100" fill="${ground ?? MARK_TILE}"/>`
      + `<g transform="translate(${offset},${offset}) scale(${scale})">${tile}</g></svg>`
    );
  }

  /* In one ink, the tile's edge is that ink too: the mark on paper is one
     colour and the square around it is part of the mark, not a frame drawn
     in a second one. */
  const { clip, edge } = cropMarkup(crop === 'launcher-round' ? 'round' : crop, ink ?? '#000');
  const fill = ground === undefined ? (ink ? null : MARK_TILE) : ground;
  const paper = fill === null ? '' : `<rect width="100" height="100" fill="${fill}"/>`;
  const drawing = `${paper}${ringMarkup(stripes, ink, crop === 'launcher-round')}`;
  /* The crop's own name is right for a file, which holds one mark. A screen
     can hold more than one element, so Mark.svelte mints its own. */
  const clipId = id ?? `mark-${crop}`;
  return (
    `${open}<defs><clipPath id="${clipId}">${clip}</clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${drawing}</g>${edge}</svg>`
  );
}
