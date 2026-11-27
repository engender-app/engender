/* Keep adjacent mood faces distinct at entry size. The smallest shipped
   face is 28px. The check keeps the margin chosen for 22px, where one unit
   in the 24-unit view box is 0.92px.

   Adjacent mouths need at least 2 units of depth difference or a different
   curve direction. The first and last faces also use lids so the depth-only
   pairs differ by shape. Check every feature against the rounded block
   after accounting for the 1.9-unit stroke. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOOD_BLOCK, MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from '../../../src/lib/components/moodFace';
import { GAZE_REACH } from '../../../src/lib/motion/magnifier';
import { inkPolylines } from '../../icon-ink';

const STEPS = [1, 2, 3, 4, 5];

/** Half the stroke, plus 0.4 of a unit of air. */
const INK_MARGIN = 1.9 / 2 + 0.4;

/** How far a point sits outside the block, once the block is inset by
    `margin`: 0 or less is inside. A rounded square is the axis-aligned box
    everywhere except its four corners, where it is a circle of the corner
    radius - so the reading is the box's own overshoot, except inside a
    corner's quadrant, where it is the distance from that corner's centre. */
function outsideBlock(x: number, y: number, margin: number): number {
  const min = MOOD_BLOCK.x + margin;
  const max = MOOD_BLOCK.x + MOOD_BLOCK.size - margin;
  const inset = MOOD_BLOCK.radius - margin;
  const cornerX = x < min + inset ? min + inset : x > max - inset ? max - inset : null;
  const cornerY = y < min + inset ? min + inset : y > max - inset ? max - inset : null;
  if (cornerX !== null && cornerY !== null) {
    return Math.hypot(x - cornerX, y - cornerY) - inset;
  }
  return Math.max(min - x, x - max, min - y, y - max);
}

