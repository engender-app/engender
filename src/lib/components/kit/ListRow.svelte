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
  import Check from './Check.svelte';

  let {
    title,
    subtitle,
    icon,
    href,
    onclick,
    key,
    checked,
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
    /** Set, and the row is a checkbox: it announces itself as one, carries
        its state, and draws its own box at the trailing edge (phase 5
        ticket 35). The row is the control rather than holding one, so the
        whole width of it is the target and a keyboard gets one stop per
        row - which is what a list of things to tick wants, and what a row
        holding a switch deliberately does not do. */
    checked?: boolean;
    /** Off for a row that acts in place rather than going somewhere - a
        row carrying a switch, say, where a chevron would promise a screen
        that is not there. */
    chevron?: boolean;
    /** Anything that sits before the chevron: a count, a date, a switch. */
    trailing?: Snippet;
  } = $props();

  /* Passing `checked` at all is what makes the row a checkbox; its value is
     then what the box shows. Two facts in one prop, so the discriminator is
     named once here rather than being re-derived at each of the two places
     that ask. */
  let isCheckbox = $derived(checked !== undefined);
</script>

{#snippet body()}
  {#if icon}
    <span class="kit-row-ico"><Icon name={icon} size={22} /></span>
  {/if}
  <span class="kit-row-text">
    <span class="kit-row-title">{title}</span>
    {#if subtitle}<span class="kit-row-sub">{subtitle}</span>{/if}
  </span>
  <span class="kit-row-trail">
    {#if trailing}{@render trailing()}{/if}
    {#if isCheckbox}<Check checked={checked ?? false} />{/if}
    {#if chevron}<Icon name="chevronRight" size={22} />{/if}
  </span>
{/snippet}

<!-- A link where it navigates and a button where it acts, written out
     rather than resolved through <svelte:element>: the two carry different
     keyboard behaviour and different announcements, and the tag has to be
     legible to the compiler for it to check either. -->
{#if href}
  <a class="kit-row" data-list-row={key} {href} {onclick}>{@render body()}</a>
{:else if isCheckbox}
  <!-- role="checkbox" on the button rather than a real input, which is the
       same contract Switch.svelte already carries for role="switch": the
       state is a prop, the announcement is aria-checked, and there is no
       hidden input whose :checked could disagree with either. -->
  <button
    type="button"
    class="kit-row"
    role="checkbox"
    aria-checked={checked}
    data-list-row={key}
    {onclick}
  >{@render body()}</button>
{:else}
  <button type="button" class="kit-row" data-list-row={key} {onclick}>{@render body()}</button>
{/if}
