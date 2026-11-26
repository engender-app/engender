/* Tier 3 motion swaps glyphs inside a clipped block (DIRECTION.md rule 10).
   A keyed update mounts the new face while the old leaves. Each face uses
   only a transform, with --dur-med and --ease-out.

   dir: 1 moves vertical faces up as a value increases; dir: -1 moves them
   down. The DatePicker's month title uses axis: 'x', moving left for the next
   month. Reduced motion fades the faces in place. */
import type { TransitionConfig } from 'svelte/transition';
import { crossfadeDuration, EASE_OUT, fadeOnly, isReducedMotion, motionDuration } from './tokens';

type Turn = { dir?: 1 | -1; axis?: 'x' | 'y' };

/** The new face, rising in from under the block's bottom edge (or dropping
    in over its top edge, turning the other way). */
export function drumIn(_node: Element, { dir = 1, axis = 'y' }: Turn = {}): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => face(axis, dir * u * 100)
  };
}

/** The old face, rising out through the block's top edge (or falling out
    through its bottom one). */
export function drumOut(_node: Element, { dir = 1, axis = 'y' }: Turn = {}): TransitionConfig {
  if (isReducedMotion()) return fadeOnly(crossfadeDuration());
  return {
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t, u) => face(axis, -dir * u * 100)
  };
}

/* Two decimals, as the wipe writes its inset: whole percents stepped a
   48px travel in visible half-pixel jumps, and a round frame still writes
   as a round value. */
const round = (n: number) => Number(n.toFixed(2));

const face = (axis: 'x' | 'y', percent: number) =>
  axis === 'x' ? `translate: ${round(percent)}% 0` : `translate: 0 ${round(percent)}%`;
