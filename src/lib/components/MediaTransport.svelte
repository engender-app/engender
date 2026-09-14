<script lang="ts">
  /* The transport both players wear (ticket 46).

     Until this ticket a recording was handed to the reader in a bare
     `<audio controls>` and a video note in a bare `<video controls>`, each
     with a comment saying the browser's own transport was accessible and
     familiar and that nothing asked for a custom look. Something asks now:
     a recorded voice and a video note are two of the most personal things
     this app holds, and both were drawn by another vendor in another
     vendor's shapes - rounded pills, its own greys, a shadow under the
     scrubber's thumb, none of it reachable by a token.

     **Why this is not a library.** Plyr was the ticket's first candidate and
     was measured rather than argued about: 32.9KB of JavaScript and 5.2KB of
     CSS gzipped, twelve `box-shadow` declarations (three of them literals
     with no custom property to override), thirteen distinct `border-radius`
     values against this app's budget of one, and an icon sprite plus a blank
     video that default to `cdn.plyr.io` in an app that has to work with the
     radio off. Vidstack's `media-core` alone is 22.2KB gzipped before any UI
     of any kind, and its production core names a CDN too. Both were being
     bought for their control bar - and the control bar is the part this ticket
     replaces, because the audio scrub has to be the recording's own waveform
     and no library draws one for video as well. What is left to buy is
     keyboard handling and ARIA, which melt (already a dependency, already
     the app's one slider) gives for the price of a builder.

     **What the native elements were buying, and how it is paid back.** Both
     were keyboard-operable and screen-reader labelled with nobody doing any
     work. So: the play control is a button with a label that changes with
     its state, the scrub is a real `role="slider"` with min, max, now and a
     spoken `aria-valuetext` (melt's), it answers the arrow keys in five
     second steps and Home/End like a media element does, and `tests/
     browser-tier/media-transport.mjs` drives both media by keyboard alone.

     The engine is still the native element - this draws its transport and
     never its own decoder. The element is passed in rather than made here
     because the two callers differ in the one thing a transport does not
     care about: one has a frame to show and one does not. */
  import { untrack, type Snippet } from 'svelte';
  import { Slider as MeltSlider } from 'melt/builders';
  import Icon from './Icon.svelte';
  import { m } from '$lib/paraglide/messages';
  import { barCountFor, barsAt } from '$lib/media/peaks';
  import { claimPlayback, formatClock } from '$lib/media/playback';

  let {
    media,
    peaks = null,
    playing = $bindable(false),
    onDuration,
    trailing
  }: {
    /** The element being driven. Undefined until it mounts. */
    media?: HTMLMediaElement;
    /** A recording's bars (media/peaks.ts). Null for a video note, and for
        a recording whose bars have not been decoded yet: both draw the plain
        track, which is the same track with nothing written on it. */
    peaks?: Float32Array | null;
    /** Whether the element is playing, for a caller that draws something of
        its own over it - the video note's centre control. */
    playing?: boolean;
    /** Called with the media's length once the browser knows it, for a
        screen that reads something off it - the memo browser's total. */
    onDuration?: (seconds: number) => void;
    /** A control at the end of the row: the video note's full screen. */
    trailing?: Snippet;
  } = $props();

  /** The waveform's height. Sized against the play control beside it - a
      28px wave under a 44px block read as a thin line next to a solid
      square (Alicja, on the ticket's sign-off renders). */
  const WAVE_HEIGHT = 36;

  let duration = $state(0);
  let position = $state(0);
  /** True while a finger or a key is moving the playhead, which is when the
      element's own time stops being the thing to draw. */
  let scrubbing = $state(false);
  let trackWidth = $state(0);

  /** The bars this track is wide enough to draw, or none, which is the plain
      track. Recomputed only when the width or the recording changes. */
  const bars = $derived(peaks ? barsAt(peaks, barCountFor(trackWidth)) : null);

  const shownAt = $derived(Math.min(position, duration || 0));
  const fraction = $derived(duration > 0 ? shownAt / duration : 0);

  /* Where the playhead is, in pixels along the track, as one custom property
     the drawing reads twice: the played bars are clipped to it and the head
     itself is translated by it. One write per frame, no layout, and the two
     can never disagree about where the playhead is. */
  const playedPx = $derived(trackWidth * fraction);

  /** The bar the playhead is standing on, which rises while it is the one
      being played and settles back as the playhead moves off it. */
  const liveBar = $derived(bars ? Math.min(bars.length - 1, Math.floor(fraction * bars.length)) : -1);

  const slider = new MeltSlider({
    min: () => 0,
    max: () => Math.max(duration, 0.001),
    /* Fine enough that a drag is continuous rather than stepped at any
       length a journal holds; the keyboard does not use it (below). */
    step: () => Math.max(duration, 1) / 1000,
    value: () => shownAt,
    onValueChange: (v) => seek(v)
  });

  /* Melt registers its window pointermove/pointerup pair inside the `root`
     getter, so their lifetime belongs to whoever reads it. Read only from the
     template's spread they are torn down and re-attached on every value
     change - and this value changes sixty times a second while playing.
     Read once here, untracked, exactly as Slider.svelte does and for the
     reason written out in full there. */
  $effect(() => {
    untrack(() => slider.root);
  });

  function seek(seconds: number) {
    const to = Math.max(0, Math.min(seconds, duration || 0));
    position = to;
    if (media) media.currentTime = to;
  }

  function toggle() {
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
  }

  /* The arrow keys move a media element by five seconds, not by one step of
     a slider, and that is the behaviour being replaced here. Melt's own
     keyboard handling is the generic slider one, so this stands in front of
     it rather than beside it. */
  function onKeyDown(event: KeyboardEvent) {
    const jump =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 5
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -5
          : 0;
    if (jump !== 0) {
      event.preventDefault();
      seek(shownAt + jump);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      seek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seek(duration);
    }
  }

  /* The element's own time, read on every animation frame rather than on
     `timeupdate`. The event fires about four times a second, which draws a
     playhead that stands still for 250ms and then jumps - four yanks a
     second, by the standing rule. */
  $effect(() => {
    if (!playing || scrubbing) return;
    let frame = requestAnimationFrame(function read() {
      if (media) position = media.currentTime;
      frame = requestAnimationFrame(read);
    });
    return () => cancelAnimationFrame(frame);
  });

  /* What the element tells the transport. Attached here rather than in each
     player so both media answer the same way, and so the app's one playback
     slot is claimed in one place: starting anything stops whatever was
     playing, across both media. */
  $effect(() => {
    const el = media;
    if (!el) return;

    let release: (() => void) | null = null;
    const readDuration = () => {
      duration = Number.isFinite(el.duration) ? el.duration : 0;
      position = el.currentTime;
      if (duration > 0) onDuration?.(duration);
    };
    const onPlay = () => {
      playing = true;
      release = claimPlayback(() => el.pause());
    };
    const onStop = () => {
      playing = false;
      position = el.currentTime;
      release?.();
      release = null;
    };

    readDuration();
    el.addEventListener('loadedmetadata', readDuration);
    el.addEventListener('durationchange', readDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onStop);
    el.addEventListener('ended', onStop);
    const onSeeked = () => (position = el.currentTime);
    el.addEventListener('seeked', onSeeked);

    return () => {
      el.removeEventListener('loadedmetadata', readDuration);
      el.removeEventListener('durationchange', readDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onStop);
      el.removeEventListener('ended', onStop);
      el.removeEventListener('seeked', onSeeked);
      release?.();
    };
  });
