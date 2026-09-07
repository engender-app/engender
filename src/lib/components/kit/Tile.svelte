<script lang="ts">
  /* One tile of the grid: where it goes, and the reading that is the reason
     to go there.

     The value is the tile's own data rather than a hero metric - a big
     accent number with a small label and a supporting line was the template
     the slop audit removed from Home. Here the number sits under the title
     it belongs to and a tile with nothing to report is a title and a note.

     Under the number is the flag itself, as a bar the width of the number:
     the real stripes at their real hex values, in stripe order and in the
     flag's own proportions, nudged for nothing. It is the one place in the
     kit where the flag is shown as itself rather than used as a screen's
     colour, and it is drawn from --flag-fill, which the grid above sets
     from $lib/theme/roles.

     `.press` is tier 1, from $lib/motion/press.css: the whole tile answers
     a press by scaling, which a full-width list row cannot do without
     moving the card around it.

     Two weights. A card is the two-up default: title, value under it at
     display size, note under that. A row takes the whole width and reads
     along one line instead - title and value together, note beneath - so a
     screen ordering its tiles by urgency can draw the difference rather
     than only sorting by it.

     Anything else the caller puts on it lands on the anchor. That is how a
     screen stamps its own walkthrough handle without the kit learning what
     wrapped or on-this-day are: `data-tile` names the slot, and the
     capability handle beside it names the offer, which is the one the
     walkthrough has been gripping since phase 4 (ADR-0029). A tile whose
     only name were its slot would have cost that suite a rename for a
     capability that never went anywhere. */
  import { navigating } from '$app/state';
  import Icon from '../Icon.svelte';
  import { collapse } from '$lib/motion/reveal';

  export type TileAction = {
    icon?: string;
    text?: string;
    label: string;
    onclick?: (e: MouseEvent) => void;
    href?: string;
    attrs?: Record<string, string>;
  };

  export type TileDismiss = {
    label: string;
    onclick: (e: MouseEvent) => void;
    attrs?: Record<string, string>;
  };

  let {
    title,
    value,
    note,
    href,
    key,
    weight = 'card',
    action,
    dismiss,
    ...rest
  }: {
    title: string;
    /** The tile's reading, already formatted. */
    value?: string;
    /** A line under the value, or under the title where there is no value. */
    note?: string;
    href: string;
    key?: string;
    /** How much of the screen the tile is worth. A card is the two-up
        default. A row takes the grid's whole width, puts its value beside
        its title rather than under it and drops the flag bar, which is what
        a thing bound to today gets on Home (phase 8 UX ticket 01) - the
        weight is the tile's own layout, so it belongs here rather than as
        an override reaching in from a screen. */
    weight?: 'card' | 'row';
    /** An optional in-place control for the tile (ADR-0039). */
    action?: TileAction;
    /** An optional dismiss control for the tile. */
    dismiss?: TileDismiss;
    /** The caller's own attributes - a handle, an aria-describedby. */
    [attribute: string]: unknown;
  } = $props();

  /* Phase 9 carpet ticket 04: a tile joins and leaves its grid through the
     one panel primitive, so a pair standing side by side gives its space
     back along the row and the same pair stacked below the floor gives it
     back down the column - `collapse` reads which from the layout.

     It rides the tile rather than the grid because TileGrid takes its
     children as one snippet and cannot reach inside them, and rather than a
     wrapper at each call site because that is the per-screen patch this
     ticket exists to remove: Home used to declare a slide of its own, on the
     x axis whatever the layout was doing, which at 390px collapsed the width
     of a tile whose neighbours were giving back height.

     `|global`, and it is load-bearing rather than decoration. A Svelte
     transition is local by default, which means it plays only when the block
     it is written in is created or destroyed - and this one is written in
     Tile's own body, while what actually creates and destroys a tile is the
     caller's `{#each}`. That is a parent block, so the local rule skipped it
     silently: the tile vanished in a frame and nothing in the DOM ever
     carried an inline style. Notice.svelte gets away without it because its
     callers wrap it in an `{#if}` whose own creation the transition can see.
     Told globally, a tile collapses whatever removes it, which is the
     contract this ticket wanted in the first place.

     `skip` is then what keeps `|global` honest, and it is Notice's own for
     the same reason: Svelte runs an outro when the *page* unmounts a tile,
     and a screen leaving should not spend 240ms folding its tiles up first.
     The entrance's counterpart is inside `collapse` - a tile that appears
     while the screen is still arriving is simply there. */
  let panel = $derived({ skip: navigating.to !== null });
</script>

{#if action}
  <div class="kit-tile is-split" data-tile={key} data-weight={weight} class:has-dismiss={!!dismiss} transition:collapse|global={panel} {...rest}>
    <a class="kit-tile-main press" {href}>
      <span class="kit-tile-title">{title}</span>
      {#if value}<span class="kit-tile-value">{value}</span>{/if}
    </a>
    <!-- Its own row rather than inside .kit-tile-main (ticket 99 item 9): the
         note used to make .kit-tile-main a two-line block, which is-split's
         align-items: center then centred as a whole - so the value, which
         actually reads on the first of those two lines, sat visibly above
         the action button's true centre. Out here, the title/value line and
         the action button share one row and centre against each other. -->
    {#if note}<span class="kit-tile-note">{note}</span>{/if}
    {#if action.href}
      <a
        class={action.text ? 'btn btn-soft kit-tile-act press' : 'btn btn-soft icon-btn kit-tile-act press'}
        href={action.href}
        aria-label={action.label}
        {...action.attrs}
      >
        {#if action.icon}<Icon name={action.icon} size={16} />{/if}
        {#if action.text}<span>{action.text}</span>{/if}
      </a>
    {:else}
      <button
        type="button"
        class={action.text ? 'btn btn-soft kit-tile-act press' : 'btn btn-soft icon-btn kit-tile-act press'}
        aria-label={action.label}
        onclick={(e) => action?.onclick?.(e)}
        {...action.attrs}
      >
        {#if action.icon}<Icon name={action.icon} size={16} />{/if}
        {#if action.text}<span>{action.text}</span>{/if}
      </button>
    {/if}
    {#if dismiss}
      <button
        type="button"
        class="kit-tile-dismiss press"
        data-tile-dismiss
        aria-label={dismiss.label}
        onclick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          dismiss?.onclick(e);
        }}
        {...dismiss.attrs}
      >
        <Icon name="x" size={16} />
      </button>
    {/if}
  </div>
{:else if dismiss}
  <div class="kit-tile is-split" data-tile={key} data-weight={weight} class:has-dismiss={true} transition:collapse|global={panel} {...rest}>
    <a class="kit-tile-main press" {href}>
      <span class="kit-tile-title">{title}</span>
      {#if value}<span class="kit-tile-value">{value}</span>{/if}
      {#if note}<span class="kit-tile-note">{note}</span>{/if}
    </a>
    <button
      type="button"
      class="kit-tile-dismiss press"
      data-tile-dismiss
      aria-label={dismiss.label}
      onclick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dismiss?.onclick(e);
      }}
      {...dismiss.attrs}
    >
      <Icon name="x" size={16} />
    </button>
  </div>
{:else}
  <a class="kit-tile press" data-tile={key} data-weight={weight} {href} transition:collapse|global={panel} {...rest}>
    <span class="kit-tile-title">{title}</span>
    {#if value}<span class="kit-tile-value">{value}</span>{/if}
    {#if note}<span class="kit-tile-note">{note}</span>{/if}
  </a>
{/if}
