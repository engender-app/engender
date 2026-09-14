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
  /* The old drawing's own proportions. Points rather than areas is what
     buys them back: two regions inside the head need 48px between their
     *dots*, not 48px of head each, and a button may run past the piece of
     the body its dot sits on. */
  { left: 39, top: 3, width: 22, height: 26, r: 11 }, // head
  { left: 45, top: 26, width: 10, height: 20, r: 5 }, // neck
  { left: 31, top: 44, width: 38, height: 58, r: 12 }, // torso
  { left: 17, top: 48, width: 12, height: 66, r: 6 }, // arms
  { left: 71, top: 48, width: 12, height: 66, r: 6 },
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

/** A point on the body, and the button around it.

    Points rather than areas (Alicja, 2026-09-14: "no areas, just points to
    click"). It is also the shape the app's other body map has always had -
    InjectionSiteMap draws twelve dots on a silhouette and shades each one by
    how long ago its site was used - so the two maps now differ only in the
    drawing under them, which is what the ticket asked for when it said to
    share the ramp and leave the artwork apart.

    The button is wider than it is tall because it can afford to be: every
    point sits on the midline, so nothing is beside it to collide with, and
    only the vertical gap has to hold the touch floor. */
export interface RegionPoint {
  region: string;
  /** Where the dots go, in figure units. More than one where the region is
      in more than one place on a body: `hands_feet` gets a foot each, which
      is what keeps it *on* the body - the old drawing put its single dot
      between the ankles, on nothing at all.

      A region in two places is still one region with one accessible name,
      so only the first of its points is a real button; the rest are
      aria-hidden and out of the tab order, so a screen reader hears one
      control while a finger can reach either. */
  points: { x: number; y: number }[];
}

/** How far apart two points must sit down the figure, in box units: one
    touch target at the smallest stage the component allows. */
export const POINT_GAP = 15;

/** The button's own size in box units, which is what MIN_STAGE is derived
    from. Wide and short, for the reason above. */
export const HIT_WIDTH = 30;
export const HIT_HEIGHT = 15;

/* Down the body, which is the reading order and the order the points arrive
   in. Each one sits on the part of the silhouette it names - the old
   drawing's table had `shoulders` on the left arm and `hands_feet` between
   the ankles, which is the defect this ticket exists to fix, so
   `bodyRegionFigure.test.ts` checks every point against the piece of the
   body it belongs to rather than against a coordinate somebody typed. */
export const REGION_POINTS: RegionPoint[] = [
  { region: 'hairline', points: [{ x: 50, y: 10 }] },
  { region: 'face_jaw', points: [{ x: 50, y: 25 }] },
  { region: 'voice_throat', points: [{ x: 50, y: 42 }] },
  { region: 'shoulders', points: [{ x: 50, y: 58 }] },
  { region: 'chest', points: [{ x: 50, y: 75 }] },
  { region: 'hips_waist', points: [{ x: 50, y: 92 }] },
  { region: 'genitals', points: [{ x: 50, y: 109 }] },
  { region: 'hands_feet', points: [{ x: 40, y: 152 }, { x: 60, y: 152 }] }
];

/** Which piece of the silhouette each point has to land on, by index into
    GROUND_SHAPES. The test reads this, so a point that drifts off its own
    body part fails rather than merely looking wrong. */
export const POINT_HOME: Record<string, number[]> = {
  hairline: [0],
  face_jaw: [0],
  voice_throat: [1],
  shoulders: [2],
  chest: [2],
  hips_waist: [2],
  genitals: [5],
  hands_feet: [8, 9]
};

/** The button around one dot. Narrowed where a region has two of them, so
    a pair side by side still cannot overlap each other. */
export function hitBox(at: { x: number; y: number }, of = 1): Box {
  const width = HIT_WIDTH / of;
  return { left: at.x - width / 2, top: at.y - HIT_HEIGHT / 2, width, height: HIT_HEIGHT };
}

/** Every button on the figure, in body order, with the region each belongs
    to and whether it is that region's real control. */
export function hitBoxes(): { region: string; box: Box; primary: boolean }[] {
  return REGION_POINTS.flatMap((point) =>
    point.points.map((at, i) => ({
      region: point.region,
      box: hitBox(at, point.points.length),
      primary: i === 0
    }))
  );
}

/** Where a tap means the whole body: the whole figure, underneath the
    points, so it is reached wherever none of them is.

    Its own drawing is the silhouette - `whole_body` is the body, which is
    literally what it means - and the dots sit on top of it. Tapping a dot
    selects that dot's region; tapping the body anywhere else selects the
    whole of it. That is the injection map's own arrangement and it needs no
    tiling: the eight only have to stay apart from each other. */
export const GROUND_ZONE: Box = {
  left: 0,
  top: 0,
  width: FIGURE_BOX.width,
  height: FIGURE_BOX.height
};

const POINT_BY_REGION = new Map(REGION_POINTS.map((point) => [point.region, point]));



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
const narrowestHit = Math.min(...REGION_POINTS.map((p) => HIT_WIDTH / p.points.length));
export const MIN_STAGE_WIDTH = Math.ceil((TOUCH_PX * FIGURE_BOX.width) / narrowestHit);
export const MIN_STAGE_HEIGHT = Math.ceil((TOUCH_PX * FIGURE_BOX.height) / HIT_HEIGHT);

/** What a box measures on a stage of this size, in CSS px. The test walks
    every button through it at `MIN_STAGE_WIDTH` x `MIN_STAGE_HEIGHT`, which
    is the smallest the component will ever let the stage be. */
export function zonePx(zone: Box, stageWidth: number, stageHeight: number): { w: number; h: number } {
  return {
    w: (zone.width / FIGURE_BOX.width) * stageWidth,
    h: (zone.height / FIGURE_BOX.height) * stageHeight
  };
}

export interface FigurePlacement {
  /** The regions with a point on the figure, in body order. A built-in
      somebody hid or deleted is simply absent; the rest keep their places,
      because where a point sits is what says which part of the body it is. */
  drawn: { point: RegionPoint; region: BodyRegion }[];
  ground: BodyRegion | null;
  /** Everything with nowhere on the figure: `body_facial_hair`, which has no
      one place on a body, and every region somebody added themselves. */
  elsewhere: BodyRegion[];
}

export function placeRegions(regions: BodyRegion[]): FigurePlacement {
  const byId = new Map(regions.map((region) => [region.id, region]));
  return {
    drawn: REGION_POINTS.flatMap((point) => {
      const region = byId.get(point.region);
      return region ? [{ point, region }] : [];
    }),
    ground: byId.get(GROUND_REGION) ?? null,
    elsewhere: regions.filter(
      (region) => region.id !== GROUND_REGION && !POINT_BY_REGION.has(region.id)
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

/** Where a point's mixed mark goes: beside the dot rather than on it.

    On it there is nowhere to put two bars that a 22px dot can hold, and the
    dot's own fill runs the whole ramp underneath them. Beside it the mark
    sits on the body, whose colour does not move, so it reads the same at
    every step. */
export function markAt(at: { x: number; y: number }): { x: number; y: number } {
  return { x: at.x + 5.5, y: at.y - 6 };
}
