/* The body map's drawing and its hit zones (phase 10 redesign ticket 40).

   Beside BodyRegionMap.svelte for the same reason injectionSiteMap.ts sits
   beside the injection map: the arrangement makes claims a component's
   <style> block is not somewhere a test can ask about. No two zones may
   overlap, or a tap lands on two regions at once; no zone may be under the
   touch floor at the smallest stage the app can give it; and every shape a
   person can see has to sit inside a zone that selects the region it belongs
   to, or the figure shows one thing and answers with another.

   **Neutral means the outline is neutral, not that there is no outline.**
   The ticket's own wording went further than that - "there is no body
   outline, so there is no contour to carry a waist, a bust or a set of
   hips" - and a figure built to the letter of it was eight rounded
   rectangles in a column that read as a form rather than a body (Alicja,
   2026-09-14: "why is there no body? ... the previous version was much
   better", then "I didn't mean that there should be no outline, just that
   the outline has to be neutral, not gendered"). So the body is drawn, and
   the neutrality is carried by how it is drawn rather than by its absence:
   the torso is a **constant-width column** from the shoulders to the hips,
   so there is no waist to pull in, no bust to push out and no hips to
   flare. The head, the arms and the legs are plain rounded forms. Nothing
   in the silhouette says which body this is, and `TORSO_IS_A_COLUMN` in the
   test holds that.

   `whole_body` is that silhouette. It is not decoration under the regions -
   it is a region, it carries its own reading as a fill, and it takes a tap
   wherever the eight are not: beside the head, along the arms, beside the
   legs. That is what "the ground the other eight sit on" means, and it is
   why this replaces HOTSPOTS rather than moving its numbers. A hotspot was
   a dot over a drawing with no matching part; these are the parts. */

import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '../data/bodyMap';
import type { RegionSideReading } from '../data/bodyMap';
import { heatLevel } from '../data/metricRange';
import type { BodyRegion } from '../data/types';

/** The drawing's own coordinate space, which is also the SVG's viewBox.
    Taller than wide, because a body is. */
export const FIGURE_BOX = { width: 100, height: 164 } as const;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rounded rectangle. Everything here is one of these, the silhouette
    included - a circle is a rect whose radius is half its side, and an egg
    is one whose two radii differ - so the geometry stays checkable with one
    set of helpers. */
export interface Shape extends Box {
  r: number;
  /** The vertical radius, where it differs from `r`. */
  ry?: number;
  /** Path data, for the two shapes a rounded rectangle cannot be: the
      mannequin's head is an egg split across two regions, so its halves are
      a dome and a jaw - each rounded on one side and flat on the other,
      which `rect` has no way to say. The box above stays the shape's
      bounding box either way, so every geometry test reads the same thing
      whichever way a shape is drawn. */
  d?: string;
}

export const GROUND_REGION = 'whole_body';

/* The silhouette: a wooden artist's mannequin, the kind sold for learning
   proportions (Alicja's reference, 2026-09-14, after the first two attempts
   at this).

   It is the right answer to "neutral but still a body" because it is
   already the answer the world uses. A mannequin is a body everybody reads
   as a body and nobody reads as a particular one - it has no face, no hair,
   no skin and no sex characteristics, and that is not an omission somebody
   has to notice and approve, it is what the object is for. Drawing one
   costs no neutrality argument at all.

   It also segments itself. A mannequin is blocks and ball joints, and the
   seams fall almost exactly where this screen's regions do: a head above a
   neck, a ribcage above a waist ball above a pelvis, paddles at the ends of
   the limbs. So the regions are not shapes laid over a drawing - they are
   the drawing's own parts, which is what the ticket asked for by a
   different route. What is left for `whole_body` is the connective
   mannequin: the upper arms and forearms, the thighs and shins, and the
   ball joints between them.

   Neutrality still gets a rule rather than a promise. The ribcage and the
   pelvis are both drawn at one constant width and mirrored about the
   midline, so neither can pull in at a waist, swell at a bust or flare at a
   hip; `TORSO` names the ribcage and the test reads it. */
