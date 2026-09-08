<script lang="ts">
  import Icon from './Icon.svelte';
  import { nearestScrollLeft } from './segmentedTrack';
  import { nextRadioIndex } from './rovingRadioIndex';
  import {
    boxesMatch,
    insets,
    schedules,
    travel,
    LEAD,
    type Box,
    type Insets,
    type Schedule
  } from '$lib/motion/indicator';

  /* A choice among a few peers. The pill behind the chosen one is a single
     element that slides between them rather than a background that appears on
     one and disappears from another: the point of a segmented control is that
     the options are a set, and a pill crossing the set says which one you came
     from as well as which one you are on.

     It stretches along the way. Nothing physical changes position without
     deforming a little, and a pill that arrives the same width it left reads
     as a diagram of a slide rather than as a thing sliding.

     How it stretches is the navigation's mechanic, shared rather than
     transcribed (2026-09-08, Alicja: "apply the same motion to the switcher
     animations... the leading/trailing animation and pace only"). It used to
     deform symmetrically - both edges leaving together, out from the centre,
     by a fixed 12% - which reads as one object pulled from both ends. Now the
     edge nearer the destination leaves first and decelerates, and the edge
     left behind holds, gathers and catches up, so the width in between is the
     real gap between the two segments rather than a tuned percentage of
     anything. $lib/motion/indicator.ts owns both the arithmetic and the two
     edges' clocks; what stays here is the measuring, because only the DOM
     knows where a segment is.

     Not taken from the navigation: its pill's outline, and the swing its
     destination icon does on arrival. A segment has no icon, and this pill is
     a block of ink rather than a tinted field, so it needs no help being
     seen. */
  let {
    name,
    options,
    value,
    onChange,
    compact = false,
    key
  }: {
    name: string;
    /** A `href` makes the segment a link and the group a nav: each choice is
        its own screen at its own URL, so switching is navigation and belongs
        in history. Wrapped's four cadences are that, and they had a
        hand-written copy of this control with no pill on it, so the same
        gesture looked like two different controls one tab apart (Alicja,
        2026-08-25). */
    options: { value: string; label: string; href?: string }[];
    value: string;
    onChange?: (v: string) => void;
    /** For a set of short labels - a range in days, a number of steps. The
        buttons keep their 48dp press height and the pill is drawn shorter
        inside it, so what slides reads as a pill crossing the set rather
        than as a dot moving between dots. Six segments reading "7d" to
        "365d" were 52px wide and 42px tall, which is a circle, and a circle
        sliding says nothing about the set it is crossing (Alicja,
        2026-08-25). */
    compact?: boolean;
    /** The group's own identity for the walkthrough's handle (ADR-0029). */
    key?: string;
  } = $props();

  let links = $derived(options.some((o) => o.href !== undefined));
  let buttons = $state<(HTMLElement | undefined)[]>([]);

  /* The pill's own box, the two insets it is pinned by, and a clock per edge
     of the axis it travels on. `placed` is what the old code kept as a bare
     boolean: the control does not slide into its own initial state, it starts
     there. Until it is placed, --seg-right is unset and the pill is
     zero-width (components.css).

     `at` carries all four insets even though only two of them travel: they
     come from one measurement and splitting them would mean two. */
  type Pill = { box: Box; at: Insets; shown: boolean; near: Schedule; far: Schedule };

  let pill = $state<Pill>({
    box: { x: 0, y: 0, w: 0, h: 0 },
    at: { left: 0, right: 0, top: 0, bottom: 0 },
    shown: false,
    near: LEAD,
    far: LEAD
  });

  /* The one radio the roving tabindex leaves in the tab order: the selected
     one, or the first while nothing is (a fresh group with no value yet). */
  let activeIndex = $derived.by(() => {
    const i = options.findIndex((o) => o.value === value);
    return i === -1 ? 0 : i;
  });

  function onRadioKeydown(e: KeyboardEvent, i: number) {
    const next = nextRadioIndex(e.key, i, options.length);
    if (next === null) return;
    e.preventDefault();
    buttons[next]?.focus();
    onChange?.(options[next].value);
  }

  /* The track scrolls rather than shrinks when its segments run wider than
     it is (Alicja, 2026-08-26, "the pill came out 48 by 48" - shrinking was
     tried and rejected). But its scrollbar is hidden (`.segmented`'s own
     rule, below) for the same reason a native one is hidden everywhere else
     in the app, and a control that scrolls with no visible scrollbar and no
     other hint looks exactly like one that has simply run out of room -
     "pain"/"severity" cut "severe" off flush against the sheet's edge with
     nothing to suggest there was more (Alicja, 2026-08-27). These two flags
     draw a fade over whichever edge still has content past it, which is the
     hint a hidden scrollbar took away.

     The fade alone still missed the case that named it: the label past the
     edge only shows however many of its own pixels the track has not
     already clipped, and a short gap between segments can leave next to
     nothing there to fade at all - "barely noticeable" cutting "mild" off
     with no sign there was more (Alicja, 2026-08-28). A chevron is a fixed
     hint that never depends on how a neighbouring label happens to break,
     so it carries the affordance the fade alone could not promise; the fade
     stays as the softer cue for the cases it does catch. */
  let track = $state<HTMLElement | undefined>();
  let canScrollStart = $state(false);
  let canScrollEnd = $state(false);
  /* Whether the track has anywhere to scroll at all, which is a different
     question from either of the two above: those say which edge still has
     something past it *right now*, and both are false at rest on a track
     that does scroll but happens to be sitting at one end. The trailing
     spacer is keyed to this one (ticket 99 item 24, "last value highlight
     in switcher doesn't reach the end of the bg") - on a track that fits,
     the spacer and the gap in front of it were 11px of dead background
     after the last segment, so the pill stopped short of the end while the
     first segment sat flush against the start. */
  let canScroll = $state(false);

  function updateScrollFade() {
    if (!track) return;
    /* Against the first and last segment's own edges, not scrollWidth and
       clientWidth: the track carries a few pixels of trailing padding past
       its last segment on purpose (the spacer below, so that segment does
       not run flush into the track's rounded corner), and that padding is
       itself a few pixels of "more to scroll" with no segment behind it.
       Measuring the raw scroll range flagged that padding as more content
       and hinted at it even with the last option already fully in view
       (Alicja, 2026-08-28, on the wrapped cadence tabs opened on "Range"). */
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) {
      canScrollStart = false;
      canScrollEnd = false;
      canScroll = false;
      return;
    }
    canScrollStart = first.offsetLeft < track.scrollLeft - 1;
    canScrollEnd = last.offsetLeft + last.offsetWidth > track.scrollLeft + track.clientWidth + 1;
    /* Where the last segment ends, measured against the segments rather
       than the raw scroll range: the spacer this answer controls is itself
       part of `scrollWidth`, so asking that would make adding the spacer
       the reason the spacer is wanted. Asked this way the answer stays the
       same once it is there. */
    canScroll = last.offsetLeft + last.offsetWidth > track.clientWidth + 1;
  }

  // Re-measured whenever the option set changes shape, not only on scroll.
  $effect(() => {
    void options;
    updateScrollFade();
  });

  /* Drag to scroll, for the pointer that has no flick. A touch pans the
     track natively; a mouse had nothing - "i cannot click and slide nor
     scroll on web" (Alicja, phase 5 ticket 99 round 3) - so pressing and
     sliding now moves the track itself, and the press only becomes a
     selection if it never turned into a drag. The moved flag is what keeps
     those two honest: a release after a real drag suppresses the click the
     browser still fires at the segment under the pointer, link or button,
     so a flick past "90d" does not land on "180d". */
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragMoved = false;

  function onTrackPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    dragStartX = e.clientX;
    dragStartScroll = track?.scrollLeft ?? 0;
    dragMoved = false;
  }
  function onTrackPointerMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.buttons === 0 || track === undefined) return;
    const dx = e.clientX - dragStartX;
    if (!dragMoved && Math.abs(dx) < 5) return;
    if (!dragMoved) {
      dragMoved = true;
      track.setPointerCapture(e.pointerId);
    }
    track.scrollLeft = dragStartScroll - dx;
  }
  function onTrackClickCapture(e: MouseEvent) {
    if (dragMoved) {
      e.preventDefault();
      e.stopPropagation();
      dragMoved = false;
    }
  }

  $effect(() => {
    if (!track) return;
    const el = track;
    el.addEventListener('scroll', updateScrollFade, { passive: true });
    window.addEventListener('resize', updateScrollFade);
    return () => {
      el.removeEventListener('scroll', updateScrollFade);
      window.removeEventListener('resize', updateScrollFade);
    };
  });

  $effect(() => {
    const target = buttons[options.findIndex((o) => o.value === value)];
    if (!target) return;
    /* The active segment answers for itself: a track wider than it is (the
       cadence tabs opened straight onto the last one, "Range") never had a
       reason to scroll before this ran, so nothing had brought it into view -
       the pill sat correctly positioned past the visible edge, and only the
       track's own clip made it look like the highlight had not reached the
       end of the background (Alicja, 2026-08-28).

       This was `target.scrollIntoView({ inline: 'nearest', block: 'nearest' })`
       and the comment beside it claimed that never touches the page's own
       scroll. It does, whenever the control is below the fold: `block:
       'nearest'` scrolls every scrollable ancestor the least amount that
       brings the element into view, and the app's own scroll region is one
       of those. Arriving on the wear log - a switcher under a long list -
       scrolled the screen down to the switcher before the person had
       touched anything (phase 8 features ticket 66). Moving the track's own
       scrollLeft is what this always meant, and it cannot move an ancestor
       at all. */
    if (track) track.scrollLeft = nearestScrollLeft(track, target);
    if (!track) return;
    const box = {
      x: target.offsetLeft,
      y: target.offsetTop,
      w: target.offsetWidth,
      h: target.offsetHeight
    };
    /* boxesMatch rather than exact equality, which is what this measurement
       used to use: a track that reflows by a third of a pixel is the same
       place, and replaying the travel on every resize tick would turn a
       moment into a loop. indicator.ts's own note on that floor. */
    if (pill.shown && boxesMatch(pill.box, box)) return;
    /* The insets are measured against the track's padding box, which is what
       both `offsetLeft` and `left`/`right` resolve against - so a scrolled
       track needs no correction, and a segment past its fold gives a
       negative `right`, correctly. */
    const at = insets(box, { w: track.clientWidth, h: track.clientHeight });
    /* The control does not slide into its own initial state, it starts
       there: both edges on the leading clock, so the shape arrives as one
       piece. */
    const dir = pill.shown ? travel(pill.box, box, 'x') : 0;
    pill = { box, at, shown: true, ...schedules(dir) };
  });
