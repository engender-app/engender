/* How the blind's edge lands on its mark (redesign ticket 28).

   The edge runs past where it is going and comes back - about 6% of the
   distance it travelled, capped at 8px - which is the one thing none of the
   app's three easings can do: a cubic-bezier approaches its end from one
   side however far its handles reach, and tests/motion-system.test.ts holds
   every control point inside its own range for exactly that reason (phase 5
   ticket 29 retired an --ease-spring that pretended otherwise).

   So the settle is sampled and handed to the stylesheet as a linear() on
   --blind-ease, the way --ease-press already is. What is sampled is not a
   spring, and the difference is a defect this ticket found on its own
   flipbooks. A second-order step response starts slowly, and the content
   under the blind travels on a plain --ease-out, which does not: measured
   on Transition to Today, the content's top ran up to 14.4px ahead of the
   edge through the middle of the run and that band of page showed under the
   blind for about 120ms. The blind is what covers the difference between
   the two curves, so it may never fall behind the curve it is covering.

   What is sampled instead is that same --ease-out with a swell added on
   top: a half sine that is zero at both ends, scaled so the sum peaks at
   the overshoot asked for. It cannot lag, because it is the content's own
   curve plus something that is never negative; it ends exactly on the mark,
   because the swell has died by then; and it is one curve inside one
   --dur-slow rather than a phase followed by another phase.

   It is computed per navigation rather than written as a token because the
   overshoot is a fraction of a distance that is only known then: 6% of a
   100px pull is 6px, 6% of a 300px one would be 18 and is held to 8, and
   below 24px of travel there is nothing worth settling from.

   Two cases get no overshoot at all, and the second is a correction to the
   ticket rather than an omission. On the way down the blind leads the
   content and covers everything between them. On a close it is the other
   way round - the edge is rising, the content is rising under it, and an
   edge that runs past the mark uncovers a band of page between itself and
   the content's top, which is the gap the ticket forbids. A close that
   lands at nothing is the exception the ticket names: its overshoot happens
   above the window's top edge, where the only thing to uncover is the page
   the fieldless screen is drawn on anyway. */

/** What the stylesheet falls back to where nothing overshoots. */
export const EASE_OUT_VAR = 'var(--ease-out)';

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
  return {
    travel,
    overshoot,
    easing: overshoot ? settleEasing(overshoot / travel) : EASE_OUT_VAR
  };
}

/**
 * A linear() of `--ease-out` with a swell on top of it: the same
 * deceleration the content under the blind travels on, plus a half sine
 * that peaks at `peak` past the mark and is zero at both ends.
 *
 * The swell's height is solved for rather than derived, because where the
 * sum peaks depends on both curves; a bisection on a monotone quantity gets
 * there in a dozen steps and keeps the arithmetic honest. The last stop is
 * written as the mark itself so the element cannot be stranded a fraction
 * short of where it rests.
 */
function settleEasing(peak: number): string {
  const sum = (height: number, t: number) => easeOut(t) + height * Math.sin(Math.PI * t);
  const highest = (height: number) =>
    Math.max(...Array.from({ length: 201 }, (_, i) => sum(height, i / 200)));

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (highest(mid) > 1 + peak) high = mid;
    else low = mid;
  }
  const height = (low + high) / 2;

  const stops = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    stops.push(i === SAMPLES ? 1 : Math.round(sum(height, t) * 1000) / 1000);
  }
  return `linear(${stops.join(', ')})`;
}

/** --ease-out, cubic-bezier(0.22, 1, 0.36, 1), as a function of time.

    A cubic-bezier easing is a parametric curve, so the value at a given
    time needs the parameter that puts x there first; bisection finds it to
    well inside a thousandth, which is finer than the samples this is taken
    at. Written here rather than read from the stylesheet because a number
    the settle has to stay ahead of cannot be a var() - and
    tests/motion-system.test.ts holds the token to this value. */
export const EASE_OUT_POINTS = [0.22, 1, 0.36, 1] as const;

export function easeOut(t: number): number {
  const [x1, y1, x2, y2] = EASE_OUT_POINTS;
  const bezier = (a: number, b: number, u: number) =>
    3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < t) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}
