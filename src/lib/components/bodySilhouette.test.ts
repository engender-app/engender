/* Neutrality, measured (ADR-0087).

   The rule this replaces was enforceable because it was trivial: the trunk
   was one rectangle, so one equality checked it. A drawn contour has no
   such single number, so the three things the ADR allows to be checked are
   checked by sampling the drawing itself - the path string for symmetry,
   the torso's own curve for the other two. That is the only way contour can
   be allowed without the next redraw quietly growing a waist.

   Everything here reads the drawing rather than the numbers that made it:
   the symmetry test parses `SILHOUETTE_PATH`, and the two width tests are
   tied to that same path by `the silhouette's own edge below the armpit is
   the trunk's side`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CANON,
  FIGURE_BOX,
  MIDLINE,
  SEXED_BANDS,
  SILHOUETTE_PATH,
  armClearance,
  armpitY,
  spansAt,
  trunkHalfWidthAt,
  trunkHalfWidths
} from './bodySilhouette.ts';

/* A reader for the path the module writes, which uses M, C, L and Z only.
   Sampling the curves rather than comparing control points is deliberate:
   what has to be symmetric is the shape, and two different chains of
   control points can draw the same shape. */
function subpaths(d: string): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  const commands = d.match(/[MCLZ][^MCLZ]*/g) ?? [];
  let at = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let points: { x: number; y: number }[] = [];
  const cubic = (a: number, b: number, c: number, e: number, t: number) => {
    const u = 1 - t;
    return a * u ** 3 + 3 * b * t * u ** 2 + 3 * c * t ** 2 * u + e * t ** 3;
  };
  for (const command of commands) {
    const args = (command.slice(1).trim().match(/-?[\d.]+/g) ?? []).map(Number);
    if (command[0] === 'M') {
      if (points.length) out.push(points);
      points = [];
      at = { x: args[0], y: args[1] };
      start = at;
      points.push(at);
    } else if (command[0] === 'C') {
      for (let i = 1; i <= 12; i += 1) {
        const t = i / 12;
        points.push({
          x: cubic(at.x, args[0], args[2], args[4], t),
          y: cubic(at.y, args[1], args[3], args[5], t)
        });
      }
      at = { x: args[4], y: args[5] };
    } else if (command[0] === 'L') {
      at = { x: args[0], y: args[1] };
      points.push(at);
    } else {
      points.push(start);
      at = start;
    }
  }
  if (points.length) out.push(points);
  return out;
}

const DRAWN = subpaths(SILHOUETTE_PATH);
const ALL_POINTS = DRAWN.flat();

test('the drawing is five closed pieces inside its own box', () => {
  assert.equal(DRAWN.length, 5, 'a body, two arms and two legs');
  for (const points of DRAWN) {
    const first = points[0];
    const last = points[points.length - 1];
    assert.ok(Math.hypot(first.x - last.x, first.y - last.y) < 1e-6, 'a piece that does not close');
  }
  for (const { x, y } of ALL_POINTS) {
    assert.ok(x >= 0 && x <= FIGURE_BOX.width, `the drawing runs to x=${x.toFixed(2)}`);
    assert.ok(y >= 0 && y <= FIGURE_BOX.height, `the drawing runs to y=${y.toFixed(2)}`);
  }
});

/* Measurement one. */
test('the path is mirror-symmetric about the midline', () => {
  assert.equal(MIDLINE, 50);
  for (const point of ALL_POINTS) {
    const twin = ALL_POINTS.some(
      (other) =>
        Math.abs(other.x - (FIGURE_BOX.width - point.x)) < 0.01 && Math.abs(other.y - point.y) < 0.01
    );
    assert.ok(twin, `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) has no mirror`);
  }
});

/* Measurement two. Stated as a fraction of the widest sample rather than of
   an average, so "varies by no more than 8%" cannot be met by a figure that
   is mostly one width and flares once. */
test("the trunk's half-width varies by no more than 8% from the collar to the crotch", () => {
  const samples = trunkHalfWidths(2);
  assert.equal(samples[0].y, CANON.collar);
  assert.equal(samples[samples.length - 1].y, CANON.crotch);
  assert.equal(samples.length, (CANON.crotch - CANON.collar) / 2 + 1);

  const halves = samples.map((s) => s.half);
  const widest = Math.max(...halves);
  const narrowest = Math.min(...halves);
  const spread = (widest - narrowest) / widest;
  assert.ok(widest > 0);
  assert.ok(spread <= 0.08, `the trunk varies by ${(spread * 100).toFixed(1)}%`);
});

/* Measurement three. A waist, a bust and a hip are all local maxima of the
   same curve, which is why this is one assertion and not three. */