export const GROUND_SHAPES: Shape[] = [
  // Left arm: upper, elbow ball, forearm. Hanging close to the trunk, the
  // way a mannequin stands when nobody has posed it.
  { left: 23, top: 64, width: 10, height: 20, r: 5 },
  { left: 22, top: 81, width: 12, height: 12, r: 6 },
  { left: 23.5, top: 90, width: 9, height: 18, r: 4.5 },
  // Right arm, mirrored.
  { left: 67, top: 64, width: 10, height: 20, r: 5 },
  { left: 66, top: 81, width: 12, height: 12, r: 6 },
  { left: 67.5, top: 90, width: 9, height: 18, r: 4.5 },
  // Left leg: hip ball, thigh, knee ball, shin.
  { left: 36, top: 103, width: 12, height: 12, r: 6 },
  { left: 37, top: 111, width: 10, height: 20, r: 5 },
  { left: 36, top: 128, width: 12, height: 12, r: 6 },
  { left: 37.5, top: 137, width: 9, height: 16, r: 4.5 },
  // Right leg, mirrored.
  { left: 52, top: 103, width: 12, height: 12, r: 6 },
  { left: 53, top: 111, width: 10, height: 20, r: 5 },
  { left: 52, top: 128, width: 12, height: 12, r: 6 },
  { left: 53.5, top: 137, width: 9, height: 16, r: 4.5 }
];

/** The ribcage and the pelvis: the two pieces the neutrality rule is
    actually about, named rather than indexed so the test says what it is
    checking. Both are drawn at one width and mirrored about the midline. */
export const TORSO = { left: 32, top: 69, width: 36, height: 17, r: 6 } as const;
export const PELVIS = { left: 34, top: 93, width: 32, height: 11, r: 5 } as const;

export interface RegionDrawing {
  region: string;
  /** What is drawn for this region, on the silhouette. More than one shape
      where the region is in more than one place - hands and feet are four. */
  shapes: Shape[];
  /** Where a tap selects it. More than one box for the same reason, and
      never overlapping another region's. */
  zones: Box[];
}

/* Down the body, which is the reading order and the order the parts arrive
   in. The zones tile the stage in bands; the drawing sits inside them.

   Each region is a piece of the mannequin rather than a block on top of
   one. The head is one egg split at a seam, the way the mannequin's own
   joints are seams: a dome above and a jaw below. The shoulders are the two
   ball joints plus the yoke they hang from. `hips_waist` is the waist ball
   and the pelvis together, because on a mannequin they are one movement.

   `hands_feet` is four paddles and three zones: a hand at the end of each
   forearm, and the feet, which share a band because nothing else is down
   there. A region in two places on a body is still one region with one
   accessible name, so only the first of its zones is a real button - the
   rest are aria-hidden and out of the tab order, so a screen reader hears
   one control while a finger can reach either end. */
