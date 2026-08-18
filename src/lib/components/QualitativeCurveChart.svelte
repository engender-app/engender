<script lang="ts">
  /* The qualitative curve's illustrative shape (phase 4 ticket 11).

     A dashed single line and nothing else - the opposite shape from
     HormoneBandChart.svelte beside it, on purpose: that chart is a band and
     has no path to draw a line at all, and this one is a line and has no
     band to draw. A separate component rather than a mode on either existing
     chart, so neither can be asked to draw the other's presentation by
     passing it a different prop.

     No result marks here, unlike HormoneBandChart. Before a per-user fit is
     applied this curve's own values are an invented amplitude with no
     pg/mL meaning at all - plotting a real lab result against them would
     show a number next to a shape that cannot honestly be compared to it.
     `unitLabel` being null is how the caller says the axis has no honest
     numbers to print yet: no ticks, no unit, just the shape's rise and fall.
     Once a fit exists the caller passes real values and CURVE_UNIT instead,
     and the axis prints normally.

     A dumb renderer otherwise, like HormoneBandChart.svelte: it takes
     numbers and a formatter and knows nothing about routes or fits. The
     wording, and paraglide, stay with the caller. */

  import { scaleLinear } from 'd3-scale';
  import { line as d3line } from 'd3-shape';

  interface CurvePoint {
    day: number;
    value: number;
  }

  let {
    points,
    max = 400,
    height = 150,
    width = 320,
    formatValue,
    unitLabel,
    ariaLabel
  }: {
    points: CurvePoint[];
    max?: number;
    height?: number;
    width?: number;
    formatValue: (value: number) => string;
    /** Null before a fit gives this curve's height an honest unit - see the
        file header. */
    unitLabel: string | null;
    ariaLabel: string;
  } = $props();

  const P = 8;
  const AXIS = 34;

  let chart = $derived.by(() => {
    if (points.length < 2) return null;

    const x0 = points[0].day;
    const x1 = points[points.length - 1].day;
    const left = unitLabel !== null ? AXIS : P;
    const x = scaleLinear().domain([x0, Math.max(x0 + 1, x1)]).range([left, width - P]);
    const y = scaleLinear().domain([0, max]).range([height - P, P]);

    const line = d3line<CurvePoint>().x((p) => x(p.day)).y((p) => y(p.value))(points) ?? '';
    const ticks = unitLabel !== null ? y.ticks(4).filter((value) => value >= 0 && value <= max) : [];

    return {
      line,
      left,
      ticks: ticks.map((value) => ({ value, y: y(value) }))
    };
  });
</script>

{#if chart}
  <svg
    class="qual-chart"
    viewBox="0 0 {width} {height}"
    preserveAspectRatio="none"
    role="img"
    aria-label={ariaLabel}
  >
    {#if unitLabel !== null}
      <text x={chart.left - 5} y={P - 1} class="qual-axis-label" text-anchor="end">{unitLabel}</text>
      {#each chart.ticks as tick (tick.value)}
        <line x1={chart.left} x2={width - P} y1={tick.y} y2={tick.y} class="chart-gridline" />
        <text x={chart.left - 5} y={tick.y + 3.5} class="qual-axis-label" text-anchor="end">{formatValue(tick.value)}</text>
      {/each}
    {/if}

    <path d={chart.line} class="qual-line" />
  </svg>
{/if}

<style>
  .qual-chart {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  /* Dashed and muted rather than HormoneBandChart's solid accent-toned edge:
     the one thing this chart must not do is read, at a glance, like the
     fitted band beside it. */
  .qual-line {
    fill: none;
    stroke: var(--text-2);
    stroke-width: 1.75;
    stroke-dasharray: 5 4;
  }

  .qual-axis-label {
    fill: var(--text-2);
    font-size: 10px;
  }
</style>
