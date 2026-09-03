/* The reactive half of compareStretch.ts (phase 8 features ticket 18) - the
   two liveQuery reads the rule needs (the journal's own first day, and
   whether the preceding window has anything logged in it), with the rule
   itself delegated to the rune-free module, the same split
   detailDraft.svelte.ts makes from detailDraft.ts.

   One factory for both call sites (tryout detail, the procedure record) so
   the two liveQuery reads and the three-way state exist once. */

import { liveQuery } from '$lib/data/live/journal.svelte';
import { compareStretchQuery, precedingWindow, stretchTooShortToCompare, type EpochRange } from '$lib/data/compareStretch';

export type CompareStretchState =
  | { status: 'hidden' }
  | { status: 'tooShort' }
  | { status: 'noPrecedingData' }
  | { status: 'ready'; href: string };

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

  /* Not read until the bounds answer has landed and cleared the stretch as
     not too short - the same reason detailDraft's own dependent read waits
     on its owner (the tryout entries race, detailDraft.ts). */
  const precedingCountQuery = liveQuery((j) => {
    const window = preceding;
    if (!window || tooShort) return Promise.resolve(null);
    return j.stats.recap(window.start, window.end).then((recap) => recap.entryCount);
  });

  return {
    get state(): CompareStretchState {
      const s = stretch();
      if (!s || boundsQuery.loading) return { status: 'hidden' };
      if (tooShort) return { status: 'tooShort' };
      if (precedingCountQuery.loading) return { status: 'hidden' };
      if ((precedingCountQuery.value ?? 0) === 0) return { status: 'noPrecedingData' };
      return { status: 'ready', href: compareStretchQuery(s, preceding!) };
    }
  };
}
