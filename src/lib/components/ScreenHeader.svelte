<script lang="ts">
  /* The one per-screen header (phase 5 ticket 18).

     Before this there was a shape rather than a component: 56 hand-written
     `<header class="screen-header">` blocks, each repeating a back control,
     an `<h1 class="screen-title">` and often an empty `<div
     class="header-action">` that did nothing but had been copied along with
     the rest. They had drifted in the small ways copies drift - some
     screens carried the empty spacer and some did not, two carried a
     `data-screen-title` handle and the rest carried none, and the lead
     paragraph under the title was a `<p class="muted small">` with an
     inline margin repeated 24 times at two different values.

     `back` takes either a href or a callback because the app genuinely has
     both, and the difference is not cosmetic: most screens go back to a
     fixed parent and should be a real link that middle-clicks and shows a
     target in the status bar, while a few call smartBack() or close a local
     mode instead (NAV-005). One prop with two shapes keeps that a single
     idea - "how this screen goes back" - rather than two props where every
     call site has to pick the right one.

     A screen whose own tab already names it passes `titleHidden`: the title
     stays in the document for a screen reader and for the document outline,
     and stops being a second visible label directly above the first group
     heading (DIRECTION.md 3d). The More hub is the case that motivates it. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';

  let {
    title,
    subtitle,
    back,
    backLabel,
    screen,
    titleHidden = false,
    class: klass = '',
    actions
  }: {
    title: string;
    subtitle?: string;
    /** A href to go back to, or what to run instead of following one. */
    back?: string | (() => void);
    /** Overrides the back control's label where "Back" is not what it does. */
    backLabel?: string;
    /** The screen's own identity, for the walkthrough's handle (ADR-0029). */
    screen?: string;
    titleHidden?: boolean;
    class?: string;
    actions?: Snippet;
  } = $props();
</script>

<header class="screen-header {klass}" class:is-collapsed={titleHidden && !back && !actions} data-screen-header>
  <!-- The subtitle is a row of its own rather than a second line inside the
       title's box. Beside the back control it would centre the arrow
       against the whole block, which drops it to the middle of a header
       whose subtitle runs to four lines - and several of these do, because
       they were written as lead paragraphs. On its own row it also keeps
       the body's measure instead of being squeezed between an arrow and an
       action. -->
  <div class="screen-header-row">
    {#if typeof back === 'string'}
      <a class="icon-btn press" href={back} data-screen-back aria-label={backLabel ?? m.back()}>
        <Icon name="arrowLeft" />
      </a>
    {:else if back}
      <button class="icon-btn press" data-screen-back aria-label={backLabel ?? m.back()} onclick={back}>
        <Icon name="arrowLeft" />
      </button>
    {/if}

    <h1 class="screen-title" class:visually-hidden={titleHidden} data-screen-title={screen ?? ''}>
      {title}
    </h1>

    {#if actions}
      <div class="header-action">{@render actions()}</div>
    {/if}
  </div>

  {#if subtitle}
    <p class="screen-subtitle" data-screen-subtitle>{subtitle}</p>
  {/if}
</header>
