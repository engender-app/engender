/* The five mood faces have to be telling apart at the smallest size any
   surface draws them (phase 5 ticket 31, redrawn in phase 10 ticket 27).

   28px is that size now - an entry inside a day card - but the drawing was
   settled against the 22 an entry drew at until Alicja called the marks on
   Home too small, so the margin below is the one that harder size needed and
   every shipped size clears it. At 22px one user unit of the 24 box is 0.92
   of a pixel. That number is the whole reason this test
   exists: the five mouths used to be five depths of one arc, 1.0 to 1.4 units
   between neighbours, so steps 1 and 2 were about a pixel apart and so were
   4 and 5. Side by side you could nearly pick them out; alone on an entry,
   which is how they actually appear, you could not.

   The rule the drawing answers to, and what each half is for:

   - Neighbouring steps differ by at least 2 units of mouth depth, OR by the
     direction the mouth curves. A change of direction is categorical and
     needs no size to read at all, which is what carries 2-3 and 3-4; a
     change of depth needs to be big, which is what carries 1-2 and 4-5.
   - The two ends of the ramp draw lids instead of dots. That is a second,
     independent channel on exactly the pairs that have only depth to go on,
     and a change of shape rather than of dimension - the only kind that
     survives being scaled down this far.
   - Every mark is a filled shape. Ticket 27's redrawing took the last
     strokes out of the face: a 1.6-unit stroke is 1.5px at 22 and it went
     grey and thin next to the disc's own hairline, where a filled lens keeps
     its silhouette at any size. Depth is therefore measured on the shape's
     midline rather than on its outline, which is what `depth` below is for -
     the outline of a lens runs down one edge and back up the other, so the
     naive apex of a flat mouth is its own bottom edge.
   - Nothing leaves the disc, so no face is ever clipped by the circle it
     sits in. The margin is 0.8 units of air inside the disc's edge, which is
     what the old stroke's outer edge used to spend; the fill keeps it as
     air, and the last test below holds the stylesheet to it: put a stroke
     back on any mark and the margin is no longer the whole story. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOOD_CHEEK_RADIUS, MOOD_CHEEKS, MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from '../src/lib/components/moodFace';
import { GAZE_REACH } from '../src/lib/motion/magnifier';
import { inkPolylines } from './icon-ink';

const STEPS = [1, 2, 3, 4, 5];

/** 0.8 units of air between the ink and the disc's own edge. */
const REACH = 10 - 0.8;

const componentsCss = readFileSync(join(import.meta.dirname, '../src/lib/styles/components.css'), 'utf8');

/** How far the eyes are actually moved, in user units, read off the stylesheet
    rather than restated here - the numbers that decide whether a face gets
    turned out of its own disc live in `face-glance` and in `.mood-face-gaze`,
    and a test that named them again would pass while the drawing broke.

    The two stack: the gaze group and the glance group are nested, so a face
    being told to look hard right while its own glance is already there is the
    worst case the disc has to survive. */
function eyeTravel(): { x: number; y: number } {
  const glance = /@keyframes face-glance\s*\{([\s\S]*?)\n\}/.exec(componentsCss);
  expect(glance, 'face-glance is gone or renamed, so this test is measuring nothing').toBeTruthy();

  /* Each `translate:` in the keyframes is either `0 0` or
     `calc(<dir> * <reach> [* <factor>]) <y>px`. */
  let glanceX = 0;
  let glanceY = 0;
  for (const [, body, y] of glance![1].matchAll(/translate:\s*(calc\([^)]*\)[^;]*?|0)\s+(-?[\d.]+)(?:px)?\s*;/g)) {
    const factor = /\*\s*(-?[\d.]+)\s*\)?\s*$/.exec(body.replace(/var\([^)]*\)/g, 'V'));
    glanceX = Math.max(glanceX, body === '0' ? 0 : Math.abs(factor ? parseFloat(factor[1]) : 1) * GAZE_REACH);
    glanceY = Math.max(glanceY, Math.abs(parseFloat(y)));
  }
  expect(glanceX, 'no glance travel parsed out of face-glance').toBeGreaterThan(0);
  return { x: GAZE_REACH + glanceX, y: glanceY };
}

