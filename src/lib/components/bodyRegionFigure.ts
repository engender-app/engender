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
}

export const GROUND_REGION = 'whole_body';

/* The silhouette, which is the one this screen has always had: a head, a
   torso, two arms, a pelvis, two thighs and two shins, in soft rounded
   forms (Alicja picked it back out of the before/after on 2026-09-14,
   after a mannequin and after a column of blocks).

   Kept in its own vocabulary rather than redrawn - the same shapes in the
   same proportions the old figure used - and re-sized for one reason: three
   regions stack inside the head and neck and each of them owes a finger
   48px, which the old head at r11 could not give. Everything the ticket
   changed is what happens *on* the body, not the body.

   Neutrality is carried the way Alicja stated it: the outline has to be
   neutral, not gendered. So the torso is one width from the shoulders down,
   the pelvis is never wider than it - the old drawing had it 2 units wider,
   which is a hip flare, small but there - and every piece is mirrored about
   the midline. All three are tests. */
export const GROUND_SHAPES: Shape[] = [
  /* The head is narrow and tall rather than round, which is the one place
     this drawing departs from the old one's proportions and is forced
     rather than chosen: `hairline` and `face_jaw` stack inside it and each
     owes a finger 48px, so the head cannot be shorter than two touch bands
     however small a head would look. Narrow keeps it from reading as an
     oval balanced on a body. */
  { left: 39, top: 2, width: 22, height: 36, r: 11 }, // head
  { left: 45, top: 34, width: 10, height: 14, r: 5 }, // neck
  { left: 31, top: 50, width: 38, height: 52, r: 12 }, // torso
  { left: 17, top: 54, width: 12, height: 60, r: 6 }, // arms
  { left: 71, top: 54, width: 12, height: 60, r: 6 },
  { left: 31, top: 99, width: 38, height: 16, r: 8 }, // pelvis
  { left: 33, top: 113, width: 14, height: 32, r: 7 }, // thighs
  { left: 53, top: 113, width: 14, height: 32, r: 7 },
  { left: 34, top: 142, width: 12, height: 20, r: 6 }, // shins
  { left: 54, top: 142, width: 12, height: 20, r: 6 }
];

/** The torso and the pelvis: the two pieces the neutrality rule is actually
    about, named rather than indexed so the test says what it is checking.
    Both are drawn at one width, the pelvis is never the wider of the two,
    and both are mirrored about the midline. */
export const TORSO = GROUND_SHAPES[2];
export const PELVIS = GROUND_SHAPES[5];

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
    region: 'hairline',
    shapes: [{ left: 42, top: 4, width: 16, height: 12, r: 5 }],
    zones: [{ left: 25, top: 0, width: 50, height: 20 }]
  },
  {
    region: 'face_jaw',
    shapes: [{ left: 41, top: 22, width: 18, height: 13, r: 5 }],
    zones: [{ left: 25, top: 20, width: 50, height: 17 }]
  },
  {
    region: 'voice_throat',
    shapes: [{ left: 45.5, top: 38, width: 9, height: 10, r: 4 }],
    zones: [{ left: 25, top: 37, width: 50, height: 15 }]
  },
  {
    // Across the torso's top and over both arms: a shoulder is the join.
    region: 'shoulders',
    shapes: [{ left: 24, top: 55, width: 52, height: 10, r: 4 }],
    zones: [{ left: 0, top: 52, width: 100, height: 16 }]
  },
  {
    region: 'chest',
    shapes: [{ left: 35, top: 70, width: 30, height: 15, r: 6 }],
    zones: [{ left: 32, top: 68, width: 36, height: 19 }]
  },
  {
    region: 'hips_waist',
    shapes: [{ left: 35, top: 89, width: 30, height: 13, r: 6 }],
    zones: [{ left: 32, top: 87, width: 36, height: 17 }]
  },
  {
    region: 'genitals',
    shapes: [{ left: 42, top: 106, width: 16, height: 12, r: 5 }],
    zones: [{ left: 36, top: 104, width: 28, height: 16 }]
  },
  {
    // One at the end of each arm and one at the end of each leg, each
    // overlapping the limb it belongs to.
    region: 'hands_feet',
    shapes: [
      { left: 18, top: 106, width: 10, height: 12, r: 5 },
      { left: 72, top: 106, width: 10, height: 12, r: 5 },
      { left: 33, top: 149, width: 14, height: 10, r: 4 },
      { left: 53, top: 149, width: 14, height: 10, r: 4 }
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
