<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  import Icon from './Icon.svelte';
  import { nearestScrollLeft } from './segmentedTrack';
  import { EASE_OUT, crossfadeDuration, fadeOnly, isReducedMotion, motionDuration, scrollBehavior } from '$lib/motion/tokens';
  import type { TransitionConfig } from 'svelte/transition';
  import {
    boxesMatch,
    insets,
    schedules,
    travel,
    LEAD,
    PLACE,
    type Box,
    type Insets,
    type Schedule
  } from '$lib/motion/indicator';

  /* One pill moves between segments. Share the navigation's indicator.ts
     timing: the leading edge decelerates towards the target and the trailing
     edge catches up. The gap between the segments determines the stretch.
     Measure the segments here because their bounds belong to the DOM. */
  let {
    name,
    options,
    value,
    onChange,
    compact = false,
    selectOnArrow = true,
    key,
    grows = false
  }: {
    name: string;
    /** A `href` makes the segment a link and the group a nav: each choice is its own screen
        at its own URL, so switching is navigation and belongs in history. Wrapped's four
        cadences are that, and they had a hand-written copy of this control with no pill on
        it, so the same gesture looked like two different controls one tab apart. */
    options: { value: string; label: string; href?: string; aria?: string }[];
    value: string;
    onChange?: (v: string) => void;
    /** For a set of short labels - a range in days, a number of steps. The buttons keep
        their 48dp press height and the pill is drawn shorter inside it, so what slides
        reads as a pill crossing the set rather than as a dot moving between dots. Six
        segments reading "7d" to "365d" were 52px wide and 42px tall, which is a circle, and
        a circle sliding says nothing about the set it is crossing. */
    compact?: boolean;
    /** Disable when a selection changes context, such as a language reload. */
    selectOnArrow?: boolean;
    /** The group's own identity for the walkthrough's handle (ADR-0029). */
    key?: string;
    /** For a set the person edits while the screen is up: a segment added, removed or
        renamed opens or closes its own width rather than landing in one frame and shoving
        its neighbours along. A rename is a new segment in place of the old one, so its
        width travels too. Off everywhere else, where the set is fixed and nothing about
        this is wanted. */
    grows?: boolean;
  } = $props();

  /* The segment's width, its side padding and its share of the gap all
     travel, with the label fading: animating width alone left the padding
     standing, so a new segment arrived 24px wide in its first frame. */
  /* While a segment opens or closes, the chosen one moves or the track
     changes width under the pill every frame, and the pill is pinned by
     two insets that otherwise travel on their own clocks: measured once,
     it stretched with the growing track (72 to 101px) or sat at the
     width a renamed segment had in its first frame (0px). So for the
     length of the change it is re-pinned each frame, instantly. */
  function followChosen() {
    const target = track?.querySelector<HTMLElement>(`.segment[data-segment="${CSS.escape(value)}"]:not([data-leaving])`);
    if (!track || !target || !pill.shown) return;
    const box = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
    pill = { ...pill, box, at: insets(box, { w: track.clientWidth, h: track.clientHeight }), near: PLACE, far: PLACE };
  }

  function segmentLeaving(node: Element): TransitionConfig {
    node.setAttribute('data-leaving', '');
    return segmentWidth(node);
  }

  function segmentWidth(node: Element): TransitionConfig {
    if (!grows || !(node instanceof HTMLElement)) return { duration: 0 };
    /* Reduced motion keeps the arrival as a crossfade: the width lands at
       once, the label still fades rather than cutting in. */
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    const style = getComputedStyle(node);
    const width = node.getBoundingClientRect().width;
    const padStart = parseFloat(style.paddingInlineStart) || 0;
    const padEnd = parseFloat(style.paddingInlineEnd) || 0;
    const gap = node.previousElementSibling?.classList.contains('segment')
      ? parseFloat(getComputedStyle(node.parentElement!).columnGap) || 0
      : 0;
    /* Written from `tick` rather than as `css`, so the segment's width and
       the pill's re-pinning land in the same frame: a CSS animation is
       resolved after this frame's script, and a pill measured against it
       ran one frame behind the track (101px on a 72px segment). */
    const at = (t: number) => {
      const set = (name: string, value: string) => node.style.setProperty(name, value);
      set('overflow', 'hidden');
      set('white-space', 'nowrap');
      set('box-sizing', 'border-box');
      set('min-width', '0');
      set('width', `${t * width}px`);
      set('max-width', `${t * width}px`);
      set('padding-inline', `${t * padStart}px ${t * padEnd}px`);
      set('opacity', `${t}`);
      if (gap) set('margin-inline-start', `${(t - 1) * gap}px`);
    };
    /* An arriving segment is closed before the frame it was inserted in
       paints; the first tick comes a frame later, and the segment drew
       itself whole for that one frame (the track read 240px, then 229). */
    if (!node.hasAttribute('data-leaving')) at(0);
    return {
      duration: motionDuration('--dur-med'),
      easing: EASE_OUT,
      tick: (t) => {
        if (t >= 1 && !node.hasAttribute('data-leaving')) node.removeAttribute('style');
        else at(t);
        followChosen();
      }
    };
  }


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

  /* The track scrolls when segments exceed its width. Each overflow flag
     adds an edge fade and a chevron to replace the hidden scrollbar's cue.
     The chevron stays visible even if too little of a clipped label is
     left to fade. Its background supplies the fade so text cannot obscure
     the mark. */
  let track = $state<HTMLElement | undefined>();
  let trackSize = $state({ w: 0, h: 0 });
  let canScrollStart = $state(false);
  let canScrollEnd = $state(false);
  /* Whether the track has anywhere to scroll at all, which is a different question from
     either of the two above: those say which edge still has something past it *right now*,
     and both are false at rest on a track that does scroll but happens to be sitting at one
     end. The trailing spacer is keyed to this one - on a track that fits, the spacer and
     the gap in front of it were 11px of dead background after the last segment, so the pill
     stopped short of the end while the first segment sat flush against the start. */
  let canScroll = $state(false);

  function updateScrollFade() {
    if (!track) return;
    /* Against the first and last segment's own edges, not scrollWidth and clientWidth: the
       track carries a few pixels of trailing padding past its last segment on purpose (the
       spacer below, so that segment does not run flush into the track's rounded corner),
       and that padding is itself a few pixels of "more to scroll" with no segment behind
       it. Measuring the raw scroll range flagged that padding as more content and hinted at
       it even with the last option already fully in view. */
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

  /* Drag to scroll, for the pointer that has no flick. A touch pans the track natively; a
     mouse had nothing - "i cannot click and slide nor scroll on web" - so pressing and
     sliding now moves the track itself, and the press only becomes a selection if it never
     turned into a drag. The moved flag is what keeps those two honest: a release after a
     real drag suppresses the click the browser still fires at the segment under the
     pointer, link or button, so a flick past "90d" does not land on "180d". */
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
    const observer = new ResizeObserver(() => {
      trackSize = { w: el.clientWidth, h: el.clientHeight };
      updateScrollFade();
    });
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollFade);
      observer.disconnect();
    };
  });

  $effect(() => {
    void trackSize;
    /* With `grows`, a renamed segment is a new node beside the old one for
       the length of the old one's exit, and the index the binding writes
       to is not guaranteed to hold the arriving one: the pill followed the
       leaving "Front" down to nothing. So it finds the chosen segment by
       its value, skipping one on its way out. */
    const target = grows
      ? track?.querySelector<HTMLElement>(`.segment[data-segment="${CSS.escape(value)}"]:not([data-leaving])`) ?? undefined
      : buttons[options.findIndex((o) => o.value === value)];
    if (!target) return;
    /* Make the active segment visible by adjusting the track's scrollLeft.
       scrollIntoView can scroll ancestors, including the page, even with
       block: 'nearest'. Keep first placement instant and ease later
       corrections up to the chevron's 26px. */
    if (!track) return;
    const left = nearestScrollLeft(track, target);
    if (Math.abs(track.scrollLeft - left) >= 1) {
      track.scrollTo({ left, behavior: pill.shown ? scrollBehavior() : 'auto' });
    }
    /* Named rather than inlined twice: the first-placement branch below
       measures again, a frame later, against whichever of `target`/`track`
       is current then - which is the same shape, at a different time, not a
       second thing to keep in sync with this one. */
    const measure = (segment: HTMLElement, host: HTMLElement) => {
      const box = {
        x: segment.offsetLeft,
        y: segment.offsetTop,
        w: segment.offsetWidth,
        h: segment.offsetHeight
      };
      /* The insets are measured against the track's padding box, which is
         what both `offsetLeft` and `left`/`right` resolve against - so a
         scrolled track needs no correction, and a segment past its fold
         gives a negative `right`, correctly. */
      return { box, at: insets(box, { w: host.clientWidth, h: host.clientHeight }) };
    };
    const { box, at } = measure(target, track);
    /* boxesMatch rather than exact equality, which is what this measurement
       used to use: a track that reflows by a third of a pixel is the same
       place, and replaying the travel on every resize tick would turn a
       moment into a loop. indicator.ts's own note on that floor. */
    if (pill.shown && boxesMatch(pill.box, box)) {
      // A narrower track changes the far inset even when the segment stays put.
      pill.at = at;
      return;
    }
    /* Place the pill on its initial segment before fading it in. A later
       non-slide measurement moves both edges on the leading clock.

       After mounting, schedule a timer inside requestAnimationFrame so
       opacity: 0 has a frame to paint. A bare rAF runs before that paint
       and can skip the fade. Remeasure the current track and target when
       the timer fires because layout may have changed. */
    if (!pill.shown) {
      const settledTarget = target;
      const settledTrack = track;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          pill = { ...measure(settledTarget, settledTrack), shown: true, near: PLACE, far: PLACE };
        });
      });
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }
    pill = { box, at, shown: true, ...schedules(travel(pill.box, box, 'x')) };
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
        <!-- Replaces rather than pushes. A switcher shows a different view of the screen
             you are already on, so each flick of it is not a place to come back to: pushed,
             the back arrow spent one tap per switch undoing them instead of leaving the
             screen. `screen-transition.ts` already says the same thing about these in its
             own table, where crossing them is tier 3 rather than a navigation.
             data-no-press: the pill crossing the set is already this control's press
             response. -->
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
      class:can-scroll={canScroll}
      data-segmented={key}
      role="radiogroup"
      use:rovingRadio={{ selectOnArrow }}
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
      {#each options as o, i (grows ? `${o.value}:${o.label}` : o.value)}
        <!-- data-no-press: the pill crossing the set is already
             this control's press response; scaling the label too would answer
             the same touch twice. -->
        <button
          bind:this={buttons[i]}
          class="segment"
          class:is-active={o.value === value}
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.aria}
          data-segment={o.value}
          data-no-press
          in:segmentWidth
          out:segmentLeaving
          onclick={() => onChange?.(o.value)}>{o.label}</button
        >
      {/each}
    </div>
  {/if}
  <!-- Always in the page and faded by class rather than added and removed:
       a choice that scrolls the track brings a
       chevron in or takes one away, and an {#if} painted it whole in one
       frame. -->
  <span class="segmented-hint segmented-hint-start" class:is-shown={canScrollStart} aria-hidden="true"
    ><Icon name="chevronLeft" size={14} /></span
  >
  <span class="segmented-hint segmented-hint-end" class:is-shown={canScrollEnd} aria-hidden="true"
    ><Icon name="chevronRight" size={14} /></span
  >
</div>
