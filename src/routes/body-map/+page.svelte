<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  let regions = $derived(vocabulary.bodyRegions);
  let region = $state(vocabulary.bodyRegions[0]?.key ?? '');
  $effect(() => {
    if (regions.length && !regions.some((r) => r.key === region)) region = regions[0].key;
  });

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let trendQuery = liveQuery(['entry'], (j) => j.stats.bodyRegionTrend(region, from, today));
  let trend = $derived(trendQuery.value ?? []);
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/stats" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.body_map_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.body_map_sub()}</p>

  {#if regions.length}
    <Segmented
      name={m.body_regions_group()}
      options={regions.map((r) => ({ value: r.key, label: r.name }))}
      value={region}
      onChange={(v) => (region = v)}
    />

    <div class="segmented" role="radiogroup" aria-label={m.stats_range_group()} style="margin:var(--space-4) 0">
      {#each RANGES as r (r)}
        <button
          class="segment"
          class:is-active={r === range}
          role="radio"
          aria-checked={r === range}
          onclick={() => (range = r)}>{m.range_days({ days: String(r) })}</button
        >
      {/each}
    </div>

    {#if trendQuery.loading}
      <Skeleton variant="block" count={1} />
    {:else}
      <div class="card chart-card">
        <div class="spread">
          <span class="chart-title">{regions.find((r) => r.key === region)?.name}</span>
        </div>
        <LineChart points={trend} min={BODY_REGION_INTENSITY_MIN} max={BODY_REGION_INTENSITY_MAX} />
      </div>
    {/if}
  {/if}
</div>
