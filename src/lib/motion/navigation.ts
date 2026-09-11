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

import { travelSettle } from './blindSettle';
import { PART_TRAVEL } from './fieldBlind';
import {
  crossfadeDuration,
  EASE_OUT,
  fadeOnly,
  isReducedMotion,
  motionDistance,
  motionDuration
} from './tokens';
import type { DurationToken } from './tokens';

/* Svelte reports 'both' for a bare `transition:`, which cannot tell an
   entrance from an exit. Each primitive below reads it as an entrance,
   which is why they are documented as `in:`/`out:` pairs. */
type Direction = 'in' | 'out' | 'both';

/** No curve at all, for the one primitive that shapes its own values. */
const LINEAR = (t: number) => t;

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
    crossfading both over one duration.

    `timing` is for the primitive that cannot take that pair: a sheet travels
    its own height rather than a token's worth, and both its duration and its
    curve answer to that. It overrides rather than adds a tier, so the
    reduced-motion substitute and the one place durations are read stay
    shared. */
function tier2(
  css: (t: number, u: number) => string,
  direction?: Direction,
  timing?: { duration: DurationToken; easing: (t: number) => number }
): TransitionConfig {
  if (isReducedMotion()) return crossfadeOnly();
  const token = timing?.duration ?? (direction === 'out' ? '--dur-fast' : '--dur-med');
  return { duration: motionDuration(token), easing: timing?.easing ?? EASE_OUT, css };
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
/* fadeThrough stays exported only for its own test (AU-09 test-only review). */
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
  const distance = motionDistance('--motion-distance-md');
  const away = params.back ? -1 : 1;
  const sign = options.direction === 'out' ? -away : away;
  return tier2(
    (t, u) => `opacity: ${t}; transform: translateX(${sign * distance * u}px)`,
    options.direction
  );
}

/**
 * Tier 2, a step machine: one thing printed on the field leaving or
 * arriving while the field's own edge moves under it (redesign ticket 33).
 *
 * The same two movements app.css runs on `::view-transition-*(*.field-part)`
 * for a navigation, written for real elements rather than for photographs of
 * them: a step change is not a navigation, so the question and the answers
 * are still in the DOM and can be transitioned directly. No frame carries
 * two of them - the outgoing one fades out over `--dur-fast` and the
 * incoming one waits that long before starting - and the ride with the edge
 * is not here at all: it belongs to the box both sides sit in, which travels
 * once for the pair of them.
 *
 * `printed` is what tells a thing painted on the field from a thing
 * standing under it: the first travels 12px the way the edge is going and
 * the second only fades, because it is already riding the edge in full.
 *
 * That 12px is read out of `--part-travel` rather than passed in, and the
 * sign is the whole reason. Which way a part travels depends on which way
 * the edge went, and the edge's own direction is not known when the
 * transition starts - the field has not been measured yet, and forward is
 * not the same as taller (the areas step's three-line question makes a
 * taller field than the step after it). Written into the keyframes as a
 * var(), the browser resolves it per frame off whatever the edge published,
 * and the first frame - where the travel is multiplied by nothing - cannot
 * be wrong.
 */
export function fieldPart(
  _node: Element,
  params: { printed?: boolean } = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  if (isReducedMotion()) return crossfadeOnly();
  /* Leaving goes with the edge and arriving comes from the far side of it,
     which is what stops the two reading as one element sliding through. */
  const sign = options.direction === 'out' ? 1 : -1;
  const move = (u: number) =>
    params.printed
      ? `transform: translateY(calc(var(--part-travel, ${PART_TRAVEL}px) * ${sign * u}))`
      : '';
  const fast = motionDuration('--dur-fast');
  return {
    duration: fast,
    /* Half a --dur-fast, and the arithmetic below is why. The incoming half
       used to wait a whole one, which is the sequence app.css runs on the
       field's own pseudo elements - and measured on this ticket's flipbooks
       it left five frames, about 85ms, with no question on the field at
       all. A photograph of a screen can afford that; a real element cannot,
       and "no frame shows an element in neither place" is this ticket's
       own acceptance.

       So the two halves are a crossfade whose opacities sum to one at every
       moment: each runs at twice its own rate and holds at full, so the
       outgoing one is solid for the first half of its length, the incoming
       one is solid for the last half of its, and the crossover is the 75ms
       between. No frame is empty and no frame carries two solid ones. */
    delay: options.direction === 'out' ? 0 : Math.round(fast / 2),
    /* Linear, because the shape is in the css below rather than in the
       curve: an eased opacity and a doubled rate would compound into a
       crossover neither of them describes. */
    easing: LINEAR,
    css: (t, u) => `opacity: ${Math.min(1, t * 2)}; ${move(u)}`
  };
}

