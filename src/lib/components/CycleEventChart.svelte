<!-- The cycle event chart (phase 5 ticket 03, CONTEXT: "Cycle event"): cycle
     events plotted as points on a day axis, with the person's regimen
     episode history drawn as background bands behind them - so a period's
     retreat (or continuation) after a regimen episode starts is something
     the axis shows on its own, with no forecast or fertility framing added
     on top. The same single-track shape EffectsTimeline uses, scaled to one
     row: a baseline, bands (here: episode ranges instead of literature
     windows) and discrete markers (here: one per logged event, kind told
     apart by color rather than by which of several rows it sits on, since
     there is no fixed set of rows the way personal effects has one per
     marker).

     Purely a renderer, the same philosophy EffectsTimeline and LineChart
     state for themselves: the caller resolves every label via
     cycleEventKindName, and this file adds only its own fixed legend
     wording. Decorative only - the textual list the caller renders
     alongside this is what a screen reader needs. -->
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
    stroke: var(--border);
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
    border-radius: var(--radius-sm);
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