</script>

{#snippet pillMark()}
  <span class="segment-pill" class:is-shown={pill.shown} aria-hidden="true"></span>
{/snippet}

<!-- A nav of links or a radiogroup of buttons, written out rather than
     resolved through <svelte:element>: the two carry different keyboard
     behaviour and different announcements, and the tag has to be legible to
     the compiler for it to check either. The pill and its measuring are the
     same either way, which is the whole point of the two living here.

     Wrapped in its own box so the chevron hints can sit outside the
     scrolling track: inside it they would be flex items of their own,
     scrolling away with the segments rather than staying put at the edge
     they are marking. -->
<div class="segmented-wrap" class:is-compact={compact}>
  {#if links}
    <nav
      bind:this={track}
      class="segmented"
      class:is-compact={compact}
      class:can-scroll-start={canScrollStart}
      class:can-scroll-end={canScrollEnd}
      class:can-scroll={canScroll}
      data-segmented={key}
      aria-label={name}
      onpointerdown={onTrackPointerDown}
      onpointermove={onTrackPointerMove}
      onclickcapture={onTrackClickCapture}
      ondragstart={(e) => e.preventDefault()}
      style:--seg-left="{pill.at.left}px"
      style:--seg-right="{pill.at.right}px"
      style:--seg-near-dur={pill.near.dur}
      style:--seg-near-ease={pill.near.ease}
      style:--seg-near-delay={pill.near.delay}
      style:--seg-far-dur={pill.far.dur}
      style:--seg-far-ease={pill.far.ease}
      style:--seg-far-delay={pill.far.delay}
    >
      {@render pillMark()}
      {#each options as o, i (o.value)}
        <!-- Replaces rather than pushes. A switcher shows a different view of
             the screen you are already on, so each flick of it is not a place
             to come back to: pushed, the back arrow spent one tap per switch
             undoing them instead of leaving the screen (Alicja, 2026-08-26).
             `screen-transition.ts` already says the same thing about these in
             its own table, where crossing them is tier 3 rather than a
             navigation. data-no-press (ticket 15): the pill crossing the set
             is already this control's press response. -->
        <a
          bind:this={buttons[i]}
          class="segment"
          class:is-active={o.value === value}
          aria-current={o.value === value ? 'page' : undefined}
          data-segment={o.value}
          data-sveltekit-replacestate
          data-no-press
          href={o.href}>{o.label}</a
        >
      {/each}
    </nav>
  {:else}
    <div
      bind:this={track}
      class="segmented"
      class:is-compact={compact}
      class:can-scroll-start={canScrollStart}
      class:can-scroll-end={canScrollEnd}
      class:can-scroll={canScroll}
      data-segmented={key}
      role="radiogroup"
      tabindex="-1"
      aria-label={name}
      onpointerdown={onTrackPointerDown}
      onpointermove={onTrackPointerMove}
      onclickcapture={onTrackClickCapture}
      ondragstart={(e) => e.preventDefault()}
      style:--seg-left="{pill.at.left}px"
      style:--seg-right="{pill.at.right}px"
      style:--seg-near-dur={pill.near.dur}
      style:--seg-near-ease={pill.near.ease}
      style:--seg-near-delay={pill.near.delay}
      style:--seg-far-dur={pill.far.dur}
      style:--seg-far-ease={pill.far.ease}
      style:--seg-far-delay={pill.far.delay}
    >
      {@render pillMark()}
      {#each options as o, i (o.value)}
        <!-- data-no-press (ticket 15): the pill crossing the set is already
             this control's press response; scaling the label too would answer
             the same touch twice. -->
        <button
          bind:this={buttons[i]}
          class="segment"
          class:is-active={o.value === value}
          role="radio"
          aria-checked={o.value === value}
          tabindex={i === activeIndex ? 0 : -1}
          data-segment={o.value}
          data-no-press
          onclick={() => onChange?.(o.value)}
          onkeydown={(e) => onRadioKeydown(e, i)}>{o.label}</button
        >
      {/each}
    </div>
  {/if}
  {#if canScrollStart}
    <span class="segmented-hint segmented-hint-start" aria-hidden="true"><Icon name="chevronLeft" size={14} /></span>
  {/if}
  {#if canScrollEnd}
    <span class="segmented-hint segmented-hint-end" aria-hidden="true"><Icon name="chevronRight" size={14} /></span>
  {/if}
</div>
