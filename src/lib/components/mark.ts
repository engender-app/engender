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

/** What shape the mark is cropped to. Every one of them has an edge:
    Alicja, 2026-09-21, and it is the whole rule - *"THE STROKE IS AN
    INTEGRAL PART OF THE LOGO! THERE IS NO LOGO WITHOUT THE STROKE!"* There
    is no variant without one, which is why there is no `bare` here: a mark
    on a screen, a mark on paper and a mark in one ink are all the same
    drawing, and the square around it is part of that drawing rather than a
    frame put round it afterwards.

    `tile` is the mark: rounded square, ground, edge. A launcher, an
    install, a favicon, About, and both printed pages.

    `round` is the same under a circle crop, with the edge following the
    circle - a square outline under a round mask would lose its corners.

    `bleed` is a mask's canvas rather than a crop of its own: the ground runs
    to all four corners, because a mask cuts its shape out of whatever it is
    given, and the tile sits in the middle at `MARK_SAFE_TILE`. */
export type MarkCrop = 'tile' | 'round' | 'bleed';

export interface MarkOptions {
  /** One ink and four rings, drawn as outlines, the edge included: the
      printed surfaces, the disguise fallback and any single-colour
      reproduction. The stripes are ignored when this is set, and so is the
      ground - paper is the ground there. */
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
function ringMarkup(stripes: string[], ink: string | undefined): string {
  const n = ink ? MARK_MONO_RINGS : stripes.length;
  return ringRadii(n, MARK_R)
    .map((radius, i) => {
      const r = (radius - MARK_SEAM / 2).toFixed(2);
      const paint = ink
        ? `fill="none" stroke="${ink}"`
        : `fill="${hexColor(stripes[i])}" stroke="#000"`;
      return `<circle cx="${MARK_R}" cy="0" r="${r}" ${paint} stroke-width="${MARK_SEAM}"/>`;
    })
    .join('');
}

/** The crop, and the line that follows it. A cropped mark's own outside
    edge is a stroke at the seam's weight, so every edge in the drawing
    including its outside is one line. It follows the crop shape rather than
    always being a rounded square, or a round crop would cut the corners off
    a square outline.

    **The clip stops half a seam short of the silhouette, and the edge is
    drawn outside it.** This is the arrangement, and the obvious one is
    wrong: clip everything to the silhouette and stroke the edge inside that
    clip, and the mark grows a pale halo that gathers at the corners
    (Alicja, 2026-09-21, on a 48px render: "why the fuck is there this small
    white glitch around the corners? this is supposed to be pixel perfect").

    The cause is compositing. Chromium antialiases a clip path per element
    rather than over a flattened group, so the white ground keeps a boundary
    of its own at the silhouette no matter what is stroked on top of it
    inside the same clip - partial coverage of white plus partial coverage
    of ink does not add up to ink. Measured at 512px on a dark page, the
    pixel across the corner came out at rgb(58,87,99) against a ground of
    rgb(34,37,44): lighter than the page, which composited ink can never be.

    So: the clip is the crop path inset by half a seam, which is where the
    edge's own centre line runs, and the edge is stroked on that same path
    with nothing clipping it. The stroke's inner half then covers the
    clipped content's boundary at full opacity, and its outer half is the
    silhouette - one antialiased boundary in the whole drawing, which is
    what "pixel perfect" means here. tests/mark-edge-fringe.mjs walks out of
    the mark at four sizes and fails on anything brighter than the page.

    `bleed` is not asked here. It carries a tile, and it is the `tile` one,
    laid inside the canvas at MARK_SAFE_TILE. */
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
  const { clip, edge } = cropMarkup(crop, ink ?? '#000');
  const fill = ground === undefined ? (ink ? null : MARK_TILE) : ground;
  const paper = fill === null ? '' : `<rect width="100" height="100" fill="${fill}"/>`;
  const drawing = `${paper}${ringMarkup(stripes, ink)}`;
  /* The crop's own name is right for a file, which holds one mark. A screen
     can hold more than one element, so Mark.svelte mints its own. */
  const clipId = id ?? `mark-${crop}`;
  return (
    `${open}<defs><clipPath id="${clipId}">${clip}</clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${drawing}</g>${edge}</svg>`
  );
}
