/* A per-instance memo for the hormone curve models (phase 5 performance
   audit finding 06, ticket 04). esterCurves and qualitativeCurves are pure
   over their doses, episodes and window, but the screen re-asks for them on
   every window switch and on every render that only changed the fit switch
   or added a lab result - none of which the population model itself depends
   on. That re-ran roughly 60ms of modelling on a desktop for the same
   answer, and about four times that on the phone the audit throttled to.

   Keyed on the caller's own key - the window, or window plus drug - rather
   than a single slot, so switching between windows keeps every window's
   last answer instead of evicting it: going 180 -> 30 -> 180 models twice,
   not three times.

   180 days is not used to derive 30 and 90 instead of caching all three.
   Both models sample a fixed count of points spread evenly across whichever
   window they are asked for (BAND_SAMPLES / SHAPE_SAMPLES), so a 30-day
   slice of the 180-day result sits at a coarser spacing than a 30-day
   result computed directly - a different set of plotted points, not the
   same curve read narrower. Deriving one from the other would be exactly
   the kind of change to a plotted value this ticket may not make, so each
   window gets its own cache slot instead.

   Invalidated by comparing a full JSON encoding of the inputs rather than a
   hand-picked set of fields such as dose amount or episode start day: doses
   and episodes are re-read from the database on every call regardless (that
   read is not what is expensive here, and this ticket leaves it alone), so
   the comparison costs a modest string next to the model it is guarding,
   and a field this cache does not know about can never go stale silently -
   which is the risk a hand-picked comparator would carry every time a field
   was added to DoseEvent or RegimenEpisode without this file's own author
   knowing to update it. */

interface ModelMemo<Result> {
  /** Returns the cached `Result` for `key` when `inputs` encodes the same as
      the last call for that key; otherwise calls `compute`, caches it under
      `key` and returns it. */
  remember(key: string, inputs: unknown, compute: () => Result): Result;
}

export function createModelMemo<Result>(): ModelMemo<Result> {
  const cache = new Map<string, { fingerprint: string; result: Result }>();

  return {
    remember(key, inputs, compute) {
      const fingerprint = JSON.stringify(inputs);
      const cached = cache.get(key);
      if (cached && cached.fingerprint === fingerprint) return cached.result;

      const result = compute();
      cache.set(key, { fingerprint, result });
      return result;
    }
  };
}
