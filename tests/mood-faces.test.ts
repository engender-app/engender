/* The five mood faces have to be telling apart at the smallest size any
   surface draws them (phase 5 ticket 31).

   28px is that size now - an entry inside a day card - but the drawing was
   settled against the 22 an entry drew at until Alicja called the marks on
   Home too small, so the margin below is the one that harder size needed and
   every shipped size clears it. At 22px one user unit of the 24 box is 0.92
   of a pixel. That number is the whole reason this test
   exists: the five mouths used to be five depths of one arc, 1.0 to 1.4 units
   between neighbours, so steps 1 and 2 were about a pixel apart and so were
   4 and 5. Side by side you could nearly pick them out; alone on an entry,
   which is how they actually appear, you could not.

   The rule the drawing now answers to, and what each half is for:

   - Neighbouring steps differ by at least 2 units of mouth depth, OR by the
     direction the mouth curves. A change of direction is categorical and
     needs no size to read at all, which is what carries 2-3 and 3-4; a
     change of depth needs to be big, which is what carries 1-2 and 4-5.
   - The two ends of the ramp draw lids instead of dots. That is a second,
     independent channel on exactly the pairs that have only depth to go on,
     and a change of shape rather than of dimension - the only kind that
     survives being scaled down this far.
   - Nothing leaves the disc, so no face is ever clipped by the circle it
     sits in. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from '../src/lib/components/moodFace';
import { GAZE_REACH } from '../src/lib/motion/magnifier';
import { inkPolylines } from './icon-ink';

const STEPS = [1, 2, 3, 4, 5];

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

/** How far the middle of the mouth sits from its corners, signed: positive
    curves down into a smile, negative up into a frown, zero is the flat one. */
function depth(step: number): number {
  const [line] = inkPolylines(`<path d="${MOOD_FACES[step].mouth}"/>`);
  const ends = (line[0].y + line[line.length - 1].y) / 2;
  const apex = line.reduce((far, p) => (Math.abs(p.y - ends) > Math.abs(far - ends) ? p.y : far), ends);
  return apex - ends;
}

describe('the five mood faces', () => {
  it('draws one for every step of the ramp', () => {
    expect(Object.keys(MOOD_FACES).map(Number).sort()).toEqual(STEPS);
  });

  it('runs from frown to smile through flat', () => {
    expect(depth(1)).toBeLessThan(0);
    expect(depth(2)).toBeLessThan(0);
    expect(depth(3)).toBeCloseTo(0, 5);
    expect(depth(4)).toBeGreaterThan(0);
    expect(depth(5)).toBeGreaterThan(0);
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5]
  ])('tells step %i from step %i by depth or by direction', (a, b) => {
    const from = depth(a);
    const to = depth(b);
    const turned = Math.sign(from) !== Math.sign(to);
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

  it('keeps every face inside its disc', () => {
    for (const step of STEPS) {
      const face = MOOD_FACES[step];
      const markup = `<path d="${face.mouth}"/>${face.lids ? `<path d="${face.lids}"/>` : ''}`;
      for (const line of inkPolylines(markup)) {
        for (const point of line) {
          /* The disc is r10, and the stroke is 1.6 wide, so its outer edge
             reaches 0.8 past the path. */
          expect(Math.hypot(point.x - 12, point.y - 12)).toBeLessThanOrEqual(10 - 0.8);
        }
      }
    }
    for (const eye of MOOD_EYES) {
      expect(Math.hypot(eye.cx - 12, eye.cy - 12) + MOOD_EYE_RADIUS).toBeLessThanOrEqual(10);
    }
  });

  /* The eyes move now (phase 9 carpet ticket 01): the row turns them toward
     the finger and the face turns them again on its own idle glance, and the
     two groups are nested so the offsets add. The drawing has to survive both
     at once in both directions - an eye clipped by its own disc for the half
     second a finger passes is a worse bug than a still face, because it only
     ever happens while somebody is looking straight at it. */
  it('keeps every face inside its disc while its eyes are fully turned', () => {
    const travel = eyeTravel();
    for (const dx of [-travel.x, travel.x]) {
      for (const dy of [-travel.y, travel.y]) {
        for (const step of STEPS) {
          const face = MOOD_FACES[step];
          if (!face.lids) continue;
          for (const line of inkPolylines(`<path d="${face.lids}"/>`)) {
            for (const point of line) {
              expect(
                Math.hypot(point.x + dx - 12, point.y + dy - 12),
                `step ${step}'s lids leave the disc at a gaze of ${dx.toFixed(2)}, ${dy.toFixed(2)}`
              ).toBeLessThanOrEqual(10 - 0.8);
            }
          }
        }
        for (const eye of MOOD_EYES) {
          expect(Math.hypot(eye.cx + dx - 12, eye.cy + dy - 12) + MOOD_EYE_RADIUS).toBeLessThanOrEqual(10);
        }
      }
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
