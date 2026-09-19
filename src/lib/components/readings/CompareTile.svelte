<script lang="ts">
  /* Compare's tile on the Look back door (phase 11 ticket 07). The screen
     is `/compare`, carrying the span to offer the explicit preceding-span
     shortcut (phase 11 ticket 32) without losing manual choices. The tile's
     figure is that stretch's two dates, since the span's own are written
     under the rail already.

     Absent where the stretch before would fall before the journal's first
     day (stretchTooShortToCompare): a comparison with nothing on one side
     is not a reading. No delta and no ranking anywhere here (ADR-0012). */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { precedingWindow, stretchTooShortToCompare } from '$lib/data/compareStretch';
  import { spanRangeQuery, type Span } from '$lib/data/lookBackSpan';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';

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
  const day = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });
</script>

{#if !short}
  <ReadingTile
    key="compare"
    name={m.compare_title()}
    href={`/compare${spanRangeQuery(span)}`}
    headline={m.wrapped_week_range({ from: day(before.start), to: day(before.end) })}
    note={m.lookback_compare_before()}
  />
{/if}