</script>

<div class="transport" data-transport>
  <button
    type="button"
    class="transport-key"
    data-transport-toggle
    aria-label={playing ? m.mt_pause() : m.mt_play()}
    onclick={toggle}
  >
    <!-- Two glyphs in one square, crossfading where they stand: a play that
         cut to a pause would be the app's own definition of a yank. -->
    <span class="transport-glyph" class:is-on={!playing}><Icon name="play" size={18} /></span>
    <span class="transport-glyph" class:is-on={playing}><Icon name="pause" size={18} /></span>
  </button>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    {...slider.root}
    class="transport-scrub"
    class:is-wave={bars !== null}
    data-transport-scrub
    style="--played: {playedPx}px"
    aria-label={m.mt_position()}
    aria-valuetext={m.mt_position_read({ at: formatClock(shownAt), of: formatClock(duration) })}
    bind:clientWidth={trackWidth}
    onkeydown={onKeyDown}
    onpointerdown={() => (scrubbing = true)}
    onpointerup={() => (scrubbing = false)}
    onpointercancel={() => (scrubbing = false)}
  >
    {#if bars}
      {#snippet barSet()}
        {#each bars as bar, i (i)}
          <rect
            class:is-live={playing && i === liveBar}
            x={i * (trackWidth / bars.length) + 1}
            y={WAVE_HEIGHT / 2 - Math.max(1, (bar * (WAVE_HEIGHT - 2)) / 2)}
            width={Math.max(1, trackWidth / bars.length - 2)}
            height={Math.max(2, bar * (WAVE_HEIGHT - 2))}
          />
        {/each}
      {/snippet}
      <!-- The same bars twice: the second set is clipped to the playhead, so
           the boundary between played and unplayed travels continuously
           rather than jumping a whole bar at a time. -->
      <svg class="transport-wave" width={trackWidth} height={WAVE_HEIGHT} aria-hidden="true">
        <g class="transport-bars">{@render barSet()}</g>
        <g class="transport-bars is-played">{@render barSet()}</g>
      </svg>
    {:else}
      <span class="transport-rail" aria-hidden="true"></span>
      <span class="transport-rail is-played" aria-hidden="true"></span>
    {/if}
    <span class="transport-head" aria-hidden="true"></span>
  </div>

  <span class="transport-clock">
    <span class="transport-at">{formatClock(shownAt)}</span>
    <span class="transport-of">{formatClock(duration)}</span>
  </span>

  {#if trailing}{@render trailing()}{/if}
</div>

<style>
  /* One row, 48 tall, the kit's one-line row (DIRECTION rule 6). Everything
     in it is a block of 6 (rule 5) drawn in ink, a stripe or a line (rule 4);
     there is no shadow and no tonal ground anywhere in here. */
  .transport {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    min-width: 0;
  }

  /* Ink: --text as the ground, --bg as the glyph - the pairing rule 4 keeps
     for the smallest things, and what a tile's action button already is. */
  .transport-key {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: var(--r-block);
    background: var(--text);
    color: var(--bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Filled, not outlined: the icon set is 2px strokes, and a hollow
     triangle inside a solid block reads as an outline of a play control
     rather than one. Both glyphs are closed shapes, so filling them is the
     whole change - `.icon.is-starred` in components.css does the same for
     the same reason. */
  .transport-key :global(.icon) {
    fill: currentColor;
  }

  .transport-glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    scale: 0.8;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      scale var(--dur-fast) var(--ease-out);
  }
  .transport-glyph.is-on {
    opacity: 1;
    scale: 1;
  }

  .transport-scrub {
    position: relative;
    flex: 1;
    min-width: 72px;
    height: 36px;
    display: flex;
    align-items: center;
    touch-action: none;
    cursor: pointer;
  }
  .transport-scrub:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: var(--r-block);
  }

  /* The plain track: the same box the waveform fills, with nothing written
     on it. A video note has no waveform to draw and a recording has none
     until its bars are decoded, and both are honest as a bar - what would not
     be honest is a waveform that is not this recording's. */
  .transport-rail {
    position: absolute;
    inset-inline: 0;
    height: 6px;
    border-radius: var(--r-block);
    background: color-mix(in oklab, var(--text) 14%, transparent);
  }
  .transport-rail.is-played {
    background: var(--accent);
    clip-path: inset(0 calc(100% - var(--played)) 0 0);
  }

  .transport-wave {
    position: absolute;
    inset-inline: 0;
    /* Grown from the centre line on arrival rather than appearing at full
       height: bars land when the decode does, which is after the row is on
       screen. */
    animation: wave-in var(--dur-slow) var(--ease-out) both;
  }
  .transport-bars rect {
    fill: color-mix(in oklab, var(--text) 32%, transparent);
    /* The bar under the playhead stands up while it is the one being heard
       and settles back as the playhead moves on. Scaled about its own
       middle, so the waveform's centre line does not move, and on the
       press duration so the rise and the fall are the same gesture the
       controls make. */
    transform-box: fill-box;
    transform-origin: center;
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .transport-bars rect.is-live {
    transform: scaleY(1.45);
  }
  .transport-bars.is-played rect {
    fill: var(--accent);
  }
  .transport-bars.is-played {
    clip-path: inset(0 calc(100% - var(--played)) 0 0);
  }

  @keyframes wave-in {
    from {
      transform: scaleY(0.08);
      opacity: 0;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  /* The playhead, on the same custom property as the fill so the line and
     the colour boundary are the same position by construction. */
  /* Square ends, like every other piece of ink the app draws (DIRECTION
     rule 9): 2 units for a series, and no cap on it. */
  .transport-head {
    position: absolute;
    left: 0;
    width: 2px;
    height: 26px;
    background: var(--text);
    translate: calc(var(--played) - 1px) 0;
  }

  .transport-clock {
    flex: none;
    display: flex;
    gap: 4px;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }
  .transport-at {
    color: var(--text);
    font-weight: 600;
  }
  .transport-of::before {
    content: '/';
    margin-inline-end: 4px;
  }
</style>
