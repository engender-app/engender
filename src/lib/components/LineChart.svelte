<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { scaleLinear } from 'd3-scale';
  import { line as d3line, area as d3area } from 'd3-shape';
  import { fmtDay } from '$lib/data/dates';

  interface Point {
    day: number;
    value: number;
  }

  /* Selectable points are opt-in, so the three callers that just want a line
     are unchanged. The chart stays a renderer: it reports which point was
     picked and knows nothing about what its caller then says about it, which
     is what keeps the wording (and paraglide) out of an SVG. */
  let {
    points,
    overlay = [],
    min = 0,
    max = 100,
    height = 120,
    width = 320,
    showDots = false,
    selected = null,
    onSelect,
    pointLabel,
    ariaLabel,
  }: {
    points: Point[];
    /** A second series on the same y scale (phase 5 ticket 31). Same scale
        because the two callers that use it - a body region's dysphoria and
        its euphoria - are both 0-100; a series in other units belongs on
        WearTrendChart's twin axes instead. The two series keep their own
        days, so one can have points where the other has none.

        Once there are two, the first drops its area fill and both are drawn
        as plain lines of equal weight. A filled series next to an unfilled
        one reads as the main reading with an annotation, and neither of
        these two is the other's annotation. */
    overlay?: Point[];
    min?: number;
    max?: number;
    height?: number;
    width?: number;
    showDots?: boolean;
    /** Index into `points`, or null for none. */
    selected?: number | null;
    /** Omitted means the dots are not interactive at all. */
    onSelect?: (index: number) => void;
    /** The accessible name for the point at `index`. Required alongside
        onSelect: a tappable dot with no name is a control a screen reader
        cannot announce. */
    pointLabel?: (index: number) => string;
    /** Overrides the computed "from X to Y" label (chart_aria) for a chart
        whose `day` is not an epoch day - a bucketed position, say - and so
        has no date to format. */
    ariaLabel?: string;
  } = $props();

  /* Tied to showDots: the hit areas are invisible, so without the dots under
     them a caller would ship targets nobody can see they can tap. */
  let interactive = $derived(showDots && onSelect !== undefined && pointLabel !== undefined);

  const P = 8;

  // Drawn from whichever series have two points, not just the first: a
  // region logged only as euphoria still has a chart to show.
  let drawable = $derived([points, overlay].filter((s) => s.length >= 2));

  let chart = $derived.by(() => {
    if (drawable.length === 0) return null;
    const days = drawable.flatMap((s) => s.map((p) => p.day));
    const x0 = Math.min(...days);
    const x1 = Math.max(...days);
    const x = scaleLinear().domain([x0, Math.max(x0 + 1, x1)]).range([P, width - P]);
    const y = scaleLinear().domain([min, max]).range([height - P, P]);
    const lineGen = d3line<Point>().x((p) => x(p.day)).y((p) => y(p.value));
    const areaGen = d3area<Point>().x((p) => x(p.day)).y0(height - P).y1((p) => y(p.value));
    return {
      line: points.length >= 2 ? lineGen(points) ?? '' : '',
      area: overlay.length === 0 && points.length >= 2 ? areaGen(points) ?? '' : '',
      overlay: overlay.length >= 2 ? lineGen(overlay) ?? '' : '',
      dots: points.map((p) => ({ cx: x(p.day), cy: y(p.value) })),
      // Skipped once ariaLabel overrides it: fmtDay would format a bucketed
      // position (a day of interval, say) as though it were an epoch day,
      // which is wrong rather than merely unused.
      label: ariaLabel
        ? ''
        : m.chart_aria({
            count: String(new Set(days).size),
            from: fmtDay(x0, { day: 'numeric', month: 'short' }),
            to: fmtDay(x1, { day: 'numeric', month: 'short' })
          }),
    };
  });

  const gridYs = [0.25, 0.5, 0.75];
</script>

{#if chart}
  <svg class="line-chart" data-line-chart viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label={ariaLabel ?? chart.label}>
    {#each gridYs as f (f)}
      <line x1={P} x2={width - P} y1={P + f * (height - 2 * P)} y2={P + f * (height - 2 * P)} class="chart-gridline" />
    {/each}
    {#if chart.area}<path d={chart.area} class="chart-area" />{/if}
    {#if chart.line}<path d={chart.line} class="chart-line" />{/if}
    {#if chart.overlay}<path d={chart.overlay} class="chart-line-overlay" />{/if}
    {#if showDots}
      {#each chart.dots as d, i (i)}<circle
          cx={d.cx}
          cy={d.cy}
          r="3"
          class="chart-dot"
          class:is-selected={i === selected}
        />{/each}
    {/if}
    {#if interactive}
      <!-- The hit areas, over the dots rather than on them: a 3px dot is not
           something anyone taps on a phone. Wider than the visible dot and
           narrower than a 44px control, because at 44px the targets on a
           320-wide chart would overlap each other, and a dot that steals its
           neighbour's taps is worse than a small one. -->
      {#each chart.dots as d, i (i)}<circle
          cx={d.cx}
          cy={d.cy}
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
{:else}
  <div class="chart-too-little">{m.not_enough_data()}</div>
{/if}
