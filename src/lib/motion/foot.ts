/* Tier 3, change within a screen: the foot arriving and leaving (carpet 26).

   The save bar is a frame object now (`$lib/stores/saveBar.svelte`), so a
   screen that grows or drops a foot changes the height of the scroll region
   beside it. Rule 10 says a solid thing arrives from its own edge and never
   fades from nothing, and the foot's own edge is the window's bottom: it
   rises from behind the floating bar, which paints over it on the way past.

   **Why the room is a discrete swap and the travel a transform.** The
   column's room has to change at one of the two ends of the movement, and
   which end decides whether anything is ever missing. Take it at the start
   and the region is a foot shorter before the foot is there, so the last
   rows of a scrolled column are clipped away with nothing in their place -
   a yank, by the only definition that matters here (Alicja: "things
   teleporting/disappearing in 1 frame"). Take it at the end and the strip
   is clipped underneath a foot that is already over it, which is invisible.
   So the foot hangs its own height below the frame for the whole travel -
   `margin-bottom` negative, so the region keeps its full height - and rides
   up on a transform. The negative margin is what makes the arithmetic
   simple and what makes it easy to get backwards: it puts the foot's own
   resting place one foot-height *lower*, at the window's bottom edge, so
   the travel runs from 0 to minus its height and the last frame lands on
   the pixel the natural position will be once the inline style goes.
   Measured with the sign the other way round, the foot rose to the
   window's edge and then jumped 128px at the end (the first motion run).

   The leave runs the same timeline backwards, which gives the room back
   under the foot before it moves off.

   That also keeps the per-frame cost to a transform, which is the whole of
   materials.css's contract. The two layout passes are at the ends of the
   travel, not on every frame of it. */
import type { TransitionConfig } from 'svelte/transition';
import { EASE_OUT, motionDuration } from './tokens';

/** The mark a leaving foot carries, so the shell can tell a foot that is
    still a screen's from one that is only finishing its outro
    ($lib/motion/outgoingScreen). */
export const LEAVING = 'data-savebar-leaving';

type Params = { skip?: boolean };

/**
 * The frame's foot, rising in from under the window's bottom edge.
 *
 * Reduced motion answers 0 through `motionDuration` and the foot cuts,
 * which is tier 3's substitute: the room appears, the foot is in it, and
 * nothing is left mid-flight.
 */
export function footRise(node: Element, params?: Params): TransitionConfig {
  return travel(node, params);
}

/**
 * The same travel on the way out, and the mark that says so.
 *
 * `skip` is the escape `disclose` documents, for the same reason and the
 * same caller: Svelte runs an out-transition when the *page* unmounts the
 * node during a navigation, not only when the screen's own condition goes
 * false, and a foot sliding down the window while the blind pulls the next
 * screen over it is two motions explaining one thing. On a navigation the
 * foot goes with the screen's own snapshot, so the leave cuts.
 */
export function footFall(node: Element, params?: Params): TransitionConfig {
  node.setAttribute(LEAVING, '');
  return travel(node, params);
}

function travel(node: Element, params?: Params): TransitionConfig {
  if (params?.skip) return { duration: 0 };
  /* The whole box, including the bottom padding that holds the floating
     bar's room: the travel has to clear the frame's edge, or the foot is
     cut off part-way down rather than gone. */
  const height = node.getBoundingClientRect().height;
  return {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT,
    css: (t) => `margin-bottom: ${-height}px; translate: 0 ${round(-t * height)}px`
  };
}

/* Two decimals, as the drum and the wipe write theirs: whole pixels step a
   long travel visibly on a dense screen. */
const round = (n: number) => Number(n.toFixed(2));