export const REGION_DRAWINGS: RegionDrawing[] = [
  {
    /* The cranium: the top of the egg. Narrow, because a mannequin's head
       is taller than it is wide - the first pass drew each half at the full
       width its band allowed and got two flat discs rather than a head. */
    region: 'hairline',
    shapes: [{ left: 41, top: 3, width: 18, height: 17, r: 9, d: 'M41 20 A9 17 0 0 1 59 20 Z' }],
    zones: [{ left: 25, top: 0, width: 50, height: 20 }]
  },
  {
    // The jaw: the bottom of the egg, a shade narrower. The two together are
    // a mannequin head, and the line between them is a seam like every other
    // seam on one.
    region: 'face_jaw',
    shapes: [{ left: 42, top: 20, width: 16, height: 16, r: 8, d: 'M42 20 A8 16 0 0 0 58 20 Z' }],
    zones: [{ left: 25, top: 20, width: 50, height: 17 }]
  },
  {
    // The neck, which on a mannequin is a short post between two joints.
    region: 'voice_throat',
    shapes: [{ left: 45, top: 37, width: 10, height: 13, r: 4 }],
    zones: [{ left: 25, top: 37, width: 50, height: 15 }]
  },
  {
    /* Both ball joints and the yoke between them: a shoulder is the join and
       not a piece of the trunk, which is exactly how a mannequin is built. */
    region: 'shoulders',
    shapes: [
      { left: 21, top: 53, width: 15, height: 15, r: 7.5 },
      { left: 64, top: 53, width: 15, height: 15, r: 7.5 },
      { left: 35, top: 54, width: 30, height: 12, r: 5 }
    ],
    zones: [{ left: 0, top: 52, width: 100, height: 16 }]
  },
  {
    region: 'chest',
    shapes: [TORSO],
    zones: [{ left: 32, top: 68, width: 36, height: 19 }]
  },
  {
    // The waist ball and the pelvis block, which move as one.
    region: 'hips_waist',
    shapes: [{ left: 44, top: 87, width: 12, height: 11, r: 5.5 }, PELVIS],
    zones: [{ left: 32, top: 87, width: 36, height: 17 }]
  },
  {
    region: 'genitals',
    shapes: [{ left: 43, top: 105, width: 14, height: 11, r: 5 }],
    zones: [{ left: 36, top: 104, width: 28, height: 16 }]
  },
  {
    // The paddles: one at the end of each forearm, one at the end of each
    // shin, each overlapping the limb it belongs to so the figure is jointed
    // rather than scattered.
    region: 'hands_feet',
    shapes: [
      { left: 22, top: 105, width: 12, height: 12, r: 5.5 },
      { left: 66, top: 105, width: 12, height: 12, r: 5.5 },
      { left: 35, top: 150, width: 14, height: 11, r: 4 },
      { left: 51, top: 150, width: 14, height: 11, r: 4 }
    ],
    zones: [
      { left: 0, top: 144, width: 100, height: 20 },
      { left: 0, top: 104, width: 36, height: 16 },
      { left: 64, top: 104, width: 36, height: 16 }
    ]
  }
];


/** Where a tap means the whole body: everywhere the eight are not. Beside
    the head, along the arms, beside the legs.

    Its own drawing is the silhouette, which runs under the eight rather
    than inside these, so the ground is the one region whose shapes do not
    sit in its own zones - the "tap what you see" test exempts it by name.
    Tapping the middle of the torso selects whichever region is drawn there,
    which is the right answer: that is a chest, and it is also the whole
    body, and the more specific of the two is what somebody aimed at. */
export const GROUND_ZONES: Box[] = [
  // Beside the head and the neck.
  { left: 0, top: 0, width: 25, height: 52 },
  { left: 75, top: 0, width: 25, height: 52 },
  // Beside the trunk, which is where the arms hang.
  { left: 0, top: 68, width: 32, height: 36 },
  { left: 68, top: 68, width: 32, height: 36 },
  /* The legs, which are the mannequin's own and not a named region: the
     band between the hips and the feet. */
  { left: 0, top: 120, width: 100, height: 24 }
];

const DRAWING_BY_REGION = new Map(REGION_DRAWINGS.map((drawing) => [drawing.region, drawing]));

const ALL_ZONES = [...REGION_DRAWINGS.flatMap((d) => d.zones), ...GROUND_ZONES];

/** `--touch-target`, which is Android's 48dp floor and the stricter of the
    two platforms this ships on. */
export const TOUCH_PX = 48;

/* The stage cannot be given a fixed size and then assumed, which is exactly
   the bug the review's browser pass found: the module claimed a 320px stage
   and the card's own padding rendered it at 314, so all eight buttons came
   out 47.09px - every one of them under the floor, by the same 2%, because
   a zone is a percentage of whatever the stage turned out to be.

   So the floor is derived from the zones instead. The narrowest zone is
   `n` box units of 100 across, so the stage must be at least 48 * 100 / n
   wide for that zone to be 48px; the shortest is the same sum down. The
   component puts both on the stage as a `min-width` and a `min-height`, and
   the stage grows past its aspect ratio rather than shrinking a target. */
