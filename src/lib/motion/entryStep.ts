/* Tier 2 inside one screen: a new entry walking between its steps (tester
   report 02, ticket 03).

   A step change here is not a navigation. The editor is one screen holding
   one draft, and the header's field, the date line under it and the foot all
   stay where they are; what changes is the step's own heading on the field
   and the answers under it. Both sides of the change are real elements in
   one grid cell for the length of it (EntryEditor's `.entry-stage`), so
   nothing under them moves while they swap.

   How the swap moves is Alicja's call on the sign-off page, so the three
   candidates live here side by side and `STEP_MOTION` names the one the
   editor uses. Each one is a pair: the step leaving and the step arriving,
   with `back` reversing the direction for a step back.

   - `axis`: Material's shared axis on X, which the app already runs from a
     list into its detail. The leaving step slides 24px the way the person is
     going and fades on --dur-fast; the arriving one comes from 24px the other
     side on --dur-med. A sequence reads as a sequence, and the step a person
     came from is always on the side Back points to.
   - `field`: setup's own step grammar (`fieldPart`): the heading travels
     12px with the field's edge and the answers crossfade in place, opacities
     summing to one so no frame is empty and none carries both solid.
   - `turn`: a page turn. The arriving step is a page sliding in from the
     window's edge over the one it replaces, which drifts a third of the way
     out under it, on --dur-slow. No fade on the page that travels: it is a
     solid object arriving, which is DIRECTION rule 10's block.

   All three fall back to the tier-2 crossfade under reduced motion. */

import type { TransitionConfig } from 'svelte/transition';

import { fieldPart, sharedAxisX } from './navigation';
import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from './tokens';

export type StepMotion = 'axis' | 'field' | 'turn';

export const STEP_MOTIONS: readonly StepMotion[] = ['axis', 'field', 'turn'];

/** The one the editor ships with. */
export const STEP_MOTION: StepMotion = 'axis';

type Direction = 'in' | 'out' | 'both';

export type StepTravelParams = {
  motion?: StepMotion;
  /** A step back: the axis and the turn run the other way. */
  back?: boolean;
  /** Printed on the field (the step's heading) rather than standing under it. */
  printed?: boolean;
};

/** How far the page under a turning page drifts, as a share of its width. */
const TURN_DRIFT = 1 / 3;

function turn(node: Element, back: boolean, direction: Direction | undefined): TransitionConfig {
  const leaving = direction === 'out';
  /* The page that travels the whole width is the later step: going forward
     it is the one arriving, going back it is the one leaving. It is painted
     over the other for the whole of the change. */
  const travels = leaving === back;
  const width = (node as HTMLElement).getBoundingClientRect?.().width || 360;
  const distance = travels ? width : width * TURN_DRIFT;
  /* Forward, both pages move left: the new one from the right edge, the
     old one a third of the way out. Back runs the film the other way. */
  const from = leaving ? 0 : back ? -distance : distance;
  const to = leaving ? (back ? distance : -distance) : 0;
  return {
    duration: motionDuration('--dur-slow'),
    easing: EASE_OUT,
    css: (t) => {
      const x = leaving ? from + (to - from) * (1 - t) : from + (to - from) * t;
      /* The page underneath dims rather than vanishing: it is covered, and
         what covers it is opaque, so its opacity only says it is behind. */
      const opacity = travels ? 1 : 0.4 + 0.6 * t;
      return `transform: translateX(${x}px); opacity: ${opacity}; z-index: ${travels ? 2 : 1}`;
    }
  };
}

/** One side of a step change. Use as `in:stepTravel={...}` and
    `out:stepTravel={...}`; a bare `transition:` cannot tell them apart. */
export function stepTravel(
  node: Element,
  params: StepTravelParams = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  const motion = params.motion ?? STEP_MOTION;
  const back = !!params.back;
  if (motion === 'field') return fieldPart(node, { printed: params.printed }, options);
  if (motion === 'turn') return turn(node, back, options.direction);
  return sharedAxisX(node, { back }, options);
}

/** The motion this build uses. A demo build reads `?stepMotion=` once, so
    the sign-off page can open the three candidates in one running app; a
    production build folds the branch away and always answers STEP_MOTION. */
export function stepMotion(search: string = typeof location === 'undefined' ? '' : location.search): StepMotion {
  if (typeof __DEMO__ === 'undefined' || !__DEMO__) return STEP_MOTION;
  const asked = new URLSearchParams(search).get('stepMotion');
  return STEP_MOTIONS.includes(asked as StepMotion) ? (asked as StepMotion) : STEP_MOTION;
}