const componentsCss = readFileSync(join(import.meta.dirname, '../../../src/lib/styles/components.css'), 'utf8');

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

  it('keeps every face inside its block', () => {
    for (const step of STEPS) {
      const face = MOOD_FACES[step];
      const markup = `<path d="${face.mouth}"/>${face.lids ? `<path d="${face.lids}"/>` : ''}`;
      for (const line of inkPolylines(markup)) {
        for (const point of line) {
          expect(
            outsideBlock(point.x, point.y, INK_MARGIN),
            `step ${step} draws at ${point.x.toFixed(2)}, ${point.y.toFixed(2)}, outside the block`
          ).toBeLessThanOrEqual(0);
        }
      }
    }
    /* A dot is a fill, so what has to be inside is its rim rather than its
       centre - hence the radius as part of the margin instead of the
       stroke's half-width. */
    for (const eye of MOOD_EYES) {
      expect(outsideBlock(eye.cx, eye.cy, MOOD_EYE_RADIUS + 0.4)).toBeLessThanOrEqual(0);
    }
  });

  /* The eyes move now: the row turns them toward
     the finger and the face turns them again on its own idle glance, and the
     two groups are nested so the offsets add. The drawing has to survive both
     at once in both directions - an eye clipped by its own block for the half
     second a finger passes is a worse bug than a still face, because it only
     ever happens while somebody is looking straight at it. */
  it('keeps every face inside its block while its eyes are fully turned', () => {
    const travel = eyeTravel();
    for (const dx of [-travel.x, travel.x]) {
      for (const dy of [-travel.y, travel.y]) {
        for (const step of STEPS) {
          const face = MOOD_FACES[step];
          if (!face.lids) continue;
          for (const line of inkPolylines(`<path d="${face.lids}"/>`)) {
            for (const point of line) {
              expect(
                outsideBlock(point.x + dx, point.y + dy, INK_MARGIN),
                `step ${step}'s lids leave the block at a gaze of ${dx.toFixed(2)}, ${dy.toFixed(2)}`
              ).toBeLessThanOrEqual(0);
            }
          }
        }
        for (const eye of MOOD_EYES) {
          expect(outsideBlock(eye.cx + dx, eye.cy + dy, MOOD_EYE_RADIUS + 0.4)).toBeLessThanOrEqual(0);
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

/* Ticket 279: a face is drawn in its own step's ink, not in the
   palette's --text, because the deep end of a ramp is too dark for a dark
   ink. The component hands the step's ink over as --face-ink the same way it
   hands the fill over as --face-mood, and every rule that paints the eyes or
   the mouth reads that. A rule reaching for --text again would put a dark
   face back on a deep fill, and nothing else would notice. */
describe('the face draws in its own step\'s ink', () => {
  const rulesFor = (selector: RegExp) =>
    [...componentsCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, sel]) => selector.test(sel))
      .map(([, sel, body]) => ({ sel: sel.trim(), body }));

  it('hands each face its step\'s ink', () => {
    const component = readFileSync(join(process.cwd(), 'src/lib/components/MoodFace.svelte'), 'utf8');
    expect(component).toContain('`--face-ink: var(--mood-${step}-ink)`');
  });

  it('paints the eyes and the mouth in --face-ink and never in --text', () => {
    const rules = rulesFor(/\.mood-face-(eye|mouth)\b/);
    const painted = rules.filter(({ body }) => /(^|[;\s])(fill|stroke)\s*:(?!\s*none)/.test(body));
    expect(painted.length).toBeGreaterThan(0);
    for (const { sel, body } of painted) {
      expect(body, `${sel} paints the face in something other than --face-ink`).not.toMatch(/var\(--text\)/);
      expect(body, `${sel} paints the face without --face-ink`).toMatch(/var\(--face-ink\)/);
    }
  });

  /* The 4.5:1 the palette test proves is for the ink at full strength. The
     features used to sit at 0.75 opacity, which blended them toward the
     fill: measured on the composite, the worst face was 2.60:1 before ticket
     279 and 2.49:1 on its new ramps. A resting face draws its ink solid; only
     the picker's unchosen faces, which are dimmed on purpose, go lighter. */
  it('draws a resting face in its ink at full strength', () => {
    const own = rulesFor(/^\s*\.mood-face-(eye|mouth)\s*$/);
    expect(own.length).toBe(2);
    for (const { sel, body } of own) {
      expect(body, `${sel} sets its own opacity`).not.toMatch(/(?:^|[;\s])opacity:/);
    }
  });

  /* Dim the whole unchosen face at 0.55 opacity so fill and ink move
     together. Separate fades had pushed contrast to 1.48:1 light and
     1.64:1 dark. Whole-face dimming measures at least 2.13:1. Draw the
     edge at 35% of --text so the dim leaves the equivalent of
     --outline's 19%. */
  it('dims an unchosen face as one object, with a border that survives it', () => {
    expect(componentsCss).not.toMatch(/\.mood-face-disc\s*\{[^}]*fill-opacity/);
    expect(componentsCss).not.toMatch(/\.mood-btn[^{]*\.mood-face-(eye|mouth)\s*\{[^}]*opacity/);
    const dim = rulesFor(/^\s*\.mood-btn:not\(\.is-selected\) \.mood-face\s*$/);
    expect(dim.map((r) => r.body.trim())).toEqual(['opacity: 0.55;']);
    const edge = rulesFor(/^\s*\.mood-btn:not\(\.is-selected\) \.mood-face-disc\s*$/);
    const alpha = /color-mix\(in oklab, var\(--text\) (\d+)%, transparent\)/.exec(edge[0]?.body ?? '')?.[1];
    expect(Number(alpha) * 0.55).toBeCloseTo(19, 0);
  });

  /* Picking a face (tester report 02, ticket 03, where the faces first sit
     on a step of their own). The comment above says the face's opacity is
     transitioned, but only the ring's colour was: sampled on every frame,
     the dimming of the four unpicked faces, the picked one's 0.55 to 1 and
     the previous pick's scale 1.18 to 1 each landed in a single frame (one
     frame carried 78% of the change). The edge between a chosen and an
     unchosen disc needs the same. */
  it('eases a face between picked and unpicked rather than swapping it', () => {
    const own = rulesFor(/^\s*\.mood-btn \.mood-face\s*$/);
    expect(own.length).toBe(1);
    expect(own[0].body).toMatch(/transition:[^;]*\bopacity var\(--dur-fast\) var\(--ease-out\)[^;]*\btransform var\(--dur-fast\) var\(--ease-out\)/);
    const disc = rulesFor(/^\s*\.mood-btn \.mood-face-disc\s*$/);
    expect(disc.length).toBe(1);
    expect(disc[0].body).toMatch(/transition:[^;]*\bstroke var\(--dur-fast\) var\(--ease-out\)/);
  });

  /* The pick's swell began at 0.9 on its first frame: a face resting at 1
     went to 0.9 at once, 4px of a 44px face in one frame. It now starts at
     the scale it rests at and dips from there. */
  it('starts the pick swell at the scale the face rests at', () => {
    expect(componentsCss).toMatch(/@keyframes mood-pop\s*\{\s*0%\s*\{\s*transform:\s*scale\(1\);\s*\}/);
  });

  /* A step's ink changes with the theme and the preset, and on a Journal
     cell whose day gains an entry. A face that swapped its colour in one
     frame would be a yank, so the ink crossfades on the same curve the
     block's fill already takes. */
  it('crossfades the ink rather than swapping it', () => {
    const own = rulesFor(/^\s*\.mood-face-(eye|mouth)\s*$/);
    expect(own.length).toBe(2);
    for (const { sel, body } of own) {
      expect(body, `${sel} has no transition on the ink`).toMatch(
        /transition:[^;]*\bfill var\(--dur-med\) var\(--ease-out\)[^;]*\bstroke var\(--dur-med\) var\(--ease-out\)/
      );
    }
  });
});

/* Pin the two shipped mood drawings by hash so a motion change cannot
   redraw a face unnoticed. Update the hashes with an intentional redraw.

   Ticket 279 moved MoodFace.svelte's hash and not the drawing: one line hands
   the face its step's ink as --face-ink. moodFace.ts, which is
   the drawing, is still ticket 27's byte for byte. */
describe("the drawing is ticket 27's, byte for byte", () => {
  const PINNED: Record<string, string> = {
    'src/lib/components/moodFace.ts': '017aee0fa552cac1d3bcf09a146fbe8c85410e9d2b2019586a6a78a8de8885b2',
    'src/lib/components/MoodFace.svelte': 'be3a3e8197fd78aa454019a2524b16bb0373c775acdb5bac8ddc51d5b3e17b73'
  };
  for (const [file, sha256] of Object.entries(PINNED)) {
    it(`${file} is unchanged since redesign ticket 27 (6b78081a)`, () => {
      const bytes = readFileSync(join(process.cwd(), file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
    });
  }
});
