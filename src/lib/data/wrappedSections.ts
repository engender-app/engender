/* Decide which Wrapped sections have enough data to show. Return
   null for an empty section so the screen can render conditionally
   without its own thresholds. Tag insights report averages and
   movement, with wording that avoids judging tags (ADR-0012). */

import type { TagInsight } from './journal/stats';

/** How many tags a wrapped's insight section names.

    The seam already ranks them by the size of the difference and drops
    anything under three valued entries, so this is only about how many fit
    on a retrospective. Four is what the recap photo row settled on for the
    same reason - a handful rather than a list - and a fifth bar adds a row
    without adding a reading. */
/* WRAPPED_TAG_INSIGHT_CAP stays exported only for its own test. */
export const WRAPPED_TAG_INSIGHT_CAP = 4;

export interface WrappedTagInsight {
  /** The stored id. Its wording arrives at display time, through
      recapDisplay.ts, for the same reason a top tag's does: a built-in tag
      stores a key and the catalogue holds the word. Naming it here would
      pull the vocabulary - and with it the message catalogue - into a module
      whose whole job is arithmetic. */
  id: string;
  count: number;
  withAvg: number;
  withoutAvg: number;
  /** `withAvg - withoutAvg`, in the metric's own units. Signed, and that is
      all it is: which way a scale moved is not better or worse. */
  delta: number;
}

/** The tags this period has something to say about, or null for none.

    Hidden tags are already out - the seam drops them - so a tag here is one
    the person still uses. */
export function wrappedTagInsights(
  insights: TagInsight[],
  cap: number = WRAPPED_TAG_INSIGHT_CAP
): WrappedTagInsight[] | null {
  const named = insights.slice(0, cap).map((insight) => ({
    id: insight.id,
    count: insight.count,
    withAvg: insight.withAvg,
    withoutAvg: insight.withoutAvg,
    delta: insight.withAvg - insight.withoutAvg
  }));
  return named.length ? named : null;
}

