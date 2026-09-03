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
  import type { Role } from '$lib/theme/roles';

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
    ariaLabel,
    highlight
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
    /** Which positions on the shared x axis carry the chosen presentation
        (phase 8 features ticket 17, ADR-0048), in the same units `day`
        already is here - the caller places, this chart only draws, the
        same division of labour `wearMax` keeps. Its own row of marks along
        the baseline rather than a mark on either line: a highlighted day
        may carry wear data, region data, both or neither, since the two
        series and a presentation are three independent reads of the same
        days. */
    highlight?: { positions: number[]; role: Role };
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
      wearTickY: (v: number) => yWear(v),
      // Off the plot's own domain rather than the wear/region days: a
      // highlighted day past either series' last reading is still on the
      // axis and still worth marking.
      highlighted: (highlight?.positions ?? [])
        .filter((p) => p >= x0 && p <= x1)
        .map((p) => x(p))
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
    {#if highlight}
      {#each chart.highlighted as hx (hx)}
        <circle class="wear-trend-highlight" cx={hx} cy={height - P} r="3" style:fill={highlight.role.mark} />
      {/each}
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

  /* The presentation chip's mark (ticket 17, ADR-0048): a dot on the
     baseline both lines already share, at less than full strength so it
     reads as a mark on the axis rather than as a third series - a
     highlighted day may carry no reading on either line at all. The
     surface-coloured ring is the same separation the area chart's own
     scrub dot draws against the card underneath it. */
  .wear-trend-highlight {
    fill-opacity: 0.55;
    stroke: var(--surface);
    stroke-width: 1;
  }
</style>
