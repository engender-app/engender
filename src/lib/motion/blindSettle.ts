/* How the blind's edge lands on its mark (redesign ticket 28).

   The edge runs past where it is going and comes back - about 6% of the
   distance it travelled, capped at 8px - which is the one thing none of the
   app's three easings can do: a cubic-bezier approaches its end from one
   side however far its handles reach, and tests/motion-system.test.ts holds
   every control point inside its own range for exactly that reason (phase 5
   ticket 29 retired an --ease-spring that pretended otherwise).

   So the settle is sampled off a real second-order spring, the same way
   --ease-press is, and handed to the stylesheet as a linear() on
   --blind-ease. It is computed per navigation rather than written as a
   token because the overshoot is a fraction of a distance that is only
   known at navigation time: 6% of a 100px pull is 6px, 6% of a 300px one
   would be 18 and is held to 8, and below 24px of travel there is nothing
   worth settling from. One curve inside one --dur-slow either way - the
   overshoot is the tail of it, never a second phase.

   Two cases get no overshoot at all, and the second is a correction to the
   ticket rather than an omission. The blind is painted over the page and
   the content under it travels on a plain ease-out, so the blind covers the
   difference between the two curves only while its edge is the lower of the
   two. On the way down that is every frame. On a close the edge is rising,
   the content is already on its mark, and an edge that runs past the mark
   uncovers a band of page between itself and the content's top - which is
   the gap the ticket forbids. A close that lands at nothing is the
   exception the ticket names: its overshoot is above the window's top edge,
   where there is nothing to uncover. */

/** What the stylesheet falls back to where nothing overshoots. */
export const EASE_OUT_VAR = 'var(--ease-out)';

/** The share of the travel the edge runs past its mark by. */
const OVERSHOOT_SHARE = 0.06;
/** However long the travel, the edge never runs more than this past it. */
const OVERSHOOT_CAP = 8;
/** Below this much travel there is no settle, only a move. */
const SETTLE_FLOOR = 24;
/** Where in the run the edge is at its furthest past the mark. */
const PEAK_AT = 0.55;
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
    easing: overshoot ? springEasing(overshoot / travel) : EASE_OUT_VAR
  };
}

/**
 * A linear() sampled off a spring that overshoots its mark by `peak` of the
 * distance and settles back onto it.
 *
 * A second-order system's overshoot is fixed by its damping ratio alone -
 * Mp = exp(-πζ/sqrt(1-ζ²)) - so the ratio is solved for the overshoot
 * asked for rather than guessed at, and the frequency is then whatever puts
 * the peak at PEAK_AT of the run. What is left at the end is under a
 * thousandth of the distance, and the last stop is written as the mark
 * itself so the element cannot be stranded a fraction short of where it
 * rests.
 */
function springEasing(peak: number): string {
  const ln = Math.log(peak);
  const zeta = -ln / Math.sqrt(Math.PI ** 2 + ln ** 2);
  const damped = Math.sqrt(1 - zeta ** 2);
  /* The peak of the step response is half a damped cycle in. */
  const omega = Math.PI / (PEAK_AT * damped);
  const at = (t: number) =>
    1 -
    Math.exp(-zeta * omega * t) *
      (Math.cos(omega * damped * t) + (zeta / damped) * Math.sin(omega * damped * t));

  const stops = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    stops.push(i === SAMPLES ? 1 : Math.round(at(t) * 1000) / 1000);
  }
  return `linear(${stops.join(', ')})`;
}
