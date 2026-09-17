/* Which way a change goes, and what that is called on screen.

   Three of them, and the catalogue's own `direction` is optional - an entry
   somebody wrote for themselves has no direction at all - so `other` is
   both a real direction and where an absent one lands.

   One home because two surfaces on /care/changes read it: the
   grouped list below, which heads a section with the name, and the axis
   above it, which colours a mark by it and names the colours in its legend.
   Two copies of a three-arm if that returns copy is two places to add a
   fourth direction and one place to forget it. */

import { m } from '$lib/paraglide/messages';

/** In the order both surfaces show them. */
export const EFFECT_DIRECTIONS = ['feminizing', 'masculinizing', 'other'] as const;

export type EffectDirection = (typeof EFFECT_DIRECTIONS)[number];

export function effectDirectionLabel(direction: EffectDirection): string {
  if (direction === 'feminizing') return m.effects_direction_feminizing();
  if (direction === 'masculinizing') return m.effects_direction_masculinizing();
  return m.effects_direction_other();
}
