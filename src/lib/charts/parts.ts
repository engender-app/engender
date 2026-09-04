/* Parts of a whole (phase 8 UX ticket 04, ADR-0058), for the ring that
   draws the unordered case.

   Beside geometry.ts rather than inside Donut.svelte for the reason the
   header there gives: the two decisions this ticket had to make before
   anything was drawn - where the cap falls and what happens to what it
   drops - are arithmetic, and arithmetic is worth holding to values
   without a DOM in the way. The ordered strip needs none of this: its
   segments are the scale's own steps, all of them, in the scale's own
   order, so there is nothing to cap and nothing to sort. */

import { share } from './geometry';

/** One category and how much of the whole it holds. The caller's own
    counting: entries, days, doses - the ring never reads the unit. */
export interface Part {
  key: string;
  /** Already resolved through the vocabulary by the caller. */
  name: string;
  amount: number;
}

export interface Slice extends Part {
  /** Percentage of the whole, 0-100. */
  share: number;
  /** True for the one slice standing in for everything the cap dropped. */
  isRest: boolean;
}

/** How many arcs a ring ever draws, remainder included.

    Five, which is the count the legend under it can be read down without
    scanning and the count the tint ladder has distinguishable steps for.
    The ticket's own warning is the reason there is a number here at all: a
    nine-slice ring with a legend is worse than the horizontal bars it
    replaced, because at nine the arcs stop being comparable and the legend
    becomes the chart. */
export const MAX_SLICES = 5;

/** The break between two arcs, in the ring's own path units, so a ring
    reads as parts rather than as one banded track. */
export const ARC_GAP = 2;

/** The shortest arc worth drawing with a break after it. A share smaller
    than the gap would come out at zero length or negative otherwise, which
    is the small-share case this form has to survive: it is a real reading
    and it keeps its place on the ring.

    An arc gives up the gap only where it has the length to spare, and
    never draws longer than its own share - so below this, what disappears
    is the break before the next arc, not the arc. Drawing a tiny slice out
    to a floor of its own would run it past where the next one starts, and
    since the next arc paints over it the visible result is a slice shorter
    than the floor was for, on a ring whose arcs no longer add up to one
    circumference. */
export const MIN_ARC = 3;

/** The parts of a whole, largest first, capped, with everything past the
    cap gathered into one remainder named by the caller.

    Sorted by size rather than left in the caller's order: the ring's tint
    ladder descends with the arcs, so size and strength agree and colour
    ranks nothing that length has not already ranked. A tie keeps the
    caller's own order, which is a stable sort and not an accident - two
    tags with the same count come out in whatever order the query settled
    them, the same way the bar rows' do.

    A part nothing was logged against is dropped rather than drawn: a
    zero-length arc with a name in the legend is a category the person does
    not have, and the whole point of the emptiness rule this phase writes
    is that nothing is shown for a practice nobody uses. */
export function slices(parts: Part[], restName: string, cap: number = MAX_SLICES): Slice[] {
  const real = parts.filter((p) => p.amount > 0);
  const whole = real.reduce((sum, p) => sum + p.amount, 0);
  if (whole <= 0) return [];

  const ranked = [...real].sort((a, b) => b.amount - a.amount);
  /* geometry.ts's own `share`, handed the whole rather than the largest
     part. That is the only difference between a part of a whole and a bar
     measured against its leader, and it is not worth a second arithmetic
     to say so. */
  const of = (amount: number) => share(amount, whole);
  if (ranked.length <= cap) {
    return ranked.map((p) => ({ ...p, share: of(p.amount), isRest: false }));
  }

  const named = ranked.slice(0, cap - 1);
  const dropped = ranked.slice(cap - 1);
  const restAmount = dropped.reduce((sum, p) => sum + p.amount, 0);
  return [
    ...named.map((p) => ({ ...p, share: of(p.amount), isRest: false })),
    { key: 'rest', name: restName, amount: restAmount, share: of(restAmount), isRest: true }
  ];
}

/** One arc of the ring: a dash the length of its own share, the rest of
    the circumference left undrawn, and where along the path it starts.

    Drawn as one dash per circle rather than as a path per segment, which
    is what lets the ring draw itself on with nothing but stroke-dasharray
    interpolating - `0 C` to `dash rest` keeps the pattern exactly one
    circumference long at every frame, so an arc grows in place instead of
    the pattern repeating around the circle mid-animation. */
export interface Arc {
  dash: number;
  rest: number;
  /** Negative: a dash pattern shifts forward along the path. */
  offset: number;
}

export function arcs(shares: number[], circumference: number): Arc[] {
  const single = shares.filter((s) => s > 0).length === 1;
  let at = 0;
  return shares.map((sharePercent) => {
    const length = (sharePercent / 100) * circumference;
    // `at ? -at :` rather than a bare negation, which turns the first
    // arc's start into a -0 that reaches the style attribute as "-0".
    const offset = at ? -at : 0;
    at += length;
    /* One part is the whole ring, and a gap in it would be a break with
       nothing on the other side. Otherwise: the gap out of this arc's own
       length where there is room for it, the floor where there is not, and
       never more than the share itself - see MIN_ARC. */
    const dash =
      length <= 0 ? 0 : single ? length : Math.max(length - ARC_GAP, Math.min(length, MIN_ARC));
    return { dash, rest: circumference - dash, offset };
  });
}
