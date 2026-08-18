<script lang="ts">
  /* The hormone curve's band, with the user's own lab results on top of it
     (phase 4 ticket 10).

     A band and never a line: there is no points-to-line path in here at all,
     so the single-line presentation this ticket rules out is not something a
     caller could ask for by passing a different prop.

     A dumb renderer, like LineChart.svelte beside it: it takes numbers and
     formatters and knows nothing about esters, units or what any of it
     means. The wording, and paraglide, stay with the caller. */

  import { scaleLinear } from 'd3-scale';
  import { area as d3area, line as d3line } from 'd3-shape';

  interface BandPoint {
    day: number;
    lower: number;
    upper: number;
  }

  interface LabPoint {
    day: number;
    value: number;
  }

  let {
    band,
    labPoints = [],
    max = 400,
    height = 150,
    width = 320,
    formatValue,
    unitLabel,
    ariaLabel,
    selected = null,
    onSelect,
    pointLabel
  }: {
    band: BandPoint[];
    /** The user's own results. Drawn over the band and never part of it. */
    labPoints?: LabPoint[];
    max?: number;
    height?: number;
    width?: number;
    /** For the axis labels. Supplied so no number formatting - and no
        paraglide - lives in here. */
    formatValue: (value: number) => string;
    /** The unit the axis is in, printed above it. Without it a result logged
        in the analyte's other unit sits at a height nobody can reconcile with
        the number they wrote down. */
    unitLabel: string;
    ariaLabel: string;
    /** Index into `labPoints`, or null for none. */
    selected?: number | null;
    /** Omitted means the result marks are not interactive. */
    onSelect?: (index: number) => void;
    /** The accessible name for the result at `index`. Required alongside
        onSelect: a tappable mark with no name cannot be announced. */
    pointLabel?: (index: number) => string;
  } = $props();

  let interactive = $derived(onSelect !== undefined && pointLabel !== undefined);

  const P = 8;
  /* Room on the left for the axis labels, which sit inside the viewBox so
     they scale with it. */
  const AXIS = 34;

  let chart = $derived.by(() => {
    if (band.length < 2) return null;

    const x0 = band[0].day;
    const x1 = band[band.length - 1].day;
    const x = scaleLinear().domain([x0, Math.max(x0 + 1, x1)]).range([AXIS, width - P]);
    /* Zero-based always: a concentration has a floor and a band that started
       part-way up one would exaggerate every trough. */
    const y = scaleLinear().domain([0, max]).range([height - P, P]);

    const bandGen = d3area<BandPoint>()
      .x((p) => x(p.day))
      .y0((p) => y(p.lower))
      .y1((p) => y(p.upper));
    const edge = (pick: (p: BandPoint) => number) =>
      d3line<BandPoint>()
        .x((p) => x(p.day))
        .y((p) => pick(p))(band) ?? '';

    const ticks = y.ticks(4).filter((value) => value >= 0 && value <= max);

    return {
      band: bandGen(band) ?? '',
      upperEdge: edge((p) => y(p.upper)),
      lowerEdge: edge((p) => y(p.lower)),
      ticks: ticks.map((value) => ({ value, y: y(value) })),
      marks: labPoints.map((p) => ({ cx: x(p.day), cy: y(p.value) }))
    };
  });
</script>

{#if chart}
  <svg
    class="band-chart"
    viewBox="0 0 {width} {height}"
    preserveAspectRatio="none"
    role="img"
    aria-label={ariaLabel}
  >
    <text x={AXIS - 5} y={P - 1} class="band-axis-label" text-anchor="end">{unitLabel}</text>

    {#each chart.ticks as tick (tick.value)}
      <line x1={AXIS} x2={width - P} y1={tick.y} y2={tick.y} class="chart-gridline" />
      <text x={AXIS - 5} y={tick.y + 3.5} class="band-axis-label" text-anchor="end">{formatValue(tick.value)}</text>
    {/each}

    <path d={chart.band} class="band-fill" />
    <path d={chart.upperEdge} class="band-edge" />
    <path d={chart.lowerEdge} class="band-edge" />

    <!-- The user's own results, over the band and shaped unlike it: a filled
         square rather than a dot, so a measurement never reads as part of a
         modelled range. -->
    {#each chart.marks as mark, i (i)}<rect
        x={mark.cx - 3.5}
        y={mark.cy - 3.5}
        width="7"
        height="7"
        class="band-result"
        class:is-selected={i === selected}
      />{/each}

    {#if interactive}
      <!-- Hit areas over the results, sized the way LineChart sizes its own:
           wider than the mark and narrower than 44px, because at 44px
           neighbouring draws would steal each other's taps. -->
      {#each chart.marks as mark, i (i)}<circle
          cx={mark.cx}
          cy={mark.cy}
          r="13"
          class="chart-hit"
          role="button"
          tabindex="0"
          aria-label={pointLabel?.(i)}
          aria-pressed={i === selected}
          onclick={() => onSelect?.(i)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect?.(i);
            }
          }}
        />{/each}
    {/if}
  </svg>
{/if}

<style>
  .band-chart {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  /* A stronger fill than --chart-fill, which is sized for the area under a
     line rather than for the space between two edges. On a weekly injection
     the band is a tall, narrow shape repeated a dozen times across the
     window, and at 16% it read as two thin lines with a gap - which is the
     one thing this chart must not look like. */
  .band-fill {
    fill: color-mix(in oklab, var(--chart-line) 34%, transparent);
  }

  /* Faint, and only to give the band a definite edge. Any heavier and the
     two edges read as two lines rather than as the sides of one shape. */
  .band-edge {
    fill: none;
    stroke: var(--chart-line);
    stroke-width: 1;
    opacity: 0.35;
  }

  .band-axis-label {
    fill: var(--text-2);
    font-size: 10px;
  }

  .band-result {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 1.5;
  }

  .band-result.is-selected {
    stroke: var(--focus-ring);
    stroke-width: 2.5;
  }
</style>
