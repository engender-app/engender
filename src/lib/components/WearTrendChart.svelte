<script lang="ts">
  /* Calendar weeks and hours arrive from the stats area. This component
     places bars only; the caller supplies dates and words. */
  import type { TransitionConfig } from 'svelte/transition';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';

  const growBar = (_node: Element): TransitionConfig => ({
    duration: motionDuration('--dur-med'),
    easing: EASE_OUT,
    css: (t) => `transform: scaleY(${t})`
  });
  const moveTick = (_node: Element): TransitionConfig => ({
    duration: motionDuration('--dur-fast'),
    easing: EASE_OUT,
    css: (t) => `transform: translateY(${(1 - t) * 8}px); opacity: ${t}`
  });
  const moveLabel = (_node: Element): TransitionConfig => ({
    duration: motionDuration('--dur-fast'),
    easing: EASE_OUT,
    css: (t) => `transform: translateX(${(1 - t) * -12}px); opacity: ${t}`
  });
  let {
    points,
    fromWeek,
    toWeek,
    firstLabel,
    lastLabel,
    ariaLabel,
    height = 150,
    width = 320
  }: {
    points: { weekStart: number; hours: number; label: string }[];
    fromWeek: number;
    toWeek: number;
    firstLabel: string;
    lastLabel: string;
    ariaLabel: string;
    height?: number;
    width?: number;
  } = $props();

  const LEFT = 30;
  const RIGHT = 8;
  const TOP = 8;
  const BOTTOM = 22;

  let plot = $derived.by(() => {
    const bottom = height - BOTTOM;
    const plotHeight = bottom - TOP;
    const weeks = Math.max(1, Math.round((toWeek - fromWeek) / 7) + 1);
    const slot = (width - LEFT - RIGHT) / weeks;
    const barWidth = Math.min(20, slot * 0.72);
    const maxHours = Math.max(4, ...points.map((point) => point.hours));
    const ceiling = Math.ceil(maxHours / 4) * 4;
    return {
      ticks: [0, ceiling / 2, ceiling].map((hours) => ({ hours, y: bottom - (hours / ceiling) * plotHeight })),
      bars: points.map((point) => {
        const barHeight = (point.hours / ceiling) * plotHeight;
        return {
          ...point,
          x: LEFT + ((point.weekStart - fromWeek) / 7 + 0.5) * slot - barWidth / 2,
          y: bottom - barHeight,
          width: barWidth,
          height: barHeight
        };
      })
    };
  });
</script>

<svg class="wear-trend-chart" viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
  {#each plot.ticks as tick (tick.hours)}
    <line x1={LEFT} x2={width - RIGHT} y1={tick.y} y2={tick.y} class="chart-gridline" transition:moveTick />
    <text x={LEFT - 4} y={tick.y + 3.5} class="wear-axis-label" text-anchor="end" transition:moveTick>{tick.hours}</text>
  {/each}
  {#each plot.bars as bar (bar.weekStart)}
    <rect class="wear-week-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} transition:growBar>
      <title>{bar.label}</title>
    </rect>
  {/each}
  {#key fromWeek}
    <text x={LEFT} y={height - 4} class="wear-axis-label" transition:moveLabel>{firstLabel}</text>
  {/key}
  {#if fromWeek !== toWeek}
    <text x={width - RIGHT} y={height - 4} class="wear-axis-label" text-anchor="end">{lastLabel}</text>
  {/if}
</svg>

<style>
  .wear-trend-chart {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  .chart-gridline {
    stroke: var(--chart-grid);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }

  .wear-week-bar {
    fill: var(--chart-line);
    rx: 2;
    transform-box: fill-box;
    transform-origin: center bottom;
    transition: x var(--dur-med) var(--ease-out), y var(--dur-med) var(--ease-out), width var(--dur-med) var(--ease-out), height var(--dur-med) var(--ease-out);
  }

  .wear-axis-label {
    fill: var(--text-2);
    font-size: var(--text-sm);
  }
</style>
