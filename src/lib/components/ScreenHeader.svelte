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
     both, and the difference is not cosmetic: most screens name a fixed
     parent and should be a real link that middle-clicks and shows a target
     in the status bar, while a few close a local mode instead (NAV-005).
     One prop with two shapes keeps that a single idea - "how this screen
     goes back" - rather than two props where every call site has to pick
     the right one.

     CARPET-05: a href names where a screen sits, not where the person came
     from, and those are the same place only when they walked down the menu
     to get here. Arriving at the export screen from Home's stale-backup
     notice and pressing back landed on Settings - a screen they had never
     seen - and the same held for every deep link into the fifty-odd screens
     hanging off /more. So the plain click goes through `smartBack`, which
     returns to the entry behind this one and keeps the href as the fallback
     for when there is none: a deep link, a reload, a notification tap. The
     link stays a link for everything else - a modified click, a middle
     click, the status bar, "open in new tab" - which is why this is still
     an anchor with a handler on it rather than a button.

     A screen whose own tab already names it passes `titleHidden`: the title
     stays in the document for a screen reader and for the document outline,
     and stops being a second visible label directly above the first group
     heading (DIRECTION.md 3d). The More hub is the case that motivates it. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
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

  /* Everything the browser does with a click that is not "follow this link
     here" is left alone: a middle click and ctrl/cmd open a tab, shift a
     window, alt downloads, and a right-click never reaches this at all.
     Only the plain one is ours to redirect. */
  function goBack(event: MouseEvent) {
    if (typeof back !== 'string') return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    /* Before SvelteKit's own document-level link handler, which reads this
       flag and stands down - so the fallback below is the only navigation
       either of us makes. */
    event.preventDefault();
    smartBack(back);
  }
</script>

<header class="screen-header {klass}" class:is-collapsed={titleHidden && !back && !actions} data-screen-header>
  <!-- The subtitle is a row of its own rather than a second line inside the
       title's box. Beside the back control it would centre the arrow
       against the whole block, which drops it to the middle of a header
       whose subtitle runs to four lines - and several of these do, because
       they were written as lead paragraphs. On its own row it also keeps
       the body's measure instead of being squeezed between an arrow and an
       action. -->
  <!-- The back control is on its own line above the title rather than beside
       it (Alicja, 2026-08-25: the header text "shouldn't be more to the right
       than the smaller text below it"). Beside it, a 48px control pushed the
       title 48px in while the date, the hints and every section heading under
       it started at the screen's own edge, so the largest text on the screen
       was the one thing out of the column. Above it, the title starts where
       the content does and the arrow keeps its full target. Material's own
       large-title pattern puts it there too. -->
  <div class="screen-header-row">
    {#if typeof back === 'string'}
      <a
        class="icon-btn press screen-back"
        href={back}
        data-screen-back
        aria-label={backLabel ?? m.back()}
        onclick={goBack}
      >
        <Icon name="arrowLeft" />
      </a>
    {:else if back}
      <button class="icon-btn press screen-back" data-screen-back aria-label={backLabel ?? m.back()} onclick={back}>
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
