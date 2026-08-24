/* Tier 2 of the motion system set out in DIRECTION.md, which lives on
   ticket 15's branch: how one screen becomes another.

   Material 3's navigation patterns, mapped to this app's actual shape -
   fade-through between the four tabs because they are peers rather than a
   sequence, shared-axis-X from a list into a detail because that one is a
   sequence, and a container transform only into the entry editor, which is
   the single place where the thing tapped genuinely becomes the thing that
   opens.

   These sit next to tokens.ts rather than inside it because they are built
   out of it: every duration and distance below comes from the same
   --dur-* and --motion-distance-* tokens the CSS reads, which is ticket
   09's rule for keeping a Svelte transition and its CSS neighbours from
   drifting apart. Nothing here invents a number.

   The reduced-motion contract is substitute, never delete: each primitive
   drops its transform and crossfades instead, over a duration the 1ms
   clamp cannot reach. That clamp is a CSS rule, so it never touched these
   transitions in the first place - which is exactly why the substitute has
   to be written out here rather than left to the stylesheet. */

import { crossfade } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';

import {
  crossfadeDuration,
  EASE_OUT,
  fadeOnly,
  isReducedMotion,
  motionDistance,
  motionDuration
} from './tokens';

/* Svelte reports 'both' for a bare `transition:`, which cannot tell an
   entrance from an exit. Each primitive below reads it as an entrance,
   which is why they are documented as `in:`/`out:` pairs. */
type Direction = 'in' | 'out' | 'both';

/** The substitute every tier-2 primitive falls back to under reduced
    motion: the same crossfade, none of the movement. */
const crossfadeOnly = (): TransitionConfig => fadeOnly(crossfadeDuration());

/** A tier-2 transition over the shared easing, or its reduced-motion
    substitute. Every primitive is this plus one line of geometry, which is
    the whole point of the tier being a tier.

    The screen being left goes on --dur-fast and the one arriving on
    --dur-med, because an exit that takes as long as an entrance reads as
    the app hesitating before it answers. Material's fade-through is
    asymmetric for the same reason - it fades the outgoing screen out in
    roughly 90ms and the incoming one in over roughly 210ms, rather than
    crossfading both over one duration. */
function tier2(css: (t: number, u: number) => string, direction?: Direction): TransitionConfig {
  if (isReducedMotion()) return crossfadeOnly();
  const duration =
    direction === 'out' ? motionDuration('--dur-fast', 150) : motionDuration('--dur-med', 240);
  return { duration, easing: EASE_OUT, css };
}

/**
 * Tier 2, between the four tabs: fade-through. The outgoing screen fades
 * out and settles to 0.97, the incoming one fades in from 1.03. No
 * horizontal slide, because sliding implies an order the four tabs do not
 * have.
 *
 * Use as `in:fadeThrough` and `out:fadeThrough`; a bare `transition:`
 * cannot tell the two apart and gets the incoming shape both ways.
 */
export function fadeThrough(
  _node: Element,
  _params: Record<string, never> = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  /* Outgoing shrinks past its resting size, incoming settles down onto it,
     so the two never read as the same screen scaling twice. */
  const travel = options.direction === 'out' ? -0.03 : 0.03;
  return tier2((t, u) => `opacity: ${t}; transform: scale(${1 + travel * u})`, options.direction);
}

/**
 * Tier 2, into a detail from a list: shared-axis-X. The incoming screen
 * enters from `--motion-distance-md` away and the outgoing one leaves by
 * the same distance, so the pair reads as one axis rather than two
 * independent moves. `back: true` reverses the axis for the return trip.
 */
export function sharedAxisX(
  _node: Element,
  params: { back?: boolean } = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  const distance = motionDistance('--motion-distance-md', 24);
  const away = params.back ? -1 : 1;
  const sign = options.direction === 'out' ? -away : away;
  return tier2(
    (t, u) => `opacity: ${t}; transform: translateX(${sign * distance * u}px)`,
    options.direction
  );
}

/**
 * Tier 2, sheets: rise by `--motion-distance-md`. Dismissal is the
 * component's job rather than this one's - it follows the drag rather than
 * replaying this backwards.
 */
export function sheetRise(_node: Element): TransitionConfig {
  const distance = motionDistance('--motion-distance-md', 24);
  return tier2((t, u) => `opacity: ${t}; transform: translateY(${distance * u}px)`);
}

/* svelte/transition's crossfade already is a container transform: it
   measures both boxes and tweens position and size between them. Handing
   it the token duration is all this needs to speak the same language as
   everything above. */
const [send, receive] = crossfade({
  /* --dur-slow rather than --dur-med, which is what the other three tier-2
     patterns run on: this is the only one that carries a box across the
     screen and resizes it on the way, and Material gives a container
     transform its longest standard duration for exactly that reason. At
     240ms the card arrives before the eye has followed it, which loses the
     one thing the pattern exists to show. */
  duration: () => motionDuration('--dur-slow', 380),
  easing: EASE_OUT
});

/**
 * Tier 2, into the entry editor: container transform, the one screen where
 * the source really does become the destination. Put `containerSend` on
 * the card and `containerReceive` on the editor, keyed by the entry id.
 *
 * Under reduced motion both halves stop deferring to each other and just
 * crossfade, because a FLIP between two boxes is nothing but movement.
 */
export function containerSend(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : send(node, params);
}

export function containerReceive(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : receive(node, params);
}
