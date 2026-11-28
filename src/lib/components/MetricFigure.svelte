<script lang="ts">
  /* One metric's axis and the person's last take, marked as a line. */
  let {
    low,
    high,
    value,
    tickLabel
  }: {
    low: number;
    high: number;
    value: number | null;
    tickLabel: (n: number) => string;
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
    color: var(--text-2);
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

  .mf-marker {
    stroke: var(--role-ink);
    stroke-width: 2;
  }
</style>
