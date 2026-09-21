/* The app's mark, as one drawing (ticket 38 round three, ticket 50).

   The corner sun: one ring per stripe of the active flag, outermost stripe
   outermost, equal radial thickness, centred exactly on the tile's top right
   corner, each ring carrying a black edge on its outer side. It is Home's sun
   cropped to a tile rather than a second idea, which is the point of it -
   opening the app completes the drawing the launcher icon started. The ring
   rule itself is not here: `ringRadii` in $lib/motion/flagSun.ts owns it and
   both drawings call it, so there is one rule and two croppings of it.

     corner sun: R 100, centre 0, seam 3, tile radius 15, small all-seam

   in a 100 unit tile. Alicja moved the sliders to these numbers on
   2026-09-21 and said keep this one; markNumbers.test.ts pins them so a
   later edit has to mean it.

   The seam is the app's own, not a new one: black, on the outer side of
   every ring, every boundary including the sun's outside, which is what
   `border: 3px solid #000` with `box-sizing: border-box` draws in
   components.css. It is 3 units of 100 here against the app's 3px of 350, so
   it scales with the mark rather than staying 3px - at 16px a fixed seam
   would be most of the favicon.

   Nothing here imports $lib/motion, and nothing here emits an animation, a
   transition or a view-transition name. Alicja, 2026-09-21: "the logos ARE
   NOT SUPPOSED TO MOVE AT ALL". DIRECTION.md rule 8 carries it and
   markNumbers.test.ts asserts it against this file and Mark.svelte.

   An SVG string rather than markup, for the same reason icons.ts is one:
   two callers draw from it - Mark.svelte with `{@html}`, and
   scripts/render-mark.mjs, which writes every shipped icon file - and a
   string is the only shape where the file on disk and the mark on screen
   are provably the same drawing. */

import { ringRadii } from '../motion/flagSun.ts';

/** In a 100 unit tile. */
export const MARK_R = 100;
export const MARK_SEAM = 3;
export const MARK_TILE_RADIUS = 15;
export const MARK_TILE = '#FFFFFF';

/** The monochrome mark's ring count, fixed whatever the flag is: one colour
    has no bands to count, and fixing the count is what keeps the print
    header, the disguise fallback and a single-colour reproduction the same
    shape every time (ticket 38, round one's sub-decision, kept). */
export const MARK_MONO_RINGS = 4;

/** How the drawing is cropped, and therefore whether it carries a tile.

    The tile belongs to the icon, not to the app: `tile`, `round` and `bleed`
    are what a launcher, an install and a favicon show, because a home
    screen's ground is not ours. `bare` is what the app itself draws - no
    tile and no edge, so the mark sits on the screen's own surface rather
    than putting a white chip on every dark screen (DIRECTION rule 4). */
export type MarkCrop = 'tile' | 'round' | 'bleed' | 'bare';

export interface MarkOptions {
  /** One ink and four rings, drawn as outlines: the printed surfaces, the
      disguise fallback and any single-colour reproduction. The stripes are
      ignored when this is set. */
  ink?: string;
  /** The ground under the drawing. Defaults to the white tile for a cropped
      mark and to nothing for `bare`. */
  ground?: string | null;
  /** An accessible name. Omitted, the mark is decorative and hidden, which
      is what it is everywhere it sits beside the app's own name in type. */
  label?: string;
}

/** The rings, outermost first. Each radius is pulled in by half a seam
    because the stroke straddles the boundary, so the outermost ring's black
    edge lands exactly on the sun's outside rather than half outside it. */
function ringMarkup(stripes: string[], ink: string | undefined): string {
  const n = ink ? MARK_MONO_RINGS : stripes.length;
  return ringRadii(n, MARK_R)
    .map((radius, i) => {
      const r = (radius - MARK_SEAM / 2).toFixed(2);
      const paint = ink
        ? `fill="none" stroke="${ink}"`
        : `fill="${stripes[i]}" stroke="#000"`;
      return `<circle cx="${MARK_R}" cy="0" r="${r}" ${paint} stroke-width="${MARK_SEAM}"/>`;
    })
    .join('');
}

/** The crop, and the black line that follows it. A cropped mark's own
    outside edge is a stroke at the seam's weight, so every edge in the
    drawing including its outside is one line (Alicja: if the tile is white,
    it gets a stroke around the rounded square). It follows the crop shape
    rather than always being a rounded square, or a round launcher would cut
    the corners off a square outline.

    `bleed` has no edge at all: an adaptive icon's mask crops it off, so
    drawing one would only put a line inside the shape the mask makes. */
function cropMarkup(crop: MarkCrop): { clip: string; edge: string } {
  const inset = MARK_SEAM / 2;
  if (crop === 'round') {
    return {
      clip: `<circle cx="50" cy="50" r="50"/>`,
      edge: `<circle cx="50" cy="50" r="${(50 - inset).toFixed(2)}" fill="none" stroke="#000" stroke-width="${MARK_SEAM}"/>`
    };
  }
  const rx = crop === 'tile' ? MARK_TILE_RADIUS : 0;
  return {
    clip: `<rect width="100" height="100" rx="${rx}"/>`,
    edge:
      crop === 'tile'
        ? `<rect x="${inset}" y="${inset}" width="${100 - MARK_SEAM}" height="${100 - MARK_SEAM}"`
          + ` rx="${(MARK_TILE_RADIUS - inset).toFixed(2)}" fill="none" stroke="#000" stroke-width="${MARK_SEAM}"/>`
        : ''
  };
}

/** The whole mark as one SVG element. `size` is what the width and height
    attributes say; the drawing itself is always the same 100 unit tile. */
export function markSvg(
  stripes: string[],
  crop: MarkCrop,
  size: number | string,
  { ink, ground, label }: MarkOptions = {}
): string {
  const { clip, edge } = cropMarkup(crop);
  const fill = ground === undefined ? (crop === 'bare' ? null : MARK_TILE) : ground;
  const paper = fill === null ? '' : `<rect width="100" height="100" fill="${fill}"/>`;
  /* A clip id has to be unique in the document, and the app can show more
     than one mark at a time. Deriving it from the crop is enough: two marks
     of the same crop resolve to the same clip path, which is the same
     shape. */
  const clipId = `mark-${crop}`;
  const named = label === undefined ? `aria-hidden="true"` : `role="img" aria-label="${label}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"`
    + ` focusable="false" ${named}>`
    + `<defs><clipPath id="${clipId}">${clip}</clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${paper}${ringMarkup(stripes, ink)}${edge}</g></svg>`
  );
}
