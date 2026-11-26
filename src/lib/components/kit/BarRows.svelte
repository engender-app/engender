<script lang="ts">
  /* Use one hue, full strength for the greatest reading and a fixed dilution
     for all others (ADR-0012). Find the leader by amount regardless of sort
     order. Row index staggers the rise in kit.css, which owns the timing.
     Make the full row a button only when it opens somewhere. */
  import { drawBars, type BarRow, type DrawnBar } from './barRow';

  let {
    rows,
    onPick,
    measure = 'leader'
  }: {
    rows: BarRow[];
    /** What the row's key opens, where a row goes anywhere. Omitted, the
        bars are a drawing and nothing in them is pressable. */
    onPick?: (key: string) => void;
    /**
      * leader measures magnitudes against the largest amount in the set.
      * LEADER_FLOOR_SHARE gives every nonzero amount a visible bar at the
      * cost of proportional length below that floor.
      *
      * track draws amounts already normalized from 0 to 1 against the full
      * track. Use it for a position in a metric's own range, where normalizing
      * again would make a set of low values look like a set of high ones.
      */
    measure?: 'leader' | 'track';
  } = $props();

  let drawn = $derived(drawBars(rows, measure));
</script>

{#snippet track(row: DrawnBar)}
  <div class="kit-bar-track">
    <span class="kit-bar-mark" class:is-leader={row.isLeader} style={`--bar-share: ${row.share}`}></span>
  </div>
{/snippet}

{#snippet bar(row: DrawnBar)}
  <div class="kit-bar-label">
    <span class="kit-bar-name" data-bar-name>{row.name}</span>
    <span class="kit-bar-value" data-bar-value>{row.value}</span>
  </div>
  <!-- On its own line rather than between the name and the value. Inline, a
       note as long as "7 entries · avg 4.4 with · 3.3 without" took the
       whole row and ellipsised the name down to "social eu..." - the label
       is the one part of a bar that cannot be guessed from the drawing. -->
  {#if row.note}<span class="kit-bar-note" data-bar-note>{row.note}</span>{/if}
  {@render track(row)}
{/snippet}

<div class="kit-bars" data-chart="bars">
  {#each drawn as row, i (row.key)}
    {#if onPick}
      <!-- The wash in kit.css is the whole answer to a press here, which is
           DIRECTION.md's tier 1: a row the width of the screen fills rather
           than scales, because scaling a row moves the card it sits in. The
           note beside that wash has said so since the row became pressable,
           and it was only a claim - press.css is opt-out, so this row took
           the compact depth like any other button, and 0.94 on a 306px row
           walks each edge 9.2px inward while the card around it holds still
           (Alicja, on the screencast: the click animation yanks). ListRow
           and DayEntry opted out for the same reason. -->
      <button
        type="button"
        class="kit-bar is-open"
        data-bar-row={row.key}
        data-no-press
        style={`--bar-index: ${i}`}
        onclick={() => onPick(row.key)}>{@render bar(row)}</button
      >
    {:else}
      <div class="kit-bar" data-bar-row={row.key} style={`--bar-index: ${i}`}>{@render bar(row)}</div>
    {/if}
  {/each}
</div>
