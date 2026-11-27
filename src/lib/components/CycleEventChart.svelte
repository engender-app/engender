<!-- Plot logged cycle events on a day axis over regimen bands. Colour labels
     kind and the caller supplies each event name. Keep the figure decorative
     because the accompanying list carries the information for assistive tech. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { scaleLinear } from 'd3-scale';
  import { cycleEventKindName } from '$lib/data/vocabulary/labels';
  import type { CycleEventKind } from '$lib/data/types';

  export interface CycleChartEvent {
    epochDay: number;
    kind: CycleEventKind;
  }

  export interface RegimenBand {
    /** Clipped to the chart's own range by the caller - this file draws
        exactly what it is given. */
    startEpochDay: number;
    endEpochDay: number;
  }

  let {
    fromEpochDay,
    toEpochDay,
    bands,
    events
  }: {
    fromEpochDay: number;
    toEpochDay: number;
    bands: RegimenBand[];
    events: CycleChartEvent[];
  } = $props();

  const WIDTH = 320;
  const P = 4;
  const HEIGHT = 64;
  const BAND_H = 16;
  const BAND_Y = (HEIGHT - BAND_H) / 2;

  let x = $derived(
    scaleLinear()
      .domain([fromEpochDay, Math.max(fromEpochDay + 1, toEpochDay)])
      .range([P, WIDTH - P])
  );

  const KIND_CLASS: Record<CycleEventKind, string> = {
    period_occurred: 'marker-period',
    spotting: 'marker-spotting',
    nothing_this_month: 'marker-nothing'
  };
</script>

<div class="cycle-event-chart">
  <svg class="chart-track" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
    <line class="track-baseline" x1={P} x2={WIDTH - P} y1={HEIGHT / 2} y2={HEIGHT / 2} />
    {#each bands as band, i (i)}
      <rect
        class="band-regimen"
        x={x(Math.max(band.startEpochDay, fromEpochDay))}
        y={BAND_Y}
        width={Math.max(0, x(Math.min(band.endEpochDay, toEpochDay)) - x(Math.max(band.startEpochDay, fromEpochDay)))}
        height={BAND_H}
      />
    {/each}
    {#each events as event, i (i)}
      <circle class="marker {KIND_CLASS[event.kind]}" cx={x(event.epochDay)} cy={HEIGHT / 2} r="5" />
    {/each}
  </svg>

  <div class="cycle-event-chart-legend">
    <span class="legend-item"><span class="legend-swatch swatch-regimen"></span>{m.cycle_event_chart_regimen_legend()}</span>
    <span class="legend-item"><span class="legend-swatch swatch-period"></span>{cycleEventKindName('period_occurred')}</span>
    <span class="legend-item"><span class="legend-swatch swatch-spotting"></span>{cycleEventKindName('spotting')}</span>
    <span class="legend-item"><span class="legend-swatch swatch-nothing"></span>{cycleEventKindName('nothing_this_month')}</span>
  </div>
</div>

<style>
  .cycle-event-chart {
    --band-regimen: color-mix(in oklab, var(--accent) 20%, var(--surface));
  }
  .chart-track {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .track-baseline {
    stroke: var(--outline);
    stroke-width: 1;
  }
  .band-regimen {
    fill: var(--band-regimen);
  }
  .marker {
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .marker-period {
    fill: var(--accent);
  }
  .marker-spotting {
    fill: var(--text-2);
  }
  .marker-nothing {
    fill: none;
    stroke: var(--text-2);
  }
  .cycle-event-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-2);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
  }
  .swatch-regimen {
    border-radius: var(--r-block);
    background: var(--band-regimen);
  }
  .swatch-period {
    background: var(--accent);
  }
  .swatch-spotting {
    background: var(--text-2);
  }
  .swatch-nothing {
    background: var(--surface);
    border: 1.5px solid var(--text-2);
  }
</style>
