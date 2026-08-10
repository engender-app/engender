<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import { line as d3line, area as d3area } from 'd3-shape';
  import { fmtDay } from '$lib/data/dates';

  interface Point {
    day: number;
    value: number;
  }

  let {
    points,
    min = 0,
    max = 100,
    height = 120,
    width = 320,
    showDots = false,
  }: { points: Point[]; min?: number; max?: number; height?: number; width?: number; showDots?: boolean } =
    $props();

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
      label: `Line chart, ${points.length} points from ${fmtDay(x0, { day: 'numeric', month: 'short' })} to ${fmtDay(x1, { day: 'numeric', month: 'short' })}`,
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
      {#each chart.dots as d, i (i)}<circle cx={d.cx} cy={d.cy} r="3" class="chart-dot" />{/each}
    {/if}
  </svg>
{:else}
  <div class="chart-too-little">Not enough data in this range yet.</div>
{/if}
