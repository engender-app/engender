<script lang="ts">
  /* Wear time against body-region intensity, on one chart (phase 5 ticket
     04). Two independent series sharing an x axis (day) but never a y
     scale: wear time is hours and intensity is 0-100, so forcing them onto
     one axis would either flatten the hours line or blow the intensity one
     off the top. Left axis is hours, right is intensity - the same "two
     series, two edges" shape HormoneBandChart's band-plus-lab-points takes,
     just as two lines instead of a band and marks.

     A dumb renderer, like LineChart and HormoneBandChart beside it: it
     takes numbers and formatters and knows nothing about wear sessions or
     body regions. The wording, and paraglide, stay with the caller. */

  import { scaleLinear } from 'd3-scale';
  import { line as d3line } from 'd3-shape';

  interface Point {
    day: number;
    value: number;
  }

  let {
    wearPoints,
    regionPoints,
    wearMax,
    regionMin = 0,
    regionMax = 100,
    height = 150,
    width = 320,
    ariaLabel
  }: {
    wearPoints: Point[];
    regionPoints: Point[];
    /** The hours axis's ceiling. Left to the caller rather than computed
        here from the data, so the axis stays put as the range picker moves
        and a shallow week does not zoom in on noise. */
    wearMax: number;
    regionMin?: number;
    regionMax?: number;
    height?: number;
    width?: number;
    ariaLabel: string;
  } = $props();

  const P = 8;
  const AXIS = 30;

  let chart = $derived.by(() => {
    const days = [...wearPoints, ...regionPoints].map((p) => p.day);
    if (days.length < 2) return null;
    const x0 = Math.min(...days);
    const x1 = Math.max(...days);

    const x = scaleLinear().domain([x0, Math.max(x0 + 1, x1)]).range([AXIS, width - AXIS]);
    const yWear = scaleLinear().domain([0, Math.max(wearMax, 1)]).range([height - P, P]);
    const yRegion = scaleLinear().domain([regionMin, regionMax]).range([height - P, P]);

    const wearLine = d3line<Point>().x((p) => x(p.day)).y((p) => yWear(p.value));
    const regionLine = d3line<Point>().x((p) => x(p.day)).y((p) => yRegion(p.value));

    return {
      wear: wearPoints.length >= 2 ? (wearLine(wearPoints) ?? '') : null,
      region: regionPoints.length >= 2 ? (regionLine(regionPoints) ?? '') : null,
      wearTicks: yWear.ticks(3),
      wearTickY: (v: number) => yWear(v)
    };
  });
</script>

{#if chart}
  <svg class="wear-trend-chart" viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
    {#each chart.wearTicks as tick (tick)}
      <line x1={AXIS} x2={width - P} y1={chart.wearTickY(tick)} y2={chart.wearTickY(tick)} class="chart-gridline" />
      <text x={AXIS - 4} y={chart.wearTickY(tick) + 3.5} class="wear-axis-label" text-anchor="end">{tick}</text>
    {/each}

    {#if chart.region}
      <path d={chart.region} class="wear-trend-region" />
    {/if}
    {#if chart.wear}
      <path d={chart.wear} class="wear-trend-wear" />
    {/if}
  </svg>
{:else}
  <div class="chart-too-little">{ariaLabel}</div>
{/if}

<style>
  .wear-trend-chart {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  .wear-trend-wear {
    fill: none;
    stroke: var(--chart-line);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* accent-2 rather than a second chart token: the app already reaches for
     it whenever two things need telling apart at a glance (screens.css's
     gradients, the calendar's today-dot). */
  .wear-trend-region {
    fill: none;
    stroke: var(--accent-2);
    stroke-width: 2;
    stroke-dasharray: 4 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .wear-axis-label {
    fill: var(--text-2);
    font-size: 10px;
  }
</style>
