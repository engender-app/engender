/* The things wrapped could already have said and did not (phase 5 UX
   ticket 23, closing spec 06).

   The stats seam computes more than wrapped asked it for. Tag insights -
   which tags went with better or worse days - is the most wrapped-shaped
   read in the codebase and wrapped never called it. The signed movement on
   the dimension change wrapped already printed the endpoints of is
   another. The tally trend was the third, until the tally was removed.

   What is here is the conditional and nothing else: whether a period has
   anything to say for a section. That is the part worth testing, because it
   is what keeps a thin period from rendering a column of empty cards, and
   it is the same rule wrapped's existing sections already follow one card
   at a time. Every function answers null for "no section", so a screen
   writes `{#if x}` and never a threshold of its own.

   Nothing here interprets. A tag insight carries the two averages and the
   movement between them; it does not name a tag good or bad. Neither
   does the caller, and ADR-0012 and docs/ui-copy.md are why. */

import type { TagInsight } from './journal/stats';

/** How many tags a wrapped's insight section names.

    The seam already ranks them by the size of the difference and drops
    anything under three valued entries, so this is only about how many fit
    on a retrospective. Four is what the recap photo row settled on for the
    same reason - a handful rather than a list - and a fifth bar adds a row
    without adding a reading. */
/* WRAPPED_TAG_INSIGHT_CAP stays exported only for its own test (AU-09
   test-only review). */
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

