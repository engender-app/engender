<script lang="ts">
  /* Compare's tile on the Look back door (phase 11 ticket 07). The screen
     is `/compare`, carrying the span, which opens on this span against the
     same-length stretch before it (pre-release-human ticket 21).

     The headline is what /compare leads with: the scale that moved
     furthest for its range between the stretch before and this one,
     earlier to later, signed by order and never coloured (ADR-0012). It
     used to be the earlier stretch's two dates, which told nobody
     anything. Where no scale has a value in both stretches the tile says
     the stretch before's entry count against this one's instead, the same
     fallback the screen takes.

     Absent where the stretch before would fall before the journal's first
     day (stretchTooShortToCompare): a comparison with nothing on one side
     is not a reading. */
  import { m } from '$lib/paraglide/messages';
  import { precedingWindow, stretchTooShortToCompare } from '$lib/data/compareStretch';
  import { spanRangeQuery, type Span } from '$lib/data/lookBackSpan';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { readSide } from '$lib/data/compareSides';
  import { biggestChange } from '$lib/data/periodComparison';
  import { MOOD_RANGE } from '$lib/data/metricRange';
  import { nativeAmount, nativeValue } from '$lib/data/wrappedDisplay';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';

  let {
    span,
    firstEntryDay
  }: {
    span: Span;
    /** The journal's first day, or null while unknown or for a journal
        with nothing dated yet. */
    firstEntryDay: number | null;
  } = $props();

  let before = $derived(precedingWindow(span));
  let short = $derived(stretchTooShortToCompare(span, firstEntryDay));

  let sidesQuery = liveQuery((j) => {
    const now = span;
    const earlier = before;
    const keys = vocabulary.activeDimensions.map((d) => d.key);
    return Promise.all([readSide(j, now, keys, { scalesOnly: true }), readSide(j, earlier, keys, { scalesOnly: true })]);
  });

  /* The tile arrives with the others once its headline is known, rather
     than drawing a blank figure and filling it a moment later. */
  joinReadGroup(() => short || !sidesQuery.loading);

  let headline = $derived.by(() => {
    const sides = sidesQuery.value;
    if (!sides) return undefined;
    const [now, earlier] = sides;
    // Ranked at the precision the screen prints, so the two agree.
    const at = (key: string, value: number | null | undefined) => (value == null ? null : nativeAmount(key, value));
    const scales = [
      { key: 'mood', name: m.mood(), ...MOOD_RANGE, a: at('mood', now.scales.mood), b: at('mood', earlier.scales.mood) },
      ...vocabulary.activeDimensions.map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max, a: at(d.key, now.scales[d.key]), b: at(d.key, earlier.scales[d.key]) }))
    ];
    const moved = biggestChange(scales);
    if (moved && moved.a !== null && moved.b !== null) {
      return m.compare_tile_headline({ name: moved.name, from: nativeValue(moved.key, moved.b), to: nativeValue(moved.key, moved.a) });
    }
    return m.compare_tile_headline({ name: m.compare_entries_label(), from: String(earlier.entryCount), to: String(now.entryCount) });
  });
</script>

{#if !short}
  <ReadingTile
    key="compare"
    name={m.compare_title()}
    href={`/compare${spanRangeQuery(span)}`}
    headline={headline}
    note={m.lookback_compare_before()}
  />
{/if}
