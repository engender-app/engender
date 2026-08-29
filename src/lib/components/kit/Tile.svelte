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

     Anything else the caller puts on it lands on the anchor. That is how a
     screen stamps its own walkthrough handle without the kit learning what
     wrapped or on-this-day are: `data-tile` names the slot, and the
     capability handle beside it names the offer, which is the one the
     walkthrough has been gripping since phase 4 (ADR-0029). A tile whose
     only name were its slot would have cost that suite a rename for a
     capability that never went anywhere. */
  import Icon from '../Icon.svelte';

  export type TileAction = {
    icon?: string;
    text?: string;
    label: string;
    onclick?: (e: MouseEvent) => void;
    href?: string;
    attrs?: Record<string, string>;
  };

  let {
    title,
    value,
    note,
    href,
    key,
    action,
    ...rest
  }: {
    title: string;
    /** The tile's reading, already formatted. */
    value?: string;
    /** A line under the value, or under the title where there is no value. */
    note?: string;
    href: string;
    key?: string;
    /** An optional in-place control for the tile (ADR-0039). */
    action?: TileAction;
    /** The caller's own attributes - a handle, an aria-describedby. */
    [attribute: string]: unknown;
  } = $props();
</script>

{#if action}
  <div class="kit-tile is-split" data-tile={key} {...rest}>
    <a class="kit-tile-main press" {href}>
      <span class="kit-tile-title">{title}</span>
      {#if value}<span class="kit-tile-value">{value}</span>{/if}
      {#if note}<span class="kit-tile-note">{note}</span>{/if}
    </a>
    {#if action.href}
      <a
        class="kit-tile-act press"
        href={action.href}
        aria-label={action.label}
        {...action.attrs}
      >
        {#if action.icon}<Icon name={action.icon} size={18} />{/if}
        {#if action.text}<span>{action.text}</span>{/if}
      </a>
    {:else}
      <button
        type="button"
        class="kit-tile-act press"
        aria-label={action.label}
        onclick={(e) => action?.onclick?.(e)}
        {...action.attrs}
      >
        {#if action.icon}<Icon name={action.icon} size={18} />{/if}
        {#if action.text}<span>{action.text}</span>{/if}
      </button>
    {/if}
  </div>
{:else}
  <a class="kit-tile press" data-tile={key} {href} {...rest}>
    <span class="kit-tile-title">{title}</span>
    {#if value}<span class="kit-tile-value">{value}</span>{/if}
    {#if note}<span class="kit-tile-note">{note}</span>{/if}
  </a>
{/if}
