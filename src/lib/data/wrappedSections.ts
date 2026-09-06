/* The four things wrapped could already have said and did not (phase 5 UX
   ticket 23, closing spec 06).

   The stats seam computes more than wrapped asked it for. Tag insights -
   which tags went with better or worse days - is the most wrapped-shaped
   read in the codebase and wrapped never called it. The tally trend and the
   signed movement on the dimension change wrapped already printed the
   endpoints of are the other two.

   What is here is the conditional and nothing else: whether a period has
   anything to say for a section. That is the part worth testing, because it
   is what keeps a thin period from rendering a column of empty cards, and
   it is the same rule wrapped's existing sections already follow one card
   at a time. Every function answers null for "no section", so a screen
   writes `{#if x}` and never a threshold of its own.

   Nothing here interprets. A tag insight carries the two averages and the
   movement between them; it does not name a tag good or bad. A tally
   carries two counts; it computes no ratio and names no direction. Neither
   does the caller, and ADR-0012 and docs/ui-copy.md are why. */

import type { DayAverage, Recap, TagInsight } from './journal/stats';

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

export interface WrappedTallyCounts {
  misgendered: number;
  correctlyGendered: number;
}

/** The two tally counts over the period, or null where neither was tapped.

    Summed rather than charted: the trend seam answers one point per day a
    kind was logged, and what a retrospective wants from it is how many
    times, over the period, each happened. Two counts, side by side, with no
    ratio between them and no direction named - the two counters never
    combine into a score (stats.ts, ticket 10), and a wrapped is the surface
    where that rule is most tempting to break.

    Null only when both are zero. One kind logged and the other not is a
    real answer and the section shows it, because "nobody misgendered you
    this month" is exactly the kind of thing a retrospective is for. */
export function wrappedTallyCounts(
  misgendered: DayAverage[],
  correctlyGendered: DayAverage[]
): WrappedTallyCounts | null {
  const total = (points: DayAverage[]) => points.reduce((sum, point) => sum + point.value, 0);
  const counts = { misgendered: total(misgendered), correctlyGendered: total(correctlyGendered) };
  return counts.misgendered || counts.correctlyGendered ? counts : null;
}

