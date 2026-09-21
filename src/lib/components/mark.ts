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
   2026-09-21 and said keep this one; mark.test.ts pins them so a
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
   mark.test.ts asserts it against this file and Mark.svelte.

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

/** How big the tile is inside a full-bleed canvas a launcher will mask.

    The black edge is not optional (Alicja, 2026-09-21: "no stroke around the
    square, or its white - its supposed to be black always"), and a launcher
    picks its own mask, so the only way the edge always survives is to put the
    whole stroked tile inside the region every mask keeps.

    Android guarantees the central 72dp circle of the 108dp canvas, which is
    radius 33.33 in these 100 units. A rounded square of half-side `a` with
    corner radius `0.3a` reaches `sqrt(2)(a - 0.3a) + 0.3a`, or `1.29a`, from
    the middle, so `a` has to be at most 25.8. 25 clears it, and a 50 unit
    tile is a round number to hold. The web's maskable safe zone is the
    central 80%, which this is well inside, so one drawing serves both.

    What it costs, and it is the trade: the sun is half the size it is on the
    tile whose own corner it is anchored to, with white around it. */
export const MARK_SAFE_TILE = 50;

/** How the drawing is cropped, and therefore whether it carries a tile.

    `tile` is the mark with its white ground and its black edge: a launcher,
    an install, a favicon, and About, where what the app is showing is its
    own icon beside its own name. This is Alicja's rule and it has no
    exception - "its supposed to be black always" - so anywhere the drawing
    has an outside, that outside is one black line.

    `bare` is the drawing with no ground and no edge at all, which is what
    the printed surfaces take: one ink on paper, where a square around it
    would be a second thing to reproduce.

    `bleed` is a mask's canvas rather than a crop of its own: the ground runs
    to all four corners, because a mask cuts its shape out of whatever it is
    given, and the tile sits in the middle at `MARK_SAFE_TILE`. */
export type MarkCrop = 'tile' | 'round' | 'bleed' | 'bare';

export interface MarkOptions {
  /** One ink and four rings, drawn as outlines: the printed surfaces, the
      disguise fallback and any single-colour reproduction. The stripes are
      ignored when this is set. */
  ink?: string;
  /** The ground under the drawing. Defaults to the white tile for a cropped
      mark and to nothing for `bare`. */
  ground?: string | null;
  /** The clip path's id, for the two crops that need one. Defaults to the
      crop's own name, which is unique in a file that holds one mark; a
      screen that draws one passes an id of its own, because a document can
      hold more than one element and two of the same id is not valid. */
  id?: string;
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

    `bleed` is not asked here. It carries a tile, and it is the `tile` one,
    laid inside the canvas at MARK_SAFE_TILE. */
function cropMarkup(crop: 'tile' | 'round' | 'bare'): { clip: string; edge: string } {
  const inset = MARK_SEAM / 2;
  if (crop === 'round') {
    return {
      clip: `<circle cx="50" cy="50" r="50"/>`,
      edge: `<circle cx="50" cy="50" r="${(50 - inset).toFixed(2)}" fill="none" stroke="#000" stroke-width="${MARK_SEAM}"/>`
    };
  }
  if (crop === 'tile') {
    return {
      clip: `<rect width="100" height="100" rx="${MARK_TILE_RADIUS}"/>`,
      edge:
        `<rect x="${inset}" y="${inset}" width="${100 - MARK_SEAM}" height="${100 - MARK_SEAM}"`
        + ` rx="${(MARK_TILE_RADIUS - inset).toFixed(2)}" fill="none" stroke="#000" stroke-width="${MARK_SEAM}"/>`
    };
  }
  /* `bare` needs no clip path at all: it crops to the square the viewBox
     already is, and an SVG viewport clips to itself. Saying so is worth a
     branch rather than a `rx="0"` rect, because a clip path needs an id, an
     id has to be unique in a document, and `bare` is the only crop the app
     ever draws - so the app emits no id and two marks on one screen cannot
     collide. The cropped forms are files, one mark each. */
  return { clip: '', edge: '' };
}

/** The whole mark as one SVG element. `size` is what the width and height
    attributes say; the drawing itself is always the same 100 unit tile. */
export function markSvg(
  stripes: string[],
  crop: MarkCrop,
  size: number | string,
  { ink, ground, id, label }: MarkOptions = {}
): string {
  const named = label === undefined ? `aria-hidden="true"` : `role="img" aria-label="${label}"`;
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

  const { clip, edge } = cropMarkup(crop);
  const fill = ground === undefined ? (crop === 'bare' ? null : MARK_TILE) : ground;
  const paper = fill === null ? '' : `<rect width="100" height="100" fill="${fill}"/>`;
  const drawing = `${paper}${ringMarkup(stripes, ink)}${edge}`;
  /* The crop's own name is right for a file, which holds one mark. A screen
     can hold more than one element, so Mark.svelte mints its own. */
  const clipId = id ?? `mark-${crop}`;
  const clipped = clip
    ? `<defs><clipPath id="${clipId}">${clip}</clipPath></defs>`
      + `<g clip-path="url(#${clipId})">${drawing}</g>`
    : drawing;
  return `${open}${clipped}</svg>`;
}
