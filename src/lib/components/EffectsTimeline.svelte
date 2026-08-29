<!-- The personal effects timeline (phase 4 ticket 07): one horizontal track
     per fixed effect, all sharing the same day axis anchored at the
     earliest regimen episode's start day. A track shows the literature's
     onset and completion windows as background bands and, when set, the
     person's own first-noticed day as a marker - never framed against each
     other, since the acceptance criterion this file exists to keep is that
     nothing here reads as "ahead" or "behind" the bands.

     A row whose caller passed no onset window draws no band at all, and
     draws nothing in its place either (phase 5 ticket 27): an empty track
     is the literature having nothing to say about that change, and the
     screen must not turn that into a gap in the person.

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
  import { localDateFromEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';

  export interface EffectTimelineRow {
    key: string;
    label: string;
    /** Null when the literature has nothing to say about this change for
        this person's regimen (phase 5 ticket 27) - the row still draws its
        label, its axis and their own marker, and simply carries no band. */
    onset: { start: number; end: number } | null;
    /** Null when the literature gives no completion window at all, and
        always null where `onset` is. A completion whose own `end` is null
        is open-ended - "more than N months", rendered as a band that fades
        out rather than stopping. */
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

  const P = 4;
  const ROW_H = 40;
  const AXIS_H = 24;
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

  /* Item 21: real pixels per day rather than every span squeezed into one
     320px viewBox. 0.6px/day puts two years at ~440px - a horizontal scroll
     on a phone, a wide-but-contained strip on desktop - and keeps five years
     under 1100px so the scroll stays a gesture rather than a journey. */
  const PX_PER_DAY = 0.6;

  const completionRenderEnd = (completion: { start: number; end: number | null }): number =>
    completion.end ?? completion.start + OPEN_END_EXTENSION_DAYS;

  let span = $derived.by(() => {
    const candidates = [todayEpochDay, anchorEpochDay + MIN_SPAN_DAYS];
    for (const row of rows) {
      if (row.onset) candidates.push(row.onset.end);
      if (row.completion) candidates.push(completionRenderEnd(row.completion));
      if (row.markerDay != null) candidates.push(row.markerDay);
    }
    const end = Math.max(...candidates);
    return { end: end + (end - anchorEpochDay) * 0.05 };
  });

  const WIDTH = $derived(Math.max(320, (span.end - anchorEpochDay) * PX_PER_DAY));

  let x = $derived(
    scaleLinear()
      .domain([anchorEpochDay, span.end])
      .range([P, WIDTH - P])
  );

  /* The time axis, which the old fixed-width rendering had no room to carry:
     a tick at each month boundary the span crosses, drawn as a grid line
     through every row and labelled once on the axis above. Labels thin
     themselves out to whatever the drawn width fits - about one per 56px -
     so a five-year span labels every few months where a two-year one labels
     every other month; the year joins the label on January ticks and on
     whichever month carries it after a thinning gap, so the axis always
     says which year a band sits in. */
  const MIN_LABEL_PX = 56;

  let ticks = $derived.by(() => {
    const out: { day: number; label: string; year: boolean }[] = [];
    const start = localDateFromEpochDay(anchorEpochDay);
    const last = localDateFromEpochDay(Math.ceil(span.end));
    for (let y = start.getFullYear(); y <= last.getFullYear(); y++) {
      for (let mo = y === start.getFullYear() ? start.getMonth() : 0; mo < 12; mo++) {
        const day = epochDayFromLocalDate(new Date(y, mo, 1));
        if (day < anchorEpochDay || day > span.end) continue;
        const year = mo === 0 || out.length === 0;
        out.push({
          day,
          year,
          label: fmtDay(day, year ? { month: 'short', year: 'numeric' } : { month: 'short' })
        });
      }
    }
    /* Thin by drawn distance, not by count: two months are 36px apart at
       two years and 12px at five, and a label that cannot be read is worse
       than a month that is not named. January always survives the thinning
       - it carries the year - crowding at worst one neighbour. */
    let lastX = -Infinity;
    return out.filter((tick) => {
      const px = x(tick.day);
      if (!tick.year && px - lastX < MIN_LABEL_PX) return false;
      lastX = px;
      return true;
    });
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

  <!-- Labels live outside the scroll; tracks live inside it. One row per
       effect on both sides at the same fixed height, so the pair stay level
       no matter how far the tracks scroll - and the axis scrolls with them,
       which is what makes it a time axis rather than a caption: the year a
       band sits under is the year above it, whatever the finger has done. -->
  <div class="timeline-grid">
    <div class="timeline-labels" aria-hidden="true">
      <span class="effect-axis-spacer" style="height: {AXIS_H}px"></span>
      {#each rows as row (row.key)}
        <span class="effect-row-label" style="height: {ROW_H}px">{row.label}</span>
      {/each}
    </div>
    <div class="timeline-tracks">
      <svg class="effect-axis" width={WIDTH} height={AXIS_H} aria-hidden="true">
        {#each ticks as tick (tick.day)}
          <text class="axis-label" x={x(tick.day)} y={AXIS_H - 8} text-anchor="middle">{tick.label}</text>
        {/each}
      </svg>
      {#each rows as row (row.key)}
        <svg class="effect-row-track" width={WIDTH} height={ROW_H} aria-hidden="true">
          {#each ticks as tick (tick.day)}
            <line class="tick-grid" x1={x(tick.day)} x2={x(tick.day)} y1="0" y2={ROW_H} />
          {/each}
          <line class="track-baseline" x1={P} x2={WIDTH - P} y1={ROW_H / 2} y2={ROW_H / 2} />
          {#if row.onset}
            <rect
              class="band-onset"
              x={x(row.onset.start)}
              y={BAND_Y}
              width={Math.max(0, x(row.onset.end) - x(row.onset.start))}
              height={BAND_H}
            />
          {/if}
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
      {/each}
    </div>
  </div>

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
  .timeline-grid {
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr);
    gap: var(--space-3);
  }
  .timeline-labels {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-2);
  }
  .effect-axis-spacer {
    flex: none;
  }
  .timeline-tracks {
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .effect-axis {
    display: block;
    overflow: visible;
    margin-bottom: var(--space-1);
  }
  .axis-label {
    fill: var(--text-2);
    font-size: 10px;
    font-family: inherit;
  }
  .effect-row-label {
    flex: none;
    font-size: var(--text-xs);
    line-height: 1.3;
    /* Two lines and no more: the column is a fixed 40px per row so the
       labels stay level with their tracks while the tracks scroll, and a
       long clinical name at full length would push into the next row's.
       Nothing is lost - the full name is the very next thing on the screen,
       in the list this chart summarises. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .effect-row-track {
    flex: none;
    display: block;
    overflow: visible;
  }
  .tick-grid {
    stroke: var(--border);
    stroke-width: 1;
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
