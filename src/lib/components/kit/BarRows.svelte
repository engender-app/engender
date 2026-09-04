<script lang="ts">
  /* Horizontal bars, each running the full width of the card with its label
     and its value on the line above it, rather than sitting in a right-hand
     column behind a label gutter. The bar is a length; the number beside it
     is the reading.

     Single hue (ADR-0012, and the same rule the chart style is read off):
     the longest bar is the section's stripe at full strength and every
     other bar is one diluted step of that same colour. One step, not a
     ramp - a per-bar gradient of intensity would rank them, and length
     already does that without colour having to.

     The leader is whichever bar is longest rather than whichever is first,
     so a caller that sorts alphabetically still colours the right one.

     Each bar carries its own index, which is what staggers the rise in
     kit.css. It is the row's position in the set rather than a delay in
     milliseconds: the pacing belongs to the stylesheet with every other
     duration in the app.

     A bar opens where it is given somewhere to open (phase 5 UX ticket 23,
     the tag insights on the Stats hub), which is the same split DayEntry
     makes: presentational where there is nothing behind it, a button where
     there is. What it replaced was a chart of the tags beside a list of the
     same tags, because only one of the two could be pressed - and two
     drawings of one set is worse than either. Whole-row rather than
     bar-only: the reading is the label, the note and the length together,
     and half of that being inert is a smaller target that also reads as an
     accident. */
  import { share } from '$lib/charts/geometry';
  import type { BarRow } from './barRow';

  let {
    rows,
    onPick,
    measure = 'leader'
  }: {
    rows: BarRow[];
    /** What the row's key opens, where a row goes anywhere. Omitted, the
        bars are a drawing and nothing in them is pressable. */
    onPick?: (key: string) => void;
    /** What the track's full length is measured against.

        `leader` measures every bar against the longest one in the set, which
        is right where `amount` is a magnitude with no ceiling of its own: how
        far a tag moved a scale, how many entries carried it. The longest
        thing fills the track and the rest are read against it.

        `track` measures each bar against the track itself, for callers whose
        `amount` is already a position between 0 and 1 in something's own
        range. Three of those existed before this prop did and all three were
        silently re-normalised: the scale bars say "where the average lands
        inside that metric's own range", the values sheet says "where the day
        sits in the metric's own range", and the highest days are a position
        on the person's own scale. A journal whose three scales all sat near
        the bottom drew the same near-full wall as one whose scales all sat
        near the top, because the longest of three short bars is still the
        longest. The absolute reading was computed correctly at every one of
        those call sites and thrown away here.

        Named `measure` and not `scale`: a scale is this app's own word for a
        gender dimension (docs/ui-copy.md), and `scale="track"` on a card of
        scale bars read as though it took one. */
    measure?: 'leader' | 'track';
  } = $props();

  let top = $derived(measure === 'track' ? 1 : Math.max(0, ...rows.map((r) => r.amount)));
</script>

{#snippet bar(row: BarRow)}
  <div class="kit-bar-label">
    <span class="kit-bar-name" data-bar-name>{row.name}</span>
    <span class="kit-bar-value" data-bar-value>{row.value}</span>
  </div>
  <!-- On its own line rather than between the name and the value. Inline, a
       note as long as "7 entries · avg 4.4 with · 3.3 without" took the
       whole row and ellipsised the name down to "social eu..." - the label
       is the one part of a bar that cannot be guessed from the drawing. -->
  {#if row.note}<span class="kit-bar-note">{row.note}</span>{/if}
  <div class="kit-bar-track">
    <span
      class="kit-bar-mark"
      class:is-leader={measure === 'leader' && row.amount === top && top > 0}
      style={`--bar-share: ${share(row.amount, top)}`}
    ></span>
  </div>
{/snippet}

<div class="kit-bars" data-chart="bars">
  {#each rows as row, i (row.key)}
    {#if onPick}
      <button
        type="button"
        class="kit-bar is-open"
        data-bar-row={row.key}
        style={`--bar-index: ${i}`}
        onclick={() => onPick(row.key)}>{@render bar(row)}</button
      >
    {:else}
      <div class="kit-bar" data-bar-row={row.key} style={`--bar-index: ${i}`}>{@render bar(row)}</div>
    {/if}
  {/each}
</div>
