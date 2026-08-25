/* The mood row's magnifier: five faces that grow under a travelling finger
   (phase 5 ticket 31).

   Quick add can be worked without ever lifting a finger - press the add
   control, slide onto a target, let go (spec 04). The mood row is the
   nearest thing to the thumb and the one most often wanted, and while a
   finger crossed it the only answer it got was a background colour arriving
   on whichever face was armed. That says which one is armed. It does not say
   the row is being crossed, and it gives a finger nothing to aim with,
   because the target it is aiming at looks exactly like the four it is not.

   So the faces answer the finger continuously: the one under it at its
   fullest, its neighbours part of the way, the rest at rest. Tier 1, the
   response tier - this is a control answering a touch, and it spends
   --dur-fast like every other control does. The scale is re-aimed on every
   pointermove and the transition smooths it, which is what makes 150ms read
   as attachment rather than as lag: the value is never more than a frame
   old, so the easing is a filter on the finger rather than a delay after it.

   Under reduced motion none of this runs and the armed colour is the whole
   answer, which is the substitution the contract asks for: what goes is the
   movement, not the cue. */

/** The scale of the face directly under the finger. Enough to be unmistakable
    next to its neighbours, and small enough that the face grows into the row
    above it rather than through the card - .fan-card clips, so a face that
    grew far enough would lose its own top. */
const PEAK = 1.24;

/** How far the lift reaches, in mood cells. Under 2 on purpose: at 1.7 an
    immediate neighbour comes up about a third of the way and the face two
    along is untouched, so the row reads as one raised face with a shoulder
    either side rather than as a wave running through all five. */
export const MAGNIFIER_SPREAD = 1.7;

/** The scale for a face centred at `centre` while the finger is at `x`, both
    in the same axis and the same units. `spread` is how far the effect
    reaches, which the caller measures from the row rather than assuming - the
    row is as wide as the fan, and the fan is as wide as the screen. */
export function magnify(x: number, centre: number, spread: number): number {
  if (spread <= 0) return 1;
  const away = Math.abs(x - centre) / spread;
  if (away >= 1) return 1;
  /* Squared rather than linear, so the curve is flat where the finger is.
     A finger holding still on a target still moves a pixel or two, and on a
     linear falloff that flutters the one face a person is looking at. */
  return 1 + (PEAK - 1) * (1 - away * away);
}
