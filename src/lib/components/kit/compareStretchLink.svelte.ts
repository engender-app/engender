/* The reactive half of compareStretch.ts (phase 8 features ticket 18) - the
   two liveQuery reads the rule needs (the journal's own first day, and
   whether the preceding window has anything logged in it), with the rule
   itself, the state type and the view it resolves to
   (`compareStretchNoticeProps`) all delegated to the rune-free module, the
   same split detailDraft.svelte.ts makes from detailDraft.ts.

   One factory for both call sites (tryout detail, the procedure record) so
   the two liveQuery reads and the three-way state exist once. */

import { liveQuery } from '$lib/data/live/journal.svelte';
import {
  compareStretchQuery,
  precedingWindow,
  stretchTooShortToCompare,
  type CompareStretchState,
  type EpochRange
} from '$lib/data/compareStretch';
import { answersFor, type TaggedAnswer } from './detailDraft.ts';

export type { CompareStretchState };

function windowKey(window: EpochRange): string {
  return `${window.start}:${window.end}`;
}

export function compareStretchLink(stretch: () => EpochRange | null) {
  const boundsQuery = liveQuery((j) => j.eras.getJournalBounds());

  const preceding = $derived.by<EpochRange | null>(() => {
    const s = stretch();
    return s ? precedingWindow(s) : null;
  });

  const tooShort = $derived.by(() => {
    const s = stretch();
    return s ? stretchTooShortToCompare(s, boundsQuery.value?.firstEpochDay ?? null) : true;
  });

  /* Tagged with the window it was read for, the same way detailDraft's own
     dependent reads are (the tryout entries race, detailDraft.ts): a live
     query keeps showing its previous answer across a re-run rather than
     flashing a placeholder on every write, so the round trip after
     `tooShort` clears would otherwise read the earlier "nothing to ask"
     answer as a real "nothing logged" one, over a window `stats.recap` has
     not actually answered for yet. */
  const precedingCountQuery = liveQuery((j): Promise<TaggedAnswer<number>> => {
    const window = preceding;
    if (!window || tooShort) return Promise.resolve({ for: null, value: undefined });
    const key = windowKey(window);
    return j.stats.recap(window.start, window.end).then((recap) => ({ for: key, value: recap.entryCount }));
  });
  const precedingCount = $derived(
    preceding && !tooShort && answersFor(precedingCountQuery.value, windowKey(preceding))
      ? precedingCountQuery.value
      : undefined
  );

  return {
    get state(): CompareStretchState {
      const s = stretch();
      if (!s || boundsQuery.loading) return { status: 'hidden' };
      if (tooShort) return { status: 'tooShort' };
      if (precedingCount === undefined) return { status: 'hidden' };
      if ((precedingCount.value ?? 0) === 0) return { status: 'noPrecedingData' };
      return { status: 'ready', href: compareStretchQuery(s, preceding!) };
    }
  };
}