/**
 * Tier 2, sheets: rise by `--motion-distance-md`. Dismissal is the
 * component's job rather than this one's - it follows the drag rather than
 * replaying this backwards.
/** How far a sheet has to go to be off the bottom of the frame it is in:
 *  its own height, or the distance from its top edge to that floor, whichever
 *  is further.
 *
 *  Measured off the node because a sheet's height is its content's and every
 *  one of the 36 call sites differs. The floor is the scrim rather than the
 *  window: the scrim is `position: fixed` against `.app`, which carries a
 *  transform, so on the phone-frame demo and in the walkthrough's own frame
 *  the app's bottom edge and the window's are different lines and only the
 *  first one is the one a sheet leaves by.
 *
 *  The two cases the max covers are the two the app has. A sheet on a phone
 *  sits on the floor, so its own height and the distance to the floor are the
 *  same number. On a wide window `.sheet-scrim` centres it, so its height
 *  would leave its top edge on screen and the distance to the floor is what
 *  carries it past. A rect read live also means a dragged sheet measures from
 *  where the finger left it, which is what makes the handover seamless
 *  without either half knowing about the other.
 */
function sheetTravel(node: Element): number {
  const rect = node.getBoundingClientRect();
  const frame = node.closest('[data-sheet-scrim]')?.getBoundingClientRect();
  return Math.max(rect.height, (frame?.bottom ?? rect.bottom) - rect.top);
}

/**
 * Tier 2, sheets: up from below the bottom edge, and back down past it,
 * travelling the sheet's own height. Sized off the node rather than out of a
 * token, which is the whole of redesign ticket 38 - `--motion-distance-md` is
 * 24px, and 24px under an opacity fade on a 717px sheet is a crossfade with a
 * nudge in it.
 *
 * No opacity. ADR-0078's words are that a block never fades up from nothing,
 * and a solid object sliding in from off screen does not also need to appear.
 * The scrim is what announces a sheet, and it fades on the sheet's own clock
 * (Sheet.svelte).
 *
 * **The field's motion, on a sheet.** The curve is the blind's settle from
 * ticket 28 rather than a plain token: coming up it runs past its mark and
 * comes back, going down it does not, and the two decelerations are the ones
 * the blind already picks between (Alicja, on this ticket's first flipbooks:
 * "the same motion as the field ... with an overshoot when coming up from
 * below, and without one when going down"). `.sheet` carries a skirt below
 * itself so the overshoot never lifts it off the edge it stands on.
 *
 * `--dur-slow` in both directions rather than tier 2's asymmetry. That
 * asymmetry exists so a screen does not hesitate before answering and it
 * costs a fade nothing; over a whole sheet's height it is the difference
 * between about 40px between painted frames and about 110.
 *
 * Use as `in:sheetRise` and `out:sheetRise`: the two directions are two
 * curves now, and a bare `transition:` reports 'both' and would get the
 * entrance's overshoot on the way out.
 */
export function sheetRise(
  node: Element,
  _params: Record<string, never> = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  const travel = sheetTravel(node);
  return tier2((_t, u) => `transform: translateY(${travel * u}px)`, undefined, {
    duration: '--dur-slow',
    easing: travelSettle(travel, { closes: options.direction === 'out' })
  });
}

/**
 * Tier 2, sheet backdrop scrim: fade over `--dur-slow` matching sheet entrance/exit.
 *
 * Svelte's built-in `fade` reads `getComputedStyle(node).opacity`, which locks the
 * transition ceiling to intermediate values if triggered while layout or classes are in flux.
 * Using an explicit `opacity: ${t}` curve guarantees a smooth 0-to-1 / 1-to-0 transition.
 */
export function scrimFade(
  _node: Element,
  _params: Record<string, never> = {},
  _options: { direction?: Direction } = {}
): TransitionConfig {
  return tier2((t) => `opacity: ${t}`, undefined, {
    duration: '--dur-slow',
    easing: EASE_OUT
  });
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
  duration: () => motionDuration('--dur-slow'),
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
/* containerSend stays exported only for its own test (AU-09 test-only review). */
export function containerSend(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : send(node, params);
}

/* containerReceive stays exported only for its own test (AU-09 test-only
   review). */
export function containerReceive(node: Element, params: { key: unknown }) {
  return isReducedMotion() ? crossfadeOnly() : receive(node, params);
}
