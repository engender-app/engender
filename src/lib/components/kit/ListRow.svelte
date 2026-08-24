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
    trailing
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
    /** Anything that sits before the chevron: a count, a date, a switch. */
    trailing?: Snippet;
  } = $props();
</script>

{#snippet body()}
  {#if icon}
    <span class="kit-row-ico"><Icon name={icon} size={20} /></span>
  {/if}
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    {#if subtitle}<span class="kit-row-sub">{subtitle}</span>{/if}
  </span>
  <span class="kit-row-trail">
    {#if trailing}{@render trailing()}{/if}
    {#if chevron}<Icon name="chevronRight" size={20} />{/if}
  </span>
{/snippet}

<!-- A link where it navigates and a button where it acts, written out
     rather than resolved through <svelte:element>: the two carry different
     keyboard behaviour and different announcements, and the tag has to be
     legible to the compiler for it to check either. -->
{#if href}
  <a class="kit-row" data-list-row={key} {href} {onclick}>{@render body()}</a>
{:else}
  <button type="button" class="kit-row" data-list-row={key} {onclick}>{@render body()}</button>
{/if}
