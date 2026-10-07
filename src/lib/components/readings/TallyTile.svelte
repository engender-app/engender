<script lang="ts">
  /* The tally's tile on the Look back door (after-release 17, UX-18). The
     screen at /tally was reached only from a day row or a chart note, so a
     person who logged misgendering from quick add had no way back to the
     counts. This is the way in, beside the body map and Compare, and like
     them it is absent where the span holds nothing to read, and like them
     it opens its screen on the span it counted.

     Two figures, never one: the counters do not combine into a score
     (stats.ts, ticket 10), so the headline is both counts in the order the
     screen draws its two charts, and the note says which is which. */
  import { m } from '$lib/paraglide/messages';
  import { fmtNumber } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { spanRangeQuery, type Span } from '$lib/data/lookBackSpan';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { heldByReadGroup, joinReadGroup, readGroup } from '$lib/components/kit/readGroup.svelte';
  import { countUp } from '$lib/motion/countUp';

  let { span }: { span: Span } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  let misgenderedQuery = liveList((j) => j.stats.tallyTrend('misgendered', from, to));
  let correctQuery = liveList((j) => j.stats.tallyTrend('correctly_gendered', from, to));
  joinReadGroup(() => !misgenderedQuery.loading && !correctQuery.loading);

  const total = (rows: { value: number }[]) => rows.reduce((sum, row) => sum + row.value, 0);
  let misgendered = $derived(total(misgenderedQuery.rows));
  let correct = $derived(total(correctQuery.rows));

  /* Each figure counts to its new value when the span moves (ADR-0078).
     ReadingTile does that for a headline that is one number; this one is
     two, so it would otherwise swap in a frame. Counted here the way
     ReadingTile counts: from 0 on arrival, held while a ReadGroup holds. */
  const group = readGroup();
  let shownMisgendered = $state(0);
  let shownCorrect = $state(0);
  let landedMisgendered: number | null = null;
  let landedCorrect: number | null = null;
  $effect(() => {
    const target = misgendered;
    if (heldByReadGroup(group)) return;
    const from = landedMisgendered ?? 0;
    landedMisgendered = target;
    return countUp(from, target, (n) => (shownMisgendered = n));
  });
  $effect(() => {
    const target = correct;
    if (heldByReadGroup(group)) return;
    const from = landedCorrect ?? 0;
    landedCorrect = target;
    return countUp(from, target, (n) => (shownCorrect = n));
  });
</script>

{#if !misgenderedQuery.loading && !correctQuery.loading && misgendered + correct > 0}
  <ReadingTile
    key="tally"
    name={m.tally_trend_title()}
    href={`/tally${spanRangeQuery(span)}`}
    headline={m.tally_tile_figures({ misgendered: fmtNumber(shownMisgendered), correct: fmtNumber(shownCorrect) })}
    note={m.tally_tile_note()}
  />
{/if}
