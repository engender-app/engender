<script lang="ts">
  /* A row of the list card: an icon disc, a title, an optional subtitle and
     a chevron.

     The subtitle is optional because subtitles are earned, not standard
     (DIRECTION.md 3b): the More hub's 22 rows carry titles alone, and the
     one that keeps a subtitle is the link into Settings, where "Settings"
     alone does not say what is behind it.

     Renders as a link where it navigates and as a button where it acts, so
     a destination is a destination to the keyboard and to the screen reader
     as well as to the eye. */
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  let {
    title,
    subtitle,
    icon,
    href,
    onclick,
    key,
    chevron = true,
    leading,
    trailing,
    action,
    ...rest
  }: {
    title: string;
    subtitle?: string;
    /** A name from $lib/components/icons.ts. */
    icon?: string;
    href?: string;
    onclick?: () => void;
    /** The row's own identity for the walkthrough's handle (ADR-0029) -
        a stable key, never the title, which is copy. */
    key?: string;
    /** Off for a row that acts in place rather than going somewhere - a
        row carrying a switch, say, where a chevron would promise a screen
        that is not there. */
    chevron?: boolean;
    /** What sits where the icon disc would: a milestone's own photograph,
        a thumbnail. The disc is the default because most rows have no
        picture of themselves; a row that does should show it rather than a
        glyph standing in for it. */
    leading?: Snippet;
    /** Anything that sits before the chevron: a count, a date, a switch. */
    trailing?: Snippet;
    /** One control of the row's own, beside what the row opens - throwing
        a letter away, dropping a tryout (phase 5 UX ticket 25).

        It changes the row's markup rather than sitting inside it: a button
        nested in a link is not something a browser or a screen reader can
        resolve, so the row becomes a plain container holding the two real
        controls side by side. The label travels with the handler for the
        same reason Notice's dismiss does - an icon button with no
        accessible name cannot be reached by voice or announced at all. */
    action?: { icon: string; label: string; onclick: () => void };
    /** The caller's own attributes, landing on the row itself - the same
        contract Tile and Notice already have. `data-list-row` names the
        slot and the handle beside it names the thing in it, which is what
        lets a screen keep the walkthrough handle it has had since phase 4
        while the container underneath it changes (ADR-0029). */
    [attribute: string]: unknown;
  } = $props();
</script>

{#snippet body()}
  {#if leading}
    {@render leading()}
  {:else if icon}
    <span class="kit-row-ico"><Icon name={icon} size={22} /></span>
  {/if}
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    {#if subtitle}<span class="kit-row-sub">{subtitle}</span>{/if}
  </span>
  <span class="kit-row-trail">
    {#if trailing}{@render trailing()}{/if}
    {#if chevron}<Icon name="chevronRight" size={22} />{/if}
  </span>
{/snippet}

<!-- A link where it navigates and a button where it acts, written out
     rather than resolved through <svelte:element>: the two carry different
     keyboard behaviour and different announcements, and the tag has to be
     legible to the compiler for it to check either. -->
{#if action}
  <div class="kit-row is-split" data-list-row={key} {...rest}>
    {#if href}
      <a class="kit-row-main" {href} {onclick}>{@render body()}</a>
    {:else}
      <button type="button" class="kit-row-main" {onclick}>{@render body()}</button>
    {/if}
    <button
      type="button"
      class="kit-row-act press"
      data-row-action={key}
      aria-label={action.label}
      onclick={action.onclick}
    >
      <Icon name={action.icon} size={18} />
    </button>
  </div>
{:else if href}
  <a class="kit-row" data-list-row={key} {href} {onclick} {...rest}>{@render body()}</a>
{:else}
  <button type="button" class="kit-row" data-list-row={key} {onclick} {...rest}>{@render body()}</button>
{/if}
