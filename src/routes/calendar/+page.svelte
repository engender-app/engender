<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthYear } from '$lib/data/dates';
  import Icon from '$lib/components/Icon.svelte';
  import HeatMap from '$lib/components/HeatMap.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);
  let monthLabel = $derived(fmtMonthYear(year, month));
  /* NAV-007: this hint used to send people to Home just to reach the same
     picker Settings offers in a sheet - two different destinations for one
     setting, on the one screen actually showing the colours it changes.
     Calendar now opens the same kind of sheet in place. */
  let metricSheetOpen = $state(false);

  function step(delta: number) {
    let mo = month + delta;
    if (mo < 0) {
      mo = 11;
      year--;
    }
    if (mo > 11) {
      mo = 0;
      year++;
    }
    month = mo;
  }
</script>

<div class="screen">
  <header class="screen-header">
    <h1 class="screen-title">{m.nav_calendar()}</h1>
    <div class="header-action">
      <a class="icon-btn" href="/search" aria-label={m.search()}><Icon name="search" size={22} /></a>
    </div>
  </header>

  <div class="cal-monthbar">
    <button class="icon-btn" aria-label={m.prev_month()} onclick={() => step(-1)}><Icon name="chevronLeft" size={22} /></button>
    <h2 class="cal-month">{monthLabel}</h2>
    <button class="icon-btn" aria-label={m.next_month()} onclick={() => step(1)}><Icon name="chevronRight" size={22} /></button>
  </div>
  <p class="muted small" style="text-align:center;margin-bottom:var(--space-4)">
    {m.coloured_by()} <strong>{metricName}</strong> —
    <button class="metric-chip" style="display:inline-flex;padding:0" onclick={() => (metricSheetOpen = true)}>{m.change_metric()}</button>
  </p>

  <div class="card">
    <HeatMap {year} {month} />
    <!-- The ends are the metric's own words, never "worst" and "best":
         neither end of binary↔nonbinary is the better one, and colour that
         judges is the one thing this app cannot do (ADR-0012, F15). -->
    <div class="heat-legend" aria-label={m.heat_legend_aria({ metric: metricName, low: legend.low, high: legend.high })}>
      <span class="legend-end">{legend.low}</span>
      {#each [1, 2, 3, 4] as i (i)}<span class="legend-swatch" style="background:var(--heat-{i})"></span>{/each}
      <span class="legend-end">{legend.high}</span>
      <span class="legend-none"><span class="legend-swatch" style="background:var(--heat-0)"></span> {m.legend_none()}</span>
    </div>
  </div>
  <p class="muted small" style="margin-top:var(--space-4)">{m.heat_hint({ metric: metricName })}</p>

  <Sheet bind:open={metricSheetOpen} title={m.colour_days_by()}>
    <h3>{m.colour_days_by()}</h3>
    <div class="list-group" style="box-shadow:none">
      {#each [{ key: null, name: m.mood() }, ...vocabulary.activeDimensions] as d (d.key ?? 'mood')}
        <button
          class="list-row"
          onclick={() => {
            selectMetric(d.key);
            metricSheetOpen = false;
          }}
        >
          <span class="row-text"><span class="row-title">{d.name}</span></span>
          {#if prefs.metricDimension === d.key}<Icon name="check" size={20} />{/if}
        </button>
      {/each}
    </div>
    <p class="muted small" style="margin-top:var(--space-3)">{m.metric_note()}</p>
  </Sheet>
</div>
