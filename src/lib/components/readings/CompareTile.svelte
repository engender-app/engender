<script lang="ts">
  /* Compare's tile on the Look back door (phase 11 ticket 07). The screen
     is `/compare`, carrying the span, which opens on this span against the
     same-length stretch before it (pre-release-human ticket 21).

     The headline is what /compare leads with: how far the scale that moved
     furthest for its range moved between the stretch before and this one,
     earlier to later, never coloured (ADR-0012), with the scale named in
     the note. It
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
  import { readSide, scaleSides } from '$lib/data/compareSides';
  import { biggestChange } from '$lib/data/periodComparison';
  import { nativeValue } from '$lib/data/wrappedDisplay';
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

  /* The figure and what it is a figure of, apart: the change as the
     headline and the scale's name in the note under it, the way every other
     tile on the door pairs them (DayByDay's value over "Średnia: ...").
     Written as one headline the name wrapped onto the figure's line at
     tile width and the two read as one word (round 3). */
  let reading = $derived.by(() => {
    const sides = sidesQuery.value;
    if (!sides) return undefined;
    const [now, earlier] = sides;
    const scales = scaleSides(now, earlier, vocabulary.activeDimensions, m.mood());
    const moved = biggestChange(scales);
    if (moved && moved.a !== null && moved.b !== null) {
      return {
        headline: m.compare_tile_headline({ from: nativeValue(moved.key, moved.b), to: nativeValue(moved.key, moved.a) }),
        name: moved.name
      };
    }
    return {
      headline: m.compare_tile_headline({ from: String(earlier.entryCount), to: String(now.entryCount) }),
      name: m.compare_entries_label()
    };
  });
</script>

{#if !short}
  <ReadingTile
    key="compare"
    name={m.compare_title()}
    href={`/compare${spanRangeQuery(span)}`}
    headline={reading?.headline}
    note={reading ? m.compare_tile_note({ name: reading.name }) : undefined}
  />
{/if}
