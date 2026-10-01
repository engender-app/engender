<script lang="ts">
  /* Calming tool for Safe Space (ticket 52, ADR-0040): 4-4-4-4 box breathing,
     drawn as a tide (phase 12 breathing ticket 01, picked by Alicja from
     three live prototypes on 2026-10-01). The flag's colour rises inside a
     vessel on the inhale, stands still through the hold, drains on the
     exhale and stands still again. A dot travels the track around it, one
     lap per 16s cycle, past a tick at each quarter.

     One clock (breathing.ts) drives all of it. Each frame reads one elapsed
     time and writes the water level and the dot's position as custom
     properties straight onto the drawing, so nothing re-renders per frame
     and nothing can disagree. The version this replaced ran its ring, its
     halo and its count off a one-second interval through three separate
     CSS transitions: they drifted apart, the ring dropped from full to
     empty in one frame at every phase boundary, the first breath was
     shorter than the rest, and resuming mid-phase ran a 4s transition over
     what was left of it.

     The lap is a travelling dot and not a stroke that fills, because a
     fill has to drop from full back to empty when the cycle wraps - the
     same single-frame drop, moved from every phase to every cycle. A dot's
     last position is its first. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import { isReducedMotion } from '$lib/motion/tokens';
  import {
    BOX_BREATHING_PHASES,
    clockElapsed,
    isRunning,
    pauseClock,
    readBreath,
    restingClock,
    startClock,
    type BreathingPhase
  } from './breathing';

  let {
    role,
    ...rest
  }: {
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  /* The drawing, in viewBox units. The vessel holds the water; the track
     the dot travels sits outside it with room for the dot's 7 radius and
     its 3px knockout (127 + 7 + 1.5 = 135.5), so the whole drawing fits a 272 box and a 320px
     phone's 270px column scales it rather than overrunning (carpet 28). */
  const SIZE = 272;
  const C = SIZE / 2;
  const VESSEL = 112;
  const TRACK = 127;
  /* Low water at rest is a band, not nothing: an empty vessel at rest
     would read as a ring with nothing in it rather than as a tide waiting
     to come in. High water leaves a sliver of sky under the rim. */
  const LOW = C + VESSEL - 26;
  const HIGH = C - VESSEL + 14;
  /* Under reduced motion the water stands still just under the word and
     its colour fades with the breath instead of its level moving. Under the
     word and not across it: the fill ink is proven against the stripe at
     full strength, and over water faded to 30% it was white on a pale tint. */
  const STILL = C + 26;
  /* The widest the word may run, inside the vessel at its own height with a
     margin either side. "Wstrzymaj oddech" at the display size is wider. */
  const WORD_MAX = 2 * VESSEL - 48;
  const QUARTERS = [0, 1, 2, 3].map((q) => {
    const a = (q * Math.PI) / 2 - Math.PI / 2;
    return {
      x1: C + (TRACK - 6) * Math.cos(a),
      y1: C + (TRACK - 6) * Math.sin(a),
      x2: C + (TRACK + 6) * Math.cos(a),
      y2: C + (TRACK + 6) * Math.sin(a)
    };
  });

  /* The phase word fades through rather than crossfading: two different
     words laid over each other at half opacity read as a misprint ("Begi
     Pause thing" on the button, on the first flipbook). The old word goes
     out over OUT_MS, the new one starts IN_DELAY_MS in and comes up over
     IN_MS, so they share 60ms, both faint. Under reduced motion too:
     opacity moves nothing. Written as a JS tick rather than Svelte's
     `fade`, whose CSS animation base.css clamps to 1ms under reduced motion
     - and a fade with no duration is a cut. */
  const OUT_MS = 180;
  const IN_DELAY_MS = 120;
  const IN_MS = 240;
  const tickFade = (duration: number, delay = 0) => (node: Element) => ({
    duration,
    delay,
    tick: (t: number) => {
      (node as HTMLElement | SVGElement).style.opacity = String(t);
    }
  });
  const fadeOut = tickFade(OUT_MS);
  /* Hidden the moment it is inserted. Svelte applies tick(0) on its next
     animation frame, so a word inserted after this frame's callbacks had
     run was painted once at full opacity before its fade began. */
  const fadeIn = (node: Element) => {
    (node as HTMLElement | SVGElement).style.opacity = '0';
    return tickFade(IN_MS, IN_DELAY_MS)(node);
  };

  /* Shrinks a word wider than WORD_MAX to fit, measured on mount and so
     before its first paint. */
  const fitWord = (node: SVGTextElement) => {
    const length = node.getComputedTextLength();
    if (length > WORD_MAX) {
      const size = parseFloat(getComputedStyle(node).fontSize);
      node.style.fontSize = `${(size * WORD_MAX) / length}px`;
    }
  };

  /* Unique per instance, since clipPath ids are document-global. */
  const uid = $props.id();

  let clock = $state(restingClock());
  let phaseIndex = $state(0);
  /* Read once, when the exercise mounts, and held for the visit. Switching
     mid-breath would have to move the water from its level to the still
     line and step the dot back to the last whole second in one frame; the
     next visit takes the new setting instead. Not reactive in the style
     attribute below either, which Svelte would re-apply and so wipe what
     paint() had written. */
  const reduced = isReducedMotion();
  let figure: SVGSVGElement | undefined = $state();
  let raf = 0;
  /* Paused by the app going to the background rather than by the person,
     so it carries on by itself on return. */
  let hiddenPause = false;

  const running = $derived(isRunning(clock));
  const started = $derived(running || clock.banked > 0);

  function paint(now: number) {
    if (!figure) return;
    const r = readBreath(clockElapsed(clock, now), reduced);
    const surface = reduced ? STILL : LOW + (HIGH - LOW) * r.level;
    const angle = r.cycleProgress * 2 * Math.PI - Math.PI / 2;
    figure.style.setProperty('--breath', r.level.toFixed(4));
    figure.style.setProperty('--surface-y', `${surface.toFixed(2)}px`);
    figure.style.setProperty('--lap-x', `${(C + TRACK * Math.cos(angle)).toFixed(2)}px`);
    figure.style.setProperty('--lap-y', `${(C + TRACK * Math.sin(angle)).toFixed(2)}px`);
    if (r.phaseIndex !== phaseIndex) phaseIndex = r.phaseIndex;
  }

  function frame(now: number) {
    paint(now);
    raf = isRunning(clock) ? requestAnimationFrame(frame) : 0;
  }

  function pause() {
    const now = performance.now();
    clock = pauseClock(clock, now);
    cancelAnimationFrame(raf);
    raf = 0;
    paint(now);
  }

  function resume() {
    clock = startClock(clock, performance.now());
    raf = requestAnimationFrame(frame);
  }

  function toggle() {
    hiddenPause = false;
    if (isRunning(clock)) pause();
    else resume();
  }

  /* No frames are drawn while the app is in the background, but the clock
     would keep counting, so the first frame back painted a breath seconds
     on: the water, the dot and the word all in new places at once. The
     clock stops with the frames instead and carries on from the same one. */
  $effect(() => {
    const onVisibility = () => {
      if (document.hidden && isRunning(clock)) {
        hiddenPause = true;
        pause();
      } else if (!document.hidden && hiddenPause) {
        hiddenPause = false;
        resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  onDestroy(() => cancelAnimationFrame(raf));

  const phaseLabel = (phase: BreathingPhase): string => {
    switch (phase) {
      case 'inhale':
        return m.safe_space_breathing_inhale();
      case 'hold-in':
      case 'hold-out':
        return m.safe_space_breathing_hold();
      case 'exhale':
        return m.safe_space_breathing_exhale();
    }
  };

  const phase = $derived(BOX_BREATHING_PHASES[phaseIndex]);
  /* The pattern, and not a title a second time, sits where the phase word
     will be (redesign ticket 47), so starting changes what the vessel says
     rather than where it says it. */
  const word = $derived(started ? phaseLabel(phase) : '4 · 4 · 4 · 4');
</script>

<!-- Carpet 30: no container. The vessel is the object. -->
<div
  class="breathing-exercise"
  data-kit-surface
  data-breathing-exercise
  {...roleAttrs(role)}
  {...rest}
>
  <span class="breathing-desc">{m.safe_space_breathing_desc()}</span>

  <button
    type="button"
    class="breathing-stage"
    aria-label={running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
    onclick={toggle}
  >
    <!-- The resting values are written into the markup, so the first paint
         is already the rest pose rather than a frame of defaults before the
         first paint() lands. -->
    <svg
      bind:this={figure}
      class="breathing-figure"
      class:is-reduced={reduced}
      viewBox="0 0 {SIZE} {SIZE}"
      width={SIZE}
      height={SIZE}
      style="--breath:0; --surface-y:{reduced ? STILL : LOW}px; --lap-x:{C}px; --lap-y:{C - TRACK}px"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="{uid}-vessel">
          <circle cx={C} cy={C} r={VESSEL} />
        </clipPath>
        <clipPath id="{uid}-water">
          <rect class="breathing-water" x="0" y="0" width={SIZE} height={SIZE} />
        </clipPath>
        <clipPath id="{uid}-sky">
          <rect class="breathing-water" x="0" y={-SIZE} width={SIZE} height={SIZE} />
        </clipPath>
      </defs>

      <circle class="breathing-track" cx={C} cy={C} r={TRACK} />
      {#each QUARTERS as q}
        <line class="breathing-tick" x1={q.x1} y1={q.y1} x2={q.x2} y2={q.y2} />
      {/each}

      <g clip-path="url(#{uid}-vessel)">
        <rect class="breathing-water" x="0" y="0" width={SIZE} height={SIZE} />
      </g>
      <circle class="breathing-vessel" cx={C} cy={C} r={VESSEL} />

      <!-- The word twice: once in the page's ink clipped to the sky, once in
           the ink that reads on the flag's fill clipped to the water - so
           where the tide covers a letter it changes ink at the waterline
           rather than sinking out of contrast. Each copy is cut to its own
           side: drawn whole under the other, the page ink's antialiased
           edges showed as a fringe round the fill-ink letters. -->
      <g clip-path="url(#{uid}-sky)">
        {#key word}
          <text class="breathing-word" x={C} y={C} use:fitWord in:fadeIn out:fadeOut>{word}</text>
        {/key}
      </g>
      <g clip-path="url(#{uid}-water)">
        {#key word}
          <text class="breathing-word on-fill" x={C} y={C} use:fitWord in:fadeIn out:fadeOut>{word}</text>
        {/key}
      </g>

      <circle class="breathing-lap" cx="0" cy="0" r="7" />
    </svg>
  </button>

  <!-- What a screen reader hears: the phase word, once per phase, and
       nothing at rest - four numerals and three separators are not
       something anybody can act on, and the button says what pressing it
       does. -->
  <span class="breathing-live" aria-live="polite">
    {#if started}
      <span data-breathing-phase={phase}>{word}</span>
    {/if}
  </span>

  <button
    type="button"
    class="btn btn-soft btn-block press"
    data-breathing-toggle
    onclick={toggle}
  >
    <!-- Glyph and label trade as one face, each centred in the same cell:
         "Begin breathing" and "Pause" differ in width, so swapping them in
         place re-centred the button's content and jumped the glyph 38px in
         one frame. -->
    <span class="breathing-toggle-faces">
      {#key running}
        <span class="breathing-toggle-face" in:fadeIn out:fadeOut>
          <Icon name={running ? 'pause' : 'play'} size={18} />
          <span>{running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}</span>
        </span>
      {/key}
    </span>
  </button>
</div>

<style>
  .breathing-exercise {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-4);
  }

  .breathing-desc {
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .breathing-stage {
    background: none;
    border: none;
    padding: var(--space-3) 0;
    cursor: pointer;
    touch-action: manipulation;
    max-width: 100%;
  }

  /* It has a viewBox, so a column narrower than 272 scales the drawing
     rather than cropping it. Overflow visible for the dot's knockout ring,
     which reaches 3px past the track at the quarters. */
  .breathing-figure {
    display: block;
    max-width: 100%;
    height: auto;
    overflow: visible;
  }

  /* A guide at rule 9's weight: 1px in --text-2, never the series colour.
     The ticks mark the quarters - the phase boundaries - at a series' 2px. */
  .breathing-track {
    fill: none;
    stroke: var(--text-2);
    stroke-width: 1;
    opacity: 0.6;
  }

  .breathing-tick {
    stroke: var(--text-2);
    stroke-width: 2;
  }

  .breathing-vessel {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 2;
  }

  /* The water is a full-size block whose top edge is the surface, moved by
     transform rather than by its height so the browser only composites it.
     The same rect, used again as a clip, cuts the on-fill copy of the word
     at the same line. */
  .breathing-water {
    fill: var(--role-draw);
    transform: translateY(var(--surface-y));
  }

  /* The dot knocks the track out under itself with a ring of the page's
     own ground, so it reads as on the track rather than over it. */
  .breathing-lap {
    fill: var(--role-draw);
    stroke: var(--bg);
    stroke-width: 3;
    transform: translate(var(--lap-x), var(--lap-y));
  }

  /* Their opacity belongs to the JS fade. Under reduced motion base.css
     gives every element a 1ms transition on all properties, so an inserted
     word whose style had already been read at full opacity transitioned
     from 1 to the fade's 0 and was painted once at 1. */
  .breathing-word,
  .breathing-toggle-face {
    transition-property: none;
  }

  .breathing-word {
    font-family: var(--font-display);
    /* In rem so it follows the reader's text size; fitWord caps the width. */
    font-size: 1.625rem;
    font-weight: var(--weight-display);
    fill: var(--text);
    text-anchor: middle;
    dominant-baseline: central;
  }

  /* The heat ramp's deepest ink, proven against the stripe itself; the
     role's own ink is not (text-on-a-flag-fill). */
  .breathing-word.on-fill {
    fill: var(--role-fill-ink);
  }

  /* Reduced motion: the water stands still under the word and the breath
     is its colour fading up and down on the same curve. The dot still steps once
     a second - readBreath quantises the lap - because it carries the time. */
  .breathing-figure.is-reduced .breathing-water {
    fill-opacity: calc(0.3 + 0.7 * var(--breath));
  }

  .breathing-toggle-faces {
    display: grid;
    justify-items: center;
  }

  /* The kit's .btn lays its icon and label out with a gap; the face takes
     that job now that it stands between them. */
  .breathing-toggle-face {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .breathing-live {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