/** Every point of a drawing's outline, flattened. */
function points(d: string): { x: number; y: number }[] {
  return inkPolylines(`<path d="${d}"/>`).flat();
}

/** The midline of a lens: its two edges folded back onto each other, so the
    outline collapses into the one curve the mouth is read as.

    The fold is by position along the outline rather than by x. A lens is one
    closed path - out along the upper edge, back along the lower - and both
    edges are flattened into the same number of steps from the same pair of
    corners, so the point i steps out from the start and the point i steps
    back from the end are the two edges at one x. Bucketing by x instead
    lands an odd number of samples in the end columns and reads a flat mouth
    as a curved one. */
function midline(d: string): { x: number; y: number }[] {
  const outline = points(d);
  /* Z brings the pen back to the corner it started at. */
  const edges = outline.filter(
    (p, i) => i === 0 || Math.hypot(p.x - outline[0].x, p.y - outline[0].y) > 1e-9
  );
  return edges.slice(0, Math.ceil(edges.length / 2)).map((p, i) => {
    const mirror = edges[edges.length - 1 - i];
    return { x: (p.x + mirror.x) / 2, y: (p.y + mirror.y) / 2 };
  });
}

/** How far the middle of the mouth sits from its corners, signed: positive
    curves down into a smile, negative up into a frown, zero is the flat one. */
function depth(step: number): number {
  const outline = points(MOOD_FACES[step].mouth);
  /* The corners are drawn points, so they are read off the outline itself
     rather than off the fold, which averages its own end pair half a
     flattening step short of them. */
  const left = outline.reduce((a, b) => (a.x < b.x ? a : b));
  const right = outline.reduce((a, b) => (a.x > b.x ? a : b));
  const line = midline(MOOD_FACES[step].mouth);
  const apex = line.reduce((a, b) => (Math.abs(a.x - 12) < Math.abs(b.x - 12) ? a : b));
  return apex.y - (left.y + right.y) / 2;
}

/** Anything under a twentieth of a unit is the flat mouth: 0.05px at 22px,
    and the flattening's own residual at the apex is a tenth of that. */
const FLAT = 0.05;

/** Which way a mouth curves: -1 frown, 0 flat, 1 smile. */
function direction(step: number): number {
  const d = depth(step);
  return Math.abs(d) < FLAT ? 0 : Math.sign(d);
}

