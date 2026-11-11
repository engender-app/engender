/* Tier 2 inside one screen: a new entry walking between its steps (tester
   report 02, tickets 03 and 04).

   A step change here is not a navigation. The editor is one screen holding
   one draft, and the header's field, the date line under it and the foot all
   stay where they are; what changes is the step's own heading on the field
   and the answers under it. Both sides of the change are real elements in
   one grid cell for the length of it (EntryEditor's `.entry-stage`), so
   nothing under them moves while they swap.

   The swap is Material's shared axis on X, which the app already runs from a
   list into its detail (Alicja chose it over a field-edge crossfade and a
   page turn on ticket 03's sign-off page, 2026-11-11). The leaving step
   slides the way the person is going and fades on --dur-fast; the arriving
   one comes from the other side on --dur-med. A sequence reads as a
   sequence, and the step a person came from is always on the side Back
   points to. `back` reverses the direction for a step back. Under reduced
   motion it is the tier-2 crossfade.

   The foot is the one thing both steps share: the finish control stays where
   it is, and only the way on (`footContinue`) opens and closes under it. */

import type { TransitionConfig } from 'svelte/transition';

import { sharedAxisX } from './navigation';
import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from './tokens';

type Direction = 'in' | 'out' | 'both';

export type StepTravelParams = {
  /** A step back: the axis runs the other way. */
  back?: boolean;
};

/** One side of a step change. Use as `in:stepTravel={...}` and
    `out:stepTravel={...}`; a bare `transition:` cannot tell them apart. */
export function stepTravel(
  node: Element,
  params: StepTravelParams = {},
  options: { direction?: Direction } = {}
): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return sharedAxisX(node, { back: !!params.back }, options);
}

/** The way on under the finish control, opening on the first step and
    closing on the second. Opens along the foot's own direction: its height
    where the foot is a column, its width where the two controls stand side
    by side (a wide window), so the finish control above or beside it is
    never moved by more than the room the way on gives up, and never in one
    frame. The wrapper carries the gap, as padding on its leading edge, so
    the gap travels with it instead of staying behind for a frame. */
export function footContinue(node: Element): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  const box = node.getBoundingClientRect();
  const parent = node.parentElement;
  const row = !!parent && getComputedStyle(parent).flexDirection === 'row';
  const size = row ? box.width : box.height;
  const gap = row && parent ? parseFloat(getComputedStyle(parent).columnGap) || 0 : 0;
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) =>
      row
        ? `overflow: hidden; flex: none; opacity: ${t}; width: ${t * size}px; margin-inline-start: ${-u * gap}px;`
        : `overflow: hidden; opacity: ${t}; height: ${t * size}px;`
  };
}