test("no local maximum of the trunk's half-width falls in the bust or hip band", () => {
  const samples = trunkHalfWidths(2);
  const forbidden = (y: number) =>
    (y >= SEXED_BANDS.bust.top && y <= SEXED_BANDS.bust.bottom) ||
    (y >= SEXED_BANDS.hip.top && y <= SEXED_BANDS.hip.bottom);

  for (let i = 1; i < samples.length - 1; i += 1) {
    const { y, half } = samples[i];
    const peak = half >= samples[i - 1].half && half >= samples[i + 1].half;
    assert.ok(!(peak && forbidden(y)), `the trunk peaks at y=${y}, inside a band it may not`);
  }
  // And the plainer statement the ADR's reasoning rests on.
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(
      samples[i].half <= samples[i - 1].half + 1e-9,
      `the trunk widens between y=${samples[i - 1].y} and y=${samples[i].y}`
    );
  }
});

/* What ties the two width measurements to the drawing rather than to a
   curve the drawing might have ignored. Above the armpit the shoulder is
   drawn outside this curve on purpose; below it, which is where both
   forbidden bands sit, the curve is the contour. */
test("the silhouette's own edge below the armpit is the trunk's side", () => {
  const armpit = armpitY();
  assert.ok(armpit > CANON.collar && armpit < SEXED_BANDS.bust.top, `the armpit is at y=${armpit}`);
  for (let y = SEXED_BANDS.bust.top; y <= CANON.crotch; y += 1) {
    const middle = spansAt(y).find(([from, to]) => from <= MIDLINE && to >= MIDLINE);
    assert.ok(middle, `nothing crosses the midline at y=${y}`);
    assert.ok(
      Math.abs(middle[1] - (MIDLINE + trunkHalfWidthAt(y))) < 0.01,
      `at y=${y} the contour is at ${middle[1].toFixed(2)} and the trunk's side at ${(MIDLINE + trunkHalfWidthAt(y)).toFixed(2)}`
    );
  }
});

test('the proportion canon the last redraw got right is unchanged', () => {
  assert.equal(CANON.crown, 8);
  assert.equal(CANON.chin - CANON.crown, CANON.head, 'the head is one head tall');
  assert.equal(CANON.head * 7, FIGURE_BOX.height - CANON.crown, 'seven heads fill the box');
  assert.equal(CANON.crotch, 96);
  assert.equal(CANON.knee, CANON.crown + 5.2 * CANON.head, 'the knee sits at 5.2 heads');
  assert.equal(
    CANON.fingertip,
    (CANON.crotch + CANON.knee) / 2,
    'the fingertips reach mid-thigh'
  );
});

test('the body reads as a body at the heights the canon names', () => {
  const width = (y: number) => {
    const runs = spansAt(y);
    const middle = runs.find(([from, to]) => from <= MIDLINE && to >= MIDLINE);
    return middle ? middle[1] - middle[0] : 0;
  };
  const head = width(CANON.crown + 12);
  const neck = width(CANON.chin + 4);
  /* The shoulders are the widest the figure gets, which is across the
     deltoids rather than at any one named height. */
  let shoulder = 0;
  for (let y = CANON.collar; y <= 60; y += 0.5) {
    const runs = spansAt(y);
    shoulder = Math.max(shoulder, runs[runs.length - 1][1] - runs[0][0]);
  }

  assert.ok(head > 18 && head < 21, `the head is ${head.toFixed(1)} across`);
  assert.ok(neck > 9 && neck < 12, `the neck is ${neck.toFixed(1)} across`);
  assert.ok(
    shoulder > 2 * CANON.head && shoulder < 2.5 * CANON.head,
    `the shoulders are ${(shoulder / CANON.head).toFixed(2)} heads across`
  );
  // A limb that is not a bar: the wrist is narrower than the hand below it.
  const rightmost = (y: number) => spansAt(y)[spansAt(y).length - 1];
  const wrist = rightmost(101);
  const hand = rightmost(107);
  assert.ok(hand[1] - hand[0] > wrist[1] - wrist[0], 'the hand is no wider than the wrist');
  // And a foot that is not a tab: the sole is wider than the ankle above it.
  let ankle = Infinity;
  for (let y = 160; y <= 170; y += 0.25) {
    const run = rightmost(y);
    ankle = Math.min(ankle, run[1] - run[0]);
  }
  const sole = rightmost(CANON.sole - 0.5);
  assert.ok(
    sole[1] - sole[0] > ankle * 1.4,
    `the sole is ${(sole[1] - sole[0]).toFixed(2)} and the ankle ${ankle.toFixed(2)}`
  );
});

test('the arms hang clear of the torso below the armpit', () => {
  assert.ok(armClearance(SEXED_BANDS.bust.top, CANON.crotch) > 1.5, 'an arm brushes the torso');
  // Three runs across the chest: an arm, the torso, an arm.
  assert.equal(spansAt(60).length, 3);
  /* One across the shoulders, where the arm and the torso are one mass: the
     armpit is the height the second and third appear at, and it has to be
     above the chest's own band or a band of the torso would pick up a piece
     of an arm. */
  assert.ok(armpitY() < SEXED_BANDS.bust.top, `the armpit is at y=${armpitY()}`);
  assert.equal(spansAt(armpitY() - 0.2).length, 1);
  // Two down the legs.
  assert.equal(spansAt(140).length, 2);
});
