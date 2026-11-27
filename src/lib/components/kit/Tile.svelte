<script lang="ts">
  /* A tile names its destination, shows a reading when it has one and puts
     any small note on the page-coloured foot. A tight grid uses the flag
     bar in place of the foot, with actual stripes and proportions from
     --flag-fill.

     Cards are the two-up default. A row takes the whole width and stacks
     its title and value beside its control. Forward attributes to the
     anchor. data-tile identifies the slot and a capability handle stays
     with the action across layouts (ADR-0029). */
  import { untrack } from 'svelte';
  import { navigating } from '$app/state';
  import Icon from '../Icon.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { heldByReadGroup, readGroup } from './readGroup.svelte';
  import { asCount, countUp } from '$lib/motion/countUp';

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
        default. A row takes the grid's whole width and is shorter, stacking
        its title and value tight rather than spending a card's height on
        them, which is what a thing bound to today gets on Home - the
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

  function runTileAction(event: MouseEvent) {
    const tile = (event.currentTarget as HTMLElement).closest('.kit-tile');
    tile?.setAttribute('data-intentional-tile-exit', '');
    action?.onclick?.(event);
    if (tile) requestAnimationFrame(() => tile.removeAttribute('data-intentional-tile-exit'));
  }

  /* collapse follows the layout axis, giving back width on a row and height
     when stacked. Attach it to Tile because TileGrid receives its children
     as one snippet. Svelte needs |global here so the transition runs when a
     caller's parent block removes the tile.

     skip disables the 240ms outro on page exit. collapse also skips the
     entrance while the screen itself is arriving. */
  /* Also stood down while a ReadGroup is holding it: nobody
     can see it arrive under the group's placeholder, and the group's fade
     is the arrival.

     A function called as the transition starts, not a `$derived`. Svelte reads the params again when the outro starts, and a
     derived read from an effect that is already being destroyed hands back
     its cached value (Svelte's `derived_inert`) - which was the value from
     mount, `skip: true` while the group still held it. Every tile on the
     Look back door then left the grid in one frame, cut rather than
     collapsed, and a navigation starting after mount was missed the same
     way. Notice.svelte writes its params inline for the same reason. */
  const group = readGroup();
  const panel = () => ({ skip: navigating.to !== null || heldByReadGroup(group) });

  /* The value on the block counts up where it is a count: from nothing on arrival, from the
     last number on a change, over --dur-slow so it lands on the frame the block's own clip
     does (kit.css, kit-block-in). A name, a duration or a date is not a count and is
     written straight; `asCount` is what decides, so a tile never guesses from its own key.
     The runner reads the token layer and substitutes the final number under reduced motion,
     and the effect's cleanup cancels a travel the next change or an unmount interrupts. */
  /* Seeded synchronously so no frame draws an empty value: a count starts
     at "0" in the frame the tile mounts, everything else at itself. The
     effect below takes over from there; untrack, because this is the one
     read of the prop that is meant to capture the initial value only. */
  let shown = $state<string | undefined>(untrack(() => (asCount(value) === null ? value : '0')));
  let landed: number | null = null;
  $effect(() => {
    const target = asCount(value);
    if (target === null) {
      shown = value;
      landed = null;
      return;
    }
    /* Held by a ReadGroup, the count waits at its seed for the group to
       show, so the arrival it belongs to is one somebody sees. */
    if (heldByReadGroup(group)) return;
    const from = landed ?? 0;
    landed = target;
    return countUp(from, target, (n) => (shown = String(n)));
  });
</script>

{#if action}
  <div class="kit-tile is-split" data-tile-action data-tile={key} data-weight={weight} class:has-dismiss={!!dismiss} transition:collapse|global={panel()} {...rest}>
    <a class="kit-tile-main press" {href}>
      <span class="kit-tile-title">{title}</span>
      {#if value}<span class="kit-tile-value">{shown}</span>{/if}
    </a>
    <!-- Its own row rather than inside.kit-tile-main: the note used to make.kit-tile-main a
         two-line block, which is-split's align-items: center then centred as a whole - so
         the value, which actually reads on the first of those two lines, sat visibly above
         the action button's true centre. Out here, the title/value line and the action
         button share one row and centre against each other. -->
    {#if note}<span class="kit-tile-note"><span class="kit-tile-note-text">{note}</span></span>{/if}
    {#if action.href}
      <a
        class={action.text ? 'btn btn-soft kit-tile-act hit-floor press' : 'btn btn-soft icon-btn kit-tile-act hit-floor press'}
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
        class={action.text ? 'btn btn-soft kit-tile-act hit-floor press' : 'btn btn-soft icon-btn kit-tile-act hit-floor press'}
        aria-label={action.label}
        onclick={runTileAction}
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
  <div class="kit-tile is-split" data-tile={key} data-weight={weight} class:has-dismiss={true} transition:collapse|global={panel()} {...rest}>
    <a class="kit-tile-main press" {href}>
      <span class="kit-tile-title">{title}</span>
      {#if value}<span class="kit-tile-value">{shown}</span>{/if}
    </a>
    <!-- Outside the link, as on the action shape above and for the reason rule 3 gives: the
         note is a foot of page colour along the bottom edge of the block, and a foot spans
         the block's full width whatever controls the tile carries. Inside the link it was
         one cell of the tile's grid, so the foot stopped short of both edges and left a
         sliver of stripe down each side. The whole tile still taps through - the block
         above the foot is the link. -->
    {#if note}<span class="kit-tile-note"><span class="kit-tile-note-text">{note}</span></span>{/if}
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
  <a class="kit-tile press" data-tile={key} data-weight={weight} {href} transition:collapse|global={panel()} {...rest}>
    <span class="kit-tile-title">{title}</span>
    {#if value}<span class="kit-tile-value">{shown}</span>{/if}
    {#if note}<span class="kit-tile-note"><span class="kit-tile-note-text">{note}</span></span>{/if}
  </a>
{/if}
