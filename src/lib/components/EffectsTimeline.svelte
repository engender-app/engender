<!-- The personal effects timeline (phase 4 ticket 07): one horizontal track
     per fixed effect, all sharing the same day axis anchored at the
     earliest regimen episode's start day. A track shows the literature's
     onset and completion windows as background bands and, when set, the
     person's own first-noticed day as a marker - never framed against each
     other, since the acceptance criterion this file exists to keep is that
     nothing here reads as "ahead" or "behind" the bands.

     Purely a renderer, the same philosophy LineChart states for itself:
     every row's label is resolved by the caller (personalEffectName), and
     the chart adds only its own fixed wording (the legend, the two edge
     captions) via paraglide directly, the same way LineChart's own
     "not enough data" text is inline rather than threaded through as a
     prop. Decorative only - the day-by-day detail a screen reader needs
     lives in the textual list the caller renders alongside this. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { scaleLinear } from 'd3-scale';
  import { fmtDay } from '$lib/data/dates';

  export interface EffectTimelineRow {
    key: string;
    label: string;
    onset: { start: number; end: number };
    /** Null when the literature gives no completion window at all. A
        completion whose own `end` is null is open-ended - "more than N
        months", rendered as a band that fades out rather than stopping. */
    completion: { start: number; end: number | null } | null;
    /** The person's own first-noticed day, or null when not yet marked. */
    markerDay: number | null;
  }

  let {
    rows,
    anchorEpochDay,
    todayEpochDay
  }: {
    rows: EffectTimelineRow[];
    anchorEpochDay: number;
    todayEpochDay: number;
  } = $props();

  const WIDTH = 320;
  const P = 4;
  const ROW_H = 40;
  const BAND_H = 16;
  const BAND_Y = (ROW_H - BAND_H) / 2;

  /* An open-ended completion band has no real right edge to draw - the
     literature just says "more than N months" - so this is a fixed visual
     span for layout only, faded out via the gradient rather than presented
     as if it were a real boundary. */
  const OPEN_END_EXTENSION_DAYS = 180;

  /* Never a narrower span than two years: with nothing marked yet and every
     window still ahead, a chart scaled to just the earliest onset window
     would put every band hard against the left edge. */
  const MIN_SPAN_DAYS = 730;

  const completionRenderEnd = (completion: { start: number; end: number | null }): number =>
    completion.end ?? completion.start + OPEN_END_EXTENSION_DAYS;

  let x = $derived.by(() => {
    const candidates = [todayEpochDay, anchorEpochDay + MIN_SPAN_DAYS];
    for (const row of rows) {
      candidates.push(row.onset.end);
      if (row.completion) candidates.push(completionRenderEnd(row.completion));
      if (row.markerDay != null) candidates.push(row.markerDay);
    }
    const end = Math.max(...candidates);
    return scaleLinear()
      .domain([anchorEpochDay, end + (end - anchorEpochDay) * 0.05])
      .range([P, WIDTH - P]);
  });
</script>

<div class="effects-timeline">
  <!-- Referenced by url(#...) from every row's completion band below;
       SVG gradients resolve across sibling <svg> elements by id, so one
       definition here covers all of them. -->
  <svg width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="effect-band-fade">
        <stop offset="0" stop-color="var(--band-completion)" />
        <stop offset="1" stop-color="var(--band-completion)" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>

  <p class="effects-timeline-caption muted small">
    {m.effect_regimen_start_label()} {fmtDay(anchorEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
    · {m.effect_today_label()} {fmtDay(todayEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
  </p>

  {#each rows as row (row.key)}
    <div class="effect-row">
      <span class="effect-row-label">{row.label}</span>
      <svg class="effect-row-track" viewBox="0 0 {WIDTH} {ROW_H}" preserveAspectRatio="none" aria-hidden="true">
        <line class="track-baseline" x1={P} x2={WIDTH - P} y1={ROW_H / 2} y2={ROW_H / 2} />
        <rect
          class="band-onset"
          x={x(row.onset.start)}
          y={BAND_Y}
          width={Math.max(0, x(row.onset.end) - x(row.onset.start))}
          height={BAND_H}
        />
        {#if row.completion}
          <rect
            class="band-completion"
            x={x(row.completion.start)}
            y={BAND_Y}
            width={Math.max(0, x(completionRenderEnd(row.completion)) - x(row.completion.start))}
            height={BAND_H}
            fill={row.completion.end == null ? 'url(#effect-band-fade)' : 'var(--band-completion)'}
          />
        {/if}
        <line class="today-marker" x1={x(todayEpochDay)} x2={x(todayEpochDay)} y1="0" y2={ROW_H} />
        {#if row.markerDay != null}
          <line class="user-marker-line" x1={x(row.markerDay)} x2={x(row.markerDay)} y1="0" y2={ROW_H} />
          <circle class="user-marker-dot" cx={x(row.markerDay)} cy={ROW_H / 2} r="5" />
        {/if}
      </svg>
    </div>
  {/each}

  <div class="effects-timeline-legend">
    <span class="legend-item"><span class="legend-swatch swatch-onset"></span>{m.effect_legend_onset()}</span>
    <span class="legend-item"><span class="legend-swatch swatch-completion"></span>{m.effect_legend_completion()}</span>
    <span class="legend-item"><span class="legend-swatch swatch-marker"></span>{m.effect_legend_marker()}</span>
    <span class="legend-item"><span class="legend-swatch swatch-today"></span>{m.effect_legend_today()}</span>
  </div>
</div>

<style>
  .effects-timeline {
    --band-onset: color-mix(in oklab, var(--accent) 20%, var(--surface));
    --band-completion: color-mix(in oklab, var(--accent) 40%, var(--surface));
  }
  .effects-timeline-caption {
    margin-bottom: var(--space-3);
  }
  .effect-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .effect-row-label {
    flex: 0 0 108px;
    font-size: var(--text-sm);
  }
  .effect-row-track {
    flex: 1 1 auto;
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .track-baseline {
    stroke: var(--border);
    stroke-width: 1;
  }
  .band-onset {
    fill: var(--band-onset);
  }
  .band-completion {
    fill: var(--band-completion);
  }
  .today-marker {
    stroke: var(--text-2);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .user-marker-line {
    stroke: var(--accent);
    stroke-width: 2;
  }
  .user-marker-dot {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .effects-timeline-legend {
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
    border-radius: var(--radius-sm);
    flex: none;
  }
  .swatch-onset {
    background: var(--band-onset);
  }
  .swatch-completion {
    background: var(--band-completion);
  }
  .swatch-marker {
    background: var(--accent);
    border-radius: 50%;
  }
  .swatch-today {
    background: repeating-linear-gradient(to bottom, var(--text-2) 0 2px, transparent 2px 5px);
  }
</style>
