/* Naming a recap's dimension change and top tags for display (ticket 05):
   both wrapped and on-this-day take a `Recap` and have to turn its stored
   keys - a dimension key, a tag's domain id - into the words the message
   catalogue has for them at display time. One shared transform rather than
   one per screen, since a wrapped over a range and on-this-day over a
   single day read the same `Recap` shape and want the same two answers
   from it. */

import { vocabulary } from './vocabulary/vocabulary';
import type { Recap } from './journal/stats';

export interface RecapDimChange {
  /** The gender dimension that moved furthest, already named - the screens
      say "scale" for it (CONTEXT: Gender dimension). */
  name: string;
  from: number;
  to: number;
}

export function recapDimChange(recap: Pick<Recap, 'biggestDimensionChange'>): RecapDimChange | null {
  const change = recap.biggestDimensionChange;
  if (!change) return null;
  return {
    name: vocabulary.dimensions.find((d) => d.key === change.key)?.name ?? change.key,
    from: change.from,
    to: change.to
  };
}

export function recapTopTags(recap: Pick<Recap, 'topTags'>): { label: string; count: number }[] {
  return recap.topTags.map((t) => ({ label: vocabulary.tag(t.id)?.label ?? t.id, count: t.count }));
}
