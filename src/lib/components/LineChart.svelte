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
    min = 0,
    max = 100,
    height = 120,
    width = 320,
    showDots = false,
    selected = null,
    onSelect,
    pointLabel,
  }: {
    points: Point[];
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
  } = $props();

  let interactive = $derived(onSelect !== undefined && pointLabel !== undefined);

  const P = 8;

  let chart = $derived.by(() => {
    if (points.length < 2) return null;
    const x0 = points[0].day;
    const x1 = points[points.length - 1].day;
    const x = scaleLinear().domain([x0, Math.max(x0 + 1, x1)]).range([P, width - P]);
    const y = scaleLinear().domain([min, max]).range([height - P, P]);
    const lineGen = d3line<Point>().x((p) => x(p.day)).y((p) => y(p.value));
    const areaGen = d3area<Point>().x((p) => x(p.day)).y0(height - P).y1((p) => y(p.value));
    return {
      line: lineGen(points) ?? '',
      area: areaGen(points) ?? '',
      dots: points.map((p) => ({ cx: x(p.day), cy: y(p.value) })),
      label: m.chart_aria({
        count: String(points.length),
        from: fmtDay(x0, { day: 'numeric', month: 'short' }),
        to: fmtDay(x1, { day: 'numeric', month: 'short' })
      }),
    };
  });

  const gridYs = [0.25, 0.5, 0.75];
</script>

{#if chart}
  <svg class="line-chart" viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label={chart.label}>
    {#each gridYs as f (f)}
      <line x1={P} x2={width - P} y1={P + f * (height - 2 * P)} y2={P + f * (height - 2 * P)} class="chart-gridline" />
    {/each}
    <path d={chart.area} class="chart-area" />
    <path d={chart.line} class="chart-line" />
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
