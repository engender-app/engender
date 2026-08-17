<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let misgenderedQuery = liveQuery(['tally'], (j) => j.stats.tallyTrend('misgendered', from, today));
  let misgendered = $derived(misgenderedQuery.value ?? []);
  let correctlyGenderedQuery = liveQuery(['tally'], (j) => j.stats.tallyTrend('correctly_gendered', from, today));
  let correctlyGendered = $derived(correctlyGenderedQuery.value ?? []);

  // The two counters never combine into one score (ticket 10), but they do
  // share a y-axis: a chart's own max would make one day's single tap look
  // as tall as another day's five.
  let maxCount = $derived(Math.max(1, ...misgendered.map((p) => p.value), ...correctlyGendered.map((p) => p.value)));
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/stats" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.tally_trend_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.tally_trend_sub()}</p>

  <div class="segmented" role="radiogroup" aria-label={m.stats_range_group()} style="margin-bottom:var(--space-4)">
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

  {#if misgenderedQuery.loading || correctlyGenderedQuery.loading}
    <Skeleton variant="block" count={2} />
  {:else}
    <div class="card chart-card">
      <div class="spread">
        <span class="chart-title">{m.tally_misgendered()}</span>
      </div>
      <LineChart points={misgendered} min={0} max={maxCount} />
    </div>
    <div class="card chart-card" style="--chart-line:var(--chart-line-2);--chart-fill:var(--chart-fill-2)">
      <div class="spread">
        <span class="chart-title">{m.tally_correctly_gendered()}</span>
      </div>
      <LineChart points={correctlyGendered} min={0} max={maxCount} />
    </div>
  {/if}
</div>
