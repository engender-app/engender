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
  import { drawBars, type BarRow, type DrawnBar } from './barRow';

  let {
    rows,
    onPick,
    measure = 'leader',
    form = 'stacked'
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
    /** Where the row's label sits, which decides how much room a row takes.

        `stacked` is the drawing: label and value on one line, a 26px track
        on the next. The length is the point, so it gets a line of its own
        and the full width of the card to be read across.

        `inline` writes the label inside the bar. The bar is then the row -
        40px of it, with only the touch floor's spare 8px between one and
        the next - rather than a mark under a line of text, and a set of
        them reads as one stack instead of ten separate drawings. It is for
        a ranking, where the rows are the same kind of thing in order: the
        highest days are that, and stacked they cost 870px at 390px wide to
        say what a column of ten numbers says exactly. Same data, same
        honest `track` measure (Alicja, 2026-09-07: "make the bar a little
        higher, and the date written inside the bar, then make the bars much
        closer to each other"). */
    form?: 'stacked' | 'inline';
  } = $props();

  let drawn = $derived(drawBars(rows, measure));
</script>

{#snippet track(row: DrawnBar)}
  <div class="kit-bar-track">
    <span class="kit-bar-mark" class:is-leader={row.isLeader} style={`--bar-share: ${row.share}`}></span>
  </div>
{/snippet}

<!-- The day, and what the day is drawn from, as they read inside the bar.
     Twice per row: once on the card, and once inside the mark, which clips
     it. Where the bar reaches past the words the clipped copy is what is
     seen, in the ink the flag's own stripe carries for text; where the bar
     stops short, the rest of the words continue in the card's own text
     colour. Both grounds are ones an ink is already proven against, which
     one copy in one colour could not be: a bar is the stripe undiluted, and
     no single colour is readable on both agender's near-black stripe and
     the card it is drawn on. -->
{#snippet inside(row: DrawnBar, onCard: boolean)}
  <span class="kit-bar-inside">
    <span class="kit-bar-name" data-bar-name={onCard ? '' : undefined}>{row.name}</span>
    {#if row.note}<span class="kit-bar-note">{row.note}</span>{/if}
  </span>
{/snippet}

{#snippet bar(row: DrawnBar)}
  {#if form === 'inline'}
    <div class="kit-bar-track">
      {@render inside(row, true)}
      <!-- No `is-leader` here: it is only ever set by the `leader` measure,
           and this form is a ranking on a scale. -->
      <span class="kit-bar-mark" style={`--bar-share: ${row.share}`} aria-hidden="true">
        {@render inside(row, false)}
      </span>
    </div>
    <span class="kit-bar-value" data-bar-value>{row.value}</span>
  {:else}
    <div class="kit-bar-label">
      <span class="kit-bar-name" data-bar-name>{row.name}</span>
      <span class="kit-bar-value" data-bar-value>{row.value}</span>
    </div>
    <!-- On its own line rather than between the name and the value. Inline, a
         note as long as "7 entries · avg 4.4 with · 3.3 without" took the
         whole row and ellipsised the name down to "social eu..." - the label
         is the one part of a bar that cannot be guessed from the drawing. -->
    {#if row.note}<span class="kit-bar-note">{row.note}</span>{/if}
    {@render track(row)}
  {/if}
{/snippet}

<div class="kit-bars" class:is-inline={form === 'inline'} data-chart="bars">
  {#each drawn as row, i (row.key)}
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
