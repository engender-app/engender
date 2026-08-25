/* Naming a recap's dimension change and top tags for display (ticket 05):
   both wrapped and on-this-day take a `Recap` and have to turn its stored
   keys - a dimension key, a tag's domain id - into the words the message
   catalogue has for them at display time. One shared transform rather than
   one per screen, since a wrapped over a range and on-this-day over a
   single day read the same `Recap` shape and want the same two answers
   from it. */

import { vocabulary } from './vocabulary/vocabulary';
import type { Recap } from './journal/stats';
import type { WrappedTagInsight } from './wrappedSections';

export interface RecapDimChange {
  /** The gender dimension that moved furthest, already named - the screens
      say "scale" for it (CONTEXT: Gender dimension). */
  name: string;
  from: number;
  to: number;
  /** `to - from`, in the dimension's own units, signed. The seam has always
      computed it and the screens printed the two endpoints and dropped it
      (spec 06); the deleted recap screen was the only place it showed. Which
      way a gender dimension moved is not better or worse (F15), so it is a
      movement and never a gain or a loss. */
  change: number;
}

export function recapDimChange(recap: Pick<Recap, 'biggestDimensionChange'>): RecapDimChange | null {
  const change = recap.biggestDimensionChange;
  if (!change) return null;
  return {
    name: vocabulary.dimensions.find((d) => d.key === change.key)?.name ?? change.key,
    from: change.from,
    to: change.to,
    change: change.change
  };
}

export function recapTopTags(recap: Pick<Recap, 'topTags'>): { label: string; count: number }[] {
  return recap.topTags.map((t) => ({ label: vocabulary.tag(t.id)?.label ?? t.id, count: t.count }));
}

/** A wrapped's tag insights, with each tag's own wording on it.

    The arithmetic - which tags, how many, and the movement between the two
    averages - is wrappedSections.ts's; this is the same naming step
    `recapTopTags` above performs, and it lives here for the same reason: a
    built-in tag stores a key and the catalogue holds the word. */
export function nameTagInsights(insights: WrappedTagInsight[]): (WrappedTagInsight & { label: string })[] {
  return insights.map((insight) => ({
    ...insight,
    label: vocabulary.tag(insight.id)?.label ?? insight.id
  }));
}