const narrowest = Math.min(...ALL_ZONES.map((zone) => zone.width));
const shortest = Math.min(...ALL_ZONES.map((zone) => zone.height));

export const MIN_STAGE_WIDTH = Math.ceil((TOUCH_PX * FIGURE_BOX.width) / narrowest);
export const MIN_STAGE_HEIGHT = Math.ceil((TOUCH_PX * FIGURE_BOX.height) / shortest);

/** What a zone measures on a stage of this size, in CSS px. The test walks
    every zone through it at `MIN_STAGE_WIDTH` x `MIN_STAGE_HEIGHT`, which is
    the smallest the component will ever let the stage be. */
export function zonePx(zone: Box, stageWidth: number, stageHeight: number): { w: number; h: number } {
  return {
    w: (zone.width / FIGURE_BOX.width) * stageWidth,
    h: (zone.height / FIGURE_BOX.height) * stageHeight
  };
}

export interface FigurePlacement {
  /** The regions with a place on the figure, in body order. A built-in
      somebody hid or deleted is simply absent; the rest keep their places,
      because where a shape is drawn is what says which part of the body it
      is. */
  drawn: { drawing: RegionDrawing; region: BodyRegion }[];
  ground: BodyRegion | null;
  /** Everything with nowhere on the figure: `body_facial_hair`, which has no
      one place on a body, and every region somebody added themselves. */
  elsewhere: BodyRegion[];
}

export function placeRegions(regions: BodyRegion[]): FigurePlacement {
  const byId = new Map(regions.map((region) => [region.id, region]));
  return {
    drawn: REGION_DRAWINGS.flatMap((drawing) => {
      const region = byId.get(drawing.region);
      return region ? [{ drawing, region }] : [];
    }),
    ground: byId.get(GROUND_REGION) ?? null,
    elsewhere: regions.filter(
      (region) => region.id !== GROUND_REGION && !DRAWING_BY_REGION.has(region.id)
    )
  };
}

/** Which step of the role's heat ramp a region's reading paints (roles.ts
    builds one per stripe, and kit-roles.test.ts holds every step's ink to
    4.5:1 against its own fill).

    The app's own intensity ramp, reused rather than invented: a calendar
    cell, a week cell, an injection dot and a body region now shade one
    reading the same way and only the hue differs. Level 0 is a region with
    no readings in the range, drawn as an outline and no fill - neither a
    large number nor zero reads as "never". */
export function fillLevel(reading: RegionSideReading | null | undefined): number {
  if (!reading || reading.value === null) return 0;
  return heatLevel(reading.value, { min: BODY_REGION_INTENSITY_MIN, max: BODY_REGION_INTENSITY_MAX });
}

/** A box as the four percentages that place an element over the stage. */
export function boxStyle(box: Box): string {
  const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;
  return [
    `left:${pct(box.left, FIGURE_BOX.width)}`,
    `top:${pct(box.top, FIGURE_BOX.height)}`,
    `width:${pct(box.width, FIGURE_BOX.width)}`,
    `height:${pct(box.height, FIGURE_BOX.height)}`
  ].join(';');
}

/** Whether two boxes share any area. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/** Whether `inner` lies wholly within `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  );
}

/** Where a region's mixed mark goes: just inside the top-right corner of its
    largest shape, which is the one the eye lands on where a region is drawn
    in more than one place. */
export function markAt(drawing: RegionDrawing): { x: number; y: number } {
  const biggest = drawing.shapes.reduce((best, shape) =>
    shape.width * shape.height > best.width * best.height ? shape : best
  );
  return { x: biggest.left + biggest.width - 5.4, y: biggest.top + 1.8 };
}
