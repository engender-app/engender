/* Settle the blind's edge with a sampled linear() assigned to
   --blind-ease. Add a nonnegative half-sine to the content's
   --ease-out and scale it to the required peak. The edge stays
   ahead of the moving content and both finish together in
   --dur-slow. A slow spring let the content outrun the cover.

   Overshoot 6% of travel up to 8px. Skip travel below 24px and
   closes that end inside the viewport, where running past the
   mark would reveal content. A close to zero can overshoot
   above the window edge. */

import { EASE_OUT_SOFT_POINTS } from './tokens';

/** What an opening blind takes where nothing overshoots: the content's own
    curve, so the two move as one and no band of page can open between
    them. */
export const EASE_OUT_VAR = 'var(--ease-out)';

/** What a closing blind takes instead. --ease-out leaves at four times its average speed,
    which reads as a jump on an edge travelling the height of a field; --ease-out-soft is
    the same deceleration with the instant off the front, written for exactly this. Safe on
    the way up in a way it would not be on the way down: a closing blind that lags the
    content covers more of it, never less. */
export const EASE_OUT_SOFT_VAR = 'var(--ease-out-soft)';

/** The share of the travel the edge runs past its mark by. */
const OVERSHOOT_SHARE = 0.06;
/** However long the travel, the edge never runs more than this past it. */
const OVERSHOOT_CAP = 8;
/** Below this much travel there is no settle, only a move. */
const SETTLE_FLOOR = 24;
/** Stops in the sampled curve. Enough that the browser reads a curve. */
const SAMPLES = 24;

export interface Settle {
  /** How far the edge moves, in px. */
  travel: number;
  /** How far past its mark it runs, in px. Zero where it does not. */
  overshoot: number;
  /** What to put on --blind-ease. */
  easing: string;
}

/**
 * The blind's edge going from one field's height to another's.
 *
 * `from` and `to` are the two fields' heights in px, so a screen with no
 * field is `to: 0` - the limit case, the blind closed to nothing.
 */
export function blindSettle({ from, to }: { from: number; to: number }): Settle {
  const travel = Math.abs(to - from);
  const closes = to < from;
  const settles = travel >= SETTLE_FLOOR && (!closes || to === 0);
  const overshoot = settles ? Math.min(travel * OVERSHOOT_SHARE, OVERSHOOT_CAP) : 0;
  const base = closes ? EASE_OUT_SOFT_POINTS : EASE_OUT_POINTS;
  return {
    travel,
    overshoot,
    easing: overshoot
      ? settleEasing(overshoot / travel, base)
      : closes
        ? EASE_OUT_SOFT_VAR
        : EASE_OUT_VAR
  };
}

/**
 * A linear() of one of the app's decelerations with a swell on top of it: a
 * half sine that peaks at `peak` past the mark and is zero at both ends.
 *
 * `base` is --ease-out on the way down, where the blind has to stay level
 * with or ahead of the content it covers, and --ease-out-soft on the way up,
 * where it has to leave more gently and where lagging is the safe side.
 *
 * The swell's height is solved for rather than derived, because where the
 * sum peaks depends on both curves; a bisection on a monotone quantity gets
 * there in a dozen steps and keeps the arithmetic honest. The last stop is
 * written as the mark itself so the element cannot be stranded a fraction
 * short of where it rests.
 */
function settleEasing(peak: number, base: Bezier): string {
  const sum = settleCurve(peak, base);
  const stops = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    stops.push(i === SAMPLES ? 1 : Math.round(sum(t) * 1000) / 1000);
  }
  return `linear(${stops.join(', ')})`;
}

/**
 * The same curve as a function of time rather than as a `linear()`.
 *
 * A Svelte transition takes an easing function and has nowhere to put a
 * string, so a sheet reads the settle through this while the blind reads it
 * through the stylesheet. One curve, two ways of handing it over, the way
 * EASE_OUT and EASE_OUT_CSS already are one easing.
 */
function settleCurve(peak: number, base: Bezier): (t: number) => number {
  const curve = bezier(base);
  if (peak <= 0) return curve;
  const sum = (height: number, t: number) => curve(t) + height * Math.sin(Math.PI * t);
  const samples = Array.from({ length: 201 }, (_, i) => {
    const t = i / 200;
    return [curve(t), Math.sin(Math.PI * t)] as const;
  });
  const highest = (height: number) =>
    Math.max(...samples.map(([value, sine]) => value + height * sine));

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (highest(mid) > 1 + peak) high = mid;
    else low = mid;
  }
  const height = (low + high) / 2;
  /* Ending on the mark itself, for the reason the sampled stops do: nothing
     may be left a fraction short of where it rests. */
  return (t) => (t >= 1 ? 1 : sum(height, t));
}

/**
 * Use --ease-out-soft for both sheet directions. The blind's stronger curve
 * keeps up with covered content, while the sheet can start slower. On a 733px
 * rise the first painted pair moved 31px instead of 140px. closes marks the
 * motion that must stop at its target.
 */
export function travelSettle(
  travel: number,
  { closes }: { closes: boolean }
): (t: number) => number {
  const overshoot = closes ? 0 : travelOvershoot(travel);
  return settleCurve(travel > 0 ? overshoot / travel : 0, EASE_OUT_SOFT_POINTS);
}

/** How far past its mark a travel of this length runs, in px. A caller has
    to leave room for it: a sheet that runs past the bottom edge it stands on
    would show the page underneath itself for as long as it was up there. */
export function travelOvershoot(travel: number): number {
  return travel >= SETTLE_FLOOR ? Math.min(travel * OVERSHOOT_SHARE, OVERSHOOT_CAP) : 0;
}

/** The two decelerations this reaches for, as their control points.

    Written here rather than read from the stylesheet because a curve the
    settle has to be built on cannot be a var() - and
    src/lib/motion/blindSettle.test.ts holds both to the tokens. */
export const EASE_OUT_POINTS = [0.22, 1, 0.36, 1] as const;
// --ease-out-soft's points live in tokens.ts beside the string form of the curve.
export { EASE_OUT_SOFT_POINTS };

type Bezier = readonly [number, number, number, number];

/** A cubic-bezier easing as a function of time.

    It is a parametric curve, so the value at a given time needs the
    parameter that puts x there first; bisection finds it to well inside a
    thousandth, which is finer than the samples this is taken at. */
export function bezier([x1, y1, x2, y2]: Bezier) {
  const axis = (a: number, b: number, u: number) =>
    3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;
  return (t: number) => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (low + high) / 2;
      if (axis(x1, x2, mid) < t) low = mid;
      else high = mid;
    }
    return axis(y1, y2, (low + high) / 2);
  };
}
