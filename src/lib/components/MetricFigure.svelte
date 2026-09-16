<script lang="ts">
  /* The metric reference sheet's own small figure: an axis, its labelled
     ends, and the person's last take marked on it (phase 11 ticket 17).

     Linear rather than log2, unlike PitchFigure's own field: five of the
     six figures this draws have nothing published to draw at a perceptual
     scale, and their trend is already linear everywhere else it is drawn
     (kit/AreaChart.svelte, via VoiceOwnSeries). Pitch draws linear here
     too, for the same reason a second convention on one small glyph would
     buy nothing - the difference a log axis would make across a person's
     own comfortable range is a few pixels this figure is too small to
     spend on it.

     No comfort bracket, no gate frame, no time trace: those belong to a
     live take or a stored one, and this is neither - an explanation
     (ADR-0060), not a reading. What it shares with PitchFigure is only the
     vocabulary a reader has already met there: a gutter of ticks, a band
     as a wash, a take as a line. */
  let {
    low,
    high,
    value,
    tickLabel,
    bands = []
  }: {
    low: number;
    high: number;
    value: number | null;
    tickLabel: (n: number) => string;
    bands?: readonly { low: number; high: number }[];
  } = $props();

  const HEIGHT = 56;

  /** Where a value lands in the box, 0 at the bottom and `HEIGHT` at the
      top - clamped, so a value outside the axis (which the axis is built
      to avoid handing this component in the first place) still lands on an
      edge rather than off the field. */
  const y = (n: number) => {
    if (high === low) return HEIGHT / 2;
    const fraction = (n - low) / (high - low);
    return HEIGHT - Math.max(0, Math.min(1, fraction)) * HEIGHT;
  };
</script>

<div class="mf">
  <div class="mf-gutter" aria-hidden="true">
    <span class="mf-tick mf-tick-high">{tickLabel(high)}</span>
    <span class="mf-tick mf-tick-low">{tickLabel(low)}</span>
  </div>
  <div class="mf-field">
    <svg class="mf-svg" viewBox="0 0 100 {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
      {#each bands as band (`${band.low}-${band.high}`)}
        <rect class="mf-band" x="0" y={y(band.high)} width="100" height={y(band.low) - y(band.high)} />
      {/each}
      {#if value !== null}
        <line
          class="mf-marker"
          data-metric-figure-marker
          x1="0"
          y1={y(value)}
          x2="100"
          y2={y(value)}
          vector-effect="non-scaling-stroke"
        />
      {/if}
    </svg>
  </div>
</div>

<style>
  .mf {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
  }

  /* The numbers beside the field, the same fixed-width column PitchFigure
     uses so a three-digit and a two-digit label never move the field's own
     edge. */
  .mf-gutter {
    position: relative;
    flex: 0 0 auto;
    width: 3.4em;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .mf-tick {
    position: absolute;
    right: 0;
    white-space: nowrap;
  }

  .mf-tick-high {
    top: 0;
    transform: translateY(-50%);
  }

  .mf-tick-low {
    bottom: 0;
    transform: translateY(50%);
  }

  .mf-field {
    flex: 1 1 auto;
    min-width: 0;
    height: 56px;
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    overflow: hidden;
  }

  .mf-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Over transparency, the same reason PitchFigure's own band is: the
     overlap between two ranges then falls out of the arithmetic rather
     than being a colour someone picked. */
  .mf-band {
    fill: color-mix(in oklab, var(--role-c) 18%, transparent);
  }

  .mf-marker {
    stroke: var(--role-ink);
    stroke-width: 2;
  }
</style>