/** Every filled mark a step draws, as one markup string. */
function ink(step: number): string {
  const face = MOOD_FACES[step];
  return [
    `<path d="${face.mouth}"/>`,
    face.lids ? `<path d="${face.lids}"/>` : '',
    ...(face.cheeks ? MOOD_CHEEKS.map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${MOOD_CHEEK_RADIUS}"/>`) : [])
  ].join('');
}

describe('the five mood faces', () => {
  it('draws one for every step of the ramp', () => {
    expect(Object.keys(MOOD_FACES).map(Number).sort()).toEqual(STEPS);
  });

  it('runs frown to smile through flat', () => {
    expect(STEPS.map(direction)).toEqual([-1, -1, 0, 1, 1]);
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5]
  ])('tells step %i from step %i by depth or by direction', (a, b) => {
    const from = depth(a);
    const to = depth(b);
    const turned = direction(a) !== direction(b);
    expect(
      turned || Math.abs(to - from) >= 2,
      `steps ${a} and ${b} curve the same way and are only ${Math.abs(to - from).toFixed(
        2
      )} units apart, which is ${(Math.abs(to - from) * 0.92).toFixed(2)}px at 22px, the size this drawing was settled against`
    ).toBe(true);
  });

  /* The ends of the ramp, where a glance has to be certain and where the
     mouth alone is carrying a same-direction difference. */
  it('gives the two extremes lids and leaves the middle three their dots', () => {
    expect(MOOD_FACES[1].lids).toBeTruthy();
    expect(MOOD_FACES[5].lids).toBeTruthy();
    for (const step of [2, 3, 4]) expect(MOOD_FACES[step].lids).toBeUndefined();
  });

  /* The mouth grows as well as turning: the top of the ramp is a wider,
     thicker mark than the bottom, so the five differ in weight and not only
     in curvature. Measured on the outline's own extent rather than restated
     from the table. */
  it('draws a wider, thicker mouth at the top of the ramp than at the bottom', () => {
    const span = (step: number) => {
      const xs = points(MOOD_FACES[step].mouth).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const thickness = (step: number) => {
      const column = points(MOOD_FACES[step].mouth).filter((p) => Math.abs(p.x - 12) < 0.05);
      const ys = column.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(span(5)).toBeGreaterThan(span(1));
    expect(thickness(5)).toBeGreaterThan(thickness(1));
  });

  /* Only the top of the ramp gets them, which is the third channel on the
     4-5 pair - the one pair the mouth's direction cannot separate. */
  it('blushes on the top step only', () => {
    expect(MOOD_FACES[5].cheeks).toBe(true);
    for (const step of [1, 2, 3, 4]) expect(MOOD_FACES[step].cheeks).toBeUndefined();
  });

  it('keeps every face inside its disc', () => {
    for (const step of STEPS) {
      for (const point of points(ink(step))) {
        expect(
          Math.hypot(point.x - 12, point.y - 12),
          `step ${step} draws ink outside the disc`
        ).toBeLessThanOrEqual(REACH);
      }
    }
    for (const eye of MOOD_EYES) {
      expect(Math.hypot(eye.cx - 12, eye.cy - 12) + MOOD_EYE_RADIUS).toBeLessThanOrEqual(REACH);
    }
    for (const cheek of MOOD_CHEEKS) {
      expect(Math.hypot(cheek.cx - 12, cheek.cy - 12) + MOOD_CHEEK_RADIUS).toBeLessThanOrEqual(REACH);
    }
  });

  /* The eyes move (phase 9 carpet ticket 01): the row turns them toward the
     finger and the face turns them again on its own idle glance, and the two
     groups are nested so the offsets add. The drawing has to survive both at
     once in both directions - an eye clipped by its own disc for the half
     second a finger passes is a worse bug than a still face, because it only
     ever happens while somebody is looking straight at it.

     Only the eyes travel. The mouth and the cheeks sit outside both groups
     and are covered by the still check above. */
  it('keeps every eye inside its disc while it is fully turned', () => {
    const travel = eyeTravel();
    for (const dx of [-travel.x, travel.x]) {
      for (const dy of [-travel.y, travel.y]) {
        for (const step of STEPS) {
          const lids = MOOD_FACES[step].lids;
          if (!lids) continue;
          for (const point of points(lids)) {
            expect(
              Math.hypot(point.x + dx - 12, point.y + dy - 12),
              `step ${step}'s lids leave the disc at a gaze of ${dx.toFixed(2)}, ${dy.toFixed(2)}`
            ).toBeLessThanOrEqual(REACH);
          }
        }
        for (const eye of MOOD_EYES) {
          expect(Math.hypot(eye.cx + dx - 12, eye.cy + dy - 12) + MOOD_EYE_RADIUS).toBeLessThanOrEqual(REACH);
        }
      }
    }
  });

  /* The margin above is 0.8 units of air, not 0.8 units of stroke. The
     drawing is filled now, and a stroke put back on any of these three would
     reach half its width past every point measured here. */
  it('draws the face in fills, with no stroke on any mark', () => {
    for (const selector of ['.mood-face-mouth', '.mood-face-eye', '.mood-face-cheek']) {
      const body = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(componentsCss)?.[1];
      expect(body, `${selector} is gone or renamed`).toBeTruthy();
      expect(body, `${selector} still carries a stroke`).not.toMatch(/stroke-width|stroke:\s*(?!none)/);
    }
  });

  /* The stylesheet's fallback and the module's constant are the same travel
     written twice, because the component sets `--gaze-reach` inline off
     GAZE_REACH and components.css has to name a value for the case where it
     does not. Two numbers, one meaning: held together here so a change to one
     cannot quietly leave the other behind. */
  it('writes the same gaze travel in the stylesheet as in the module', () => {
    const fallback = /--gaze-reach,\s*([\d.]+)px/.exec(componentsCss);
    expect(fallback, '--gaze-reach has no fallback in components.css').toBeTruthy();
    expect(parseFloat(fallback![1])).toBeCloseTo(GAZE_REACH, 10);
  });
});
