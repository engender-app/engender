<script lang="ts">
  /* One reading of the Look back door, as a tile (phase 11 ticket 07).

     The door used to draw every reading in full, one card under another,
     and a person scrolled six viewports to find the one they meant. Each
     reading is a tile now: its name, a small drawing where the reading has
     one, one headline figure for the span, and a chevron, opening a screen
     of its own at the same span. Revolut's analytics and MacroFactor's
     insights are the shape - a card summarises a screen rather than being
     it - without the card.

     Flush, not a block (rule 4; Alicja's call on the spike, 2026-09-16:
     "flush it is"). Nine blocks of one stripe made the door a wall, and
     the two look-back tiles under the grid already spend the stripe. So a
     reading sits on the page between hairlines: the name at 15 in the
     secondary ink, the figure in the page's own ink at 28, and colour only
     where it carries a value - the drawing, in the chart stripe (rule 9).
     The grid draws the lines (ReadingGrid.svelte); the tile is what sits
     between them.

     A tile with no headline is the plane's: its drawing takes the room the
     figure had ("drop the title - just show the small header and a bigger
     graph"), which is what `flex: 1` on the drawing slot does when nothing
     follows it.

     The figure counts to its new value when the span moves where it is a
     count (ADR-0078, the same rule Tile.svelte keeps), and a tile joins and
     leaves the grid through the panel primitive rather than in one frame:
     a reading with no data in the span has no tile, so the count varies
     with the span and the grid rewraps. `|global`, for the reason Tile
     gives - the block that creates and destroys a tile is the caller's, not
     this component's own body. */
  import { untrack, type Snippet } from 'svelte';
  import { navigating } from '$app/state';
  import Icon from '../Icon.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { asCount, countUp } from '$lib/motion/countUp';

  let {
    name,
    href,
    key,
    headline,
    note,
    drawing,
    ...rest
  }: {
    /** What the reading is called, in the catalogue's own words. */
    name: string;
    /** The reading's screen, carrying the span (lookBackReadings.ts). */
    href: string;
    /** The walkthrough's handle (ADR-0029): which reading this is. */
    key: string;
    /** The one figure for the span, already formatted. Absent on a tile
        whose drawing is the reading. */
    headline?: string;
    /** One line under the figure: what it is a figure of. */
    note?: string;
    /** The small drawing, where the reading has one. */
    drawing?: Snippet;
    [attribute: string]: unknown;
  } = $props();

  let panel = $derived({ skip: navigating.to !== null });

  let shown = $state<string | undefined>(untrack(() => (asCount(headline) === null ? headline : '0')));
  let landed: number | null = null;
  $effect(() => {
    const target = asCount(headline);
    if (target === null) {
      shown = headline;
      landed = null;
      return;
    }
    const from = landed ?? 0;
    landed = target;
    return countUp(from, target, (n) => (shown = String(n)));
  });
</script>

<a class="kit-reading press" data-reading={key} {href} transition:collapse|global={panel} {...rest}>
  <span class="kit-reading-name">
    <span>{name}</span>
    <Icon name="chevronRight" size={22} />
  </span>
  {#if drawing}
    <span class="kit-reading-draw" class:is-whole={!headline} aria-hidden="true">{@render drawing()}</span>
  {/if}
  {#if headline}
    <span class="kit-reading-head">{shown}</span>
  {/if}
  {#if note}
    <span class="kit-reading-note">{note}</span>
  {/if}
</a>

<style>
  .kit-reading {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    /* Set by the tallest tile on the grid, never shorter than this: a tile
       whose drawing is the reading needs room for it (rule 9's 2px line
       needs height to be a shape). */
    min-height: 132px;
    padding: var(--space-4) 0;
    color: var(--text);
    text-decoration: none;
  }

  .kit-reading-name {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1.25;
    color: var(--text-2);
  }

  .kit-reading-name > span {
    min-width: 0;
  }

  .kit-reading-name > :global(svg) {
    flex: 0 0 auto;
    margin-top: -2px;
  }

  /* Pushed down to sit on the figure, so two tiles side by side line their
     figures up whatever their names did. */
  .kit-reading-draw {
    display: block;
    width: 100%;
    height: 36px;
    margin-top: auto;
    /* The chart stripe, the way every drawn shape in a chart takes it
       (rule 9); the grid hands the role down. */
    --ink: var(--role-draw);
    --guide: var(--text-2);
  }

  .kit-reading-draw.is-whole {
    flex: 1;
    height: auto;
    min-height: 56px;
  }

  .kit-reading-draw :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .kit-reading-head {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .kit-reading:not(:has(.kit-reading-draw)) .kit-reading-head {
    margin-top: auto;
  }

  .kit-reading-note {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1.25;
    color: var(--text-2);
  }
</style>
