<script lang="ts">
  /* The body map's tile on the Look back door (phase 11 ticket 07). The
     screen is `/body-map`, which took the span in redesign ticket 05; this
     is only the way in, with the region marked most often in the span as
     its figure and where that region's reading mostly sat under it. A
     tile only: the screen already exists and this component draws nothing
     of it. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { mostMarkedRegion } from '$lib/data/lookBackReadings';
  import { spanRangeQuery, type Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';

  let { span }: { span: Span } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);

  let mapQuery = liveList((j) => j.stats.bodyRegionMap(from, to));
  let region = $derived(mostMarkedRegion(mapQuery.rows));
  let regionName = $derived(
    region ? (vocabulary.visibleBodyRegions.find((r) => r.id === region.region)?.name ?? region.region) : ''
  );
  /* Which way the region mostly sat, and how strongly: the figure's own
     line. A region that went both ways evenly has no side, and says only
     how often it was marked. */
  let note = $derived.by(() => {
    if (!region) return '';
    if (region.side === null || region.value === null) return m.n_entries({ n: region.count });
    const axis = region.side === 'dysphoria' ? m.body_region_axis_dysphoria() : m.body_region_axis_euphoria();
    return `${axis} ${Math.round(region.value)}`;
  });
</script>

{#if !mapQuery.loading && region}
  <ReadingTile key="body-map" name={m.body_map_title()} href={`/body-map${spanRangeQuery(span)}`} headline={regionName} {note} />
{/if}
