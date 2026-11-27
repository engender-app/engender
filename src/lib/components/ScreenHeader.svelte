<script lang="ts">
  /* ScreenHeader owns the field, its ink and bleed. Use display type there and
     put smaller controls on page colours. A normal back click calls smartBack
     and falls back to its href. Keep the anchor for modified clicks and use a
     callback for local editor state.
     titleHidden keeps the heading accessible. A field with only door content
     has 16px padding. Visible titles use 40px above. Settings is chrome
     (ADR-0076). The 1024px rail replaces its phone back control. */
  import type { Snippet } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { crossfade, resize } from '$lib/motion/reveal';
  import Icon from './Icon.svelte';
  import UpdateNoticeSlot from './UpdateNoticeSlot.svelte';

  let {
    title,
    subtitle,
    back,
    backLabel,
    screen,
    titleHidden = false,
    chrome = false,
    class: klass = '',
    actions,
    blindContent,
    field,
    heading,
    compact = false,
    aside
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
    /** Rule 7's third case: chrome, whose back control is the phone's only. */
    chrome?: boolean;
    class?: string;
    actions?: Snippet;
    /** Decoration painted inside the field's clipping blind. */
    blindContent?: Snippet;
    /** What this door puts on the field under the title's line (rule 7). */
    field?: Snippet;
    /** The title's words, drawn by a screen that moves them itself: a new
        entry's steps swap their heading as one step leaves and the next
        arrives. `title` stays the plain text everywhere else. */
    heading?: Snippet;
    /** A step's field: the back control over a title at the
        number size rather than the screen size, so the answers under it
        get the room a step needs to fit the window. */
    compact?: boolean;
    /** Drawn at the trailing end of the subtitle's line: a step's progress. */
    aside?: Snippet;
  } = $props();

  /* Everything the browser does with a click that is not "follow this link
     here" is left alone: ctrl/cmd opens a tab, shift a window, alt
     downloads, and a middle click fires `auxclick` rather than this and
     never arrives. Only the plain one is ours to redirect. */
  function goBack(event: MouseEvent) {
    if (typeof back !== 'string') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    /* Before SvelteKit's own document-level link handler, which reads this
       flag and stands down - so the fallback below is the only navigation
       either of us makes. */
    event.preventDefault();
    smartBack(back);
  }
</script>

<header
  class="screen-header {klass}"
  class:is-collapsed={titleHidden && !back && !actions && !field}
  class:is-field-only={titleHidden && !back && !actions && !!field}
  class:is-chrome={chrome}
  class:is-compact={compact}
  data-screen-header
>
  <!-- The subtitle is a row of its own rather than a second line inside the
       title's box. Beside the back control it would centre the arrow
       against the whole block, which drops it to the middle of a header
       whose subtitle runs to four lines - and several of these do, because
       they were written as lead paragraphs. On its own row it also keeps
       the body's measure instead of being squeezed between an arrow and an
       action. -->
  <!-- The back control is on its own line above the title rather than beside it. Beside it,
       a 48px control pushed the title 48px in while the date, the hints and every section
       heading under it started at the screen's own edge, so the largest text on the screen
       was the one thing out of the column. Above it, the title starts where the content
       does and the arrow keeps its full target. Material's own large-title pattern puts it
       there too. -->
  <!-- activeFlag sets --field and --field-ink behind back, title and
       actions, including after a disguised unlock. Keep the subtitle
       on the page below. The nonbinary field reaches 4.41:1, so its
       text must be at least 24px or 18.66px bold. direction-contracts.ts
       checks the field type sizes. -->
  <div class="screen-field" data-screen-field use:resize>
    <!-- The blind: the field's colour, split off from
         the box that measures it so the two can move on different clocks
         during a navigation. Decoration and nothing else - what it paints
         at rest is exactly the field, since the field clips it. -->
    <div class="field-blind" data-field-blind aria-hidden="true">{@render blindContent?.()}</div>
    <div class="screen-header-row" class:has-back-actions={!!back && !!actions}>
      {#if typeof back === 'string'}
        <a
          class="icon-btn press screen-back"
          href={back}
          data-screen-back
          data-field-part
          aria-label={backLabel ?? m.back()}
          onclick={goBack}
        >
          <Icon name="arrowLeft" />
        </a>
      {:else if back}
        <button class="icon-btn press screen-back" data-screen-back data-field-part aria-label={backLabel ?? m.back()} onclick={back}>
          <Icon name="arrowLeft" />
        </button>
      {/if}

      <!-- Named for the navigation only while it is painted: a hidden title
           is still the screen's heading, and a heading nobody can see has
           nothing to leave or arrive with. -->
      <h1
        class="screen-title"
        class:visually-hidden={titleHidden}
        data-screen-title={screen ?? ''}
        data-field-part={titleHidden ? undefined : ''}
      >
        {#if heading}{@render heading()}{:else}{title}{/if}
      </h1>

      {#if actions}
        <div class="header-action" data-field-part>{@render actions()}</div>
      {/if}
    </div>

    <!-- Under the title's line, still on the block: the field's own
         contents, which are the door's (rule 7). -->
    {#if field}
      <div class="screen-field-slot" data-field-part>{@render field()}</div>
    {/if}
  </div>

  <!-- Under the field and over the subtitle: a waiting release, if there is
       one (UpdateNoticeSlot.svelte). -->
  <UpdateNoticeSlot />

  {#snippet subtitleLine()}
    <p class="screen-subtitle" data-screen-subtitle use:resize>
      {#key subtitle}<span out:crossfade>{subtitle}</span>{/key}
    </p>
  {/snippet}

  {#if subtitle && aside}
    <!-- A step's date line shares its one line with the step's progress,
         which sits at its trailing end. -->
    <div class="screen-subtitle-line">
      {@render subtitleLine()}
      <div class="screen-subtitle-aside">{@render aside()}</div>
    </div>
  {:else if subtitle}
    <!-- A line that lands from a read (the return surface's, most visibly)
         swaps its words once while the screen is up. Keyed, so the previous
         line fades off the one replacing it - DayStrip's own treatment of a
         label that swaps - instead of cutting. Local by default: a screen
         arriving or leaving never plays it. And the line's height travels
         with it: the return surface's answer is a line longer than the one
         it replaces, and the page under the header took those 23px in one
         frame. -->
    {@render subtitleLine()}
  {/if}
</header>
