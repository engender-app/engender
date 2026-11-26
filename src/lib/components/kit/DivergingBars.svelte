<script lang="ts" module>
  /** The shortest a real gap draws, as a share of the longest bar, so a gap
      a fiftieth of the leader's is still a mark with a side. */
  const FLOOR = 0.02;

  /** A bar's scale out of its zero line. Exact above the floor; a row with
      no gap at all draws nothing rather than a sliver that picks a side. */
  const scaleOf = (share: number) => (share === 0 ? 0 : Math.max(Math.abs(share), FLOOR));
</script>

<script lang="ts">
  /* Rows of one scale, each a bar out of a zero line: left where the tag
     went with a lower average, right where it went with a higher one
     (ticket 20, "Tagi a zmiany na skali").

     The caller sizes the bars (tagScaleGroups.ts): `share` is signed, -1 to
     1, the row's gap over the largest gap in its group, so a bar is only
     ever measured against rows on the same scale. Nothing here knows what a
     scale is.

     No colour says which way. Both directions are the section's own stripe
     (ADR-0012, F15): lower is not worse than higher. The direction is the
     side of the zero line, and the numbers on the row's own line carry the
     rest.

     A bar stops at `--div-limit` of its half of the track. A filled bar that runs to
     its container's edge reads as progress, and the longest bar in a group
     is by construction the full length it can be. */
  type Row = { key: string; name: string; note: string; share: number };

  let {
    rows,
    onPick,
    offset = 0
  }: {
    rows: Row[];
    /** What a row opens, where it opens anything. */
    onPick?: (key: string) => void;
    /** How many rows come before these in the card, so the stagger runs on
        down a second group rather than starting over. */
    offset?: number;
  } = $props();
</script>

{#snippet body(row: Row, index: number)}
  <span class="div-name" data-div-name>{row.name}</span>
  <span class="div-note" data-div-note>{row.note}</span>
  <span class="div-track" aria-hidden="true">
    <span class="div-zero"></span>
    <span
      class="div-bar"
      class:is-lower={row.share < 0}
      data-div-bar
      style={`--scale: ${scaleOf(row.share)}; --div-index: ${offset + index}`}
    ></span>
  </span>
{/snippet}

<div class="div-rows" data-chart="diverging">
  {#each rows as row, i (row.key)}
    {#if onPick}
      <button type="button" class="div-row" data-div-row={row.key} data-no-press onclick={() => onPick(row.key)}>
        {@render body(row, i)}
      </button>
    {:else}
      <div class="div-row" data-div-row={row.key}>{@render body(row, i)}</div>
    {/if}
  {/each}
</div>

<style>
  .div-rows {
    display: grid;
    gap: var(--space-3);
    /* A bar's longest run, as a share of the whole track: 44 of the half's
       50. */
    --div-limit: 44;
  }

  .div-row {
    display: block;
    min-width: 0;
  }

  /* A button where the row opens something: every default the element
     brings reset so it reads as the same row either way, and the press a
     wash instead of a scale, as BarRows' open row does (a row the width of
     its card scaling moves the card around it). */
  button.div-row {
    width: calc(100% + var(--space-2) * 2);
    margin: calc(var(--space-2) * -1);
    padding: var(--space-2);
    border: 0;
    border-radius: var(--r-block);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition-property: background-color;
    transition-duration: var(--dur-fast);
  }

  button.div-row:active {
    background: var(--role-wash);
    transition-duration: 0s;
  }

  button.div-row:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .div-name {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .div-note {
    display: block;
    margin-top: 2px;
    font-size: var(--text-xs);
    line-height: var(--leading-body);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .div-track {
    position: relative;
    display: block;
    height: 18px;
    margin-top: 4px;
  }

  /* The scale itself, the faintest line the theme has, drawn as a child
     for the reason PairedDots gives: the kit paints flat colour. */
  .div-track::before {
    content: '';
    position: absolute;
    inset: 50% 0 auto 0;
    height: 2px;
    transform: translateY(-50%);
    border-radius: 1px;
    background: var(--hairline);
  }

  .div-zero {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--text-2);
    /* Over the bars, not under: a bar starts at this line and would
       otherwise cover it. */
    z-index: 1;
  }

  /* The bar is always the group's longest run and is scaled down to its
     row's length from the zero line, so a write that changes a row in place
     travels on transform alone (the performance contract: no layout
     property). A bar that crosses to the other side changes side at once;
     a gap does not flip sign under a person's eyes but on a write. */
  .div-bar {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--div-limit) * 1%);
    height: 12px;
    margin-top: -6px;
    border-radius: 2px;
    background: var(--role-draw);
    transform-origin: left center;
    transform: scaleX(var(--scale));
    transition-property: transform;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
    /* Arrival: out of the zero line, 400ms, 40ms between bars. A CSS
       animation on purpose: a ReadGroup holds its members' CSS animations
       paused until it shows (ReadGroup.svelte) and finishes any other
       running one on the spot, which is how a bar written as a Web
       Animation arrived already full. `backwards` only, so the resting
       transform and its transition take over when it ends. */
    animation: div-grow 400ms var(--ease-out) backwards;
    animation-delay: calc(min(var(--div-index, 0), 12) * 40ms);
  }

  /* Reduced motion: no transform animation. The group's and the gate's own
     fade is the arrival. */
  @media (prefers-reduced-motion: reduce) {
    .div-bar {
      animation: none;
      transition: none;
    }
  }

  :global(html[data-a11y-motion='reduce']) .div-bar {
    animation: none;
    transition: none;
  }

  @keyframes div-grow {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(var(--scale));
    }
  }

  .div-bar.is-lower {
    left: calc(50% - var(--div-limit) * 1%);
    transform-origin: right center;
  }
</style>
