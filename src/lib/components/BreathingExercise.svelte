<script lang="ts">
  /* Calming tool for Safe Space (ticket 52, ADR-0040): 4-4-4-4 box breathing.
     Impeccable craft: organic concentric halo in pure theme tokens (no gradients).
     Self-contained component with full accessibility and reduced-motion fallback. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import {
    initialBreathingState,
    tickBreathing,
    phaseProgress,
    BOX_BREATHING_PHASES,
    type BreathingPhase,
    type BreathingState
  } from './breathing';

  let {
    role,
    ...rest
  }: {
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  let breath = $state<BreathingState>(initialBreathingState());
  let ringResetting = $state<boolean>(true);

  /* The countdown ring drawn around the halo (Alicja, 2026-08-31 review:
     "a nice stroke going around the circle filling up as the count goes
     down").

     132 rather than 123, which is where it started: the halo's contents
     come after the ring in DOM order, so at 123 the stroke was painted over
     by the halo itself and only a couple of its pixels cleared. The halo
     reaches a 120px radius (breathing-outer-ring is 240px across), so 132
     with the 6px stroke draws the band from 129 to 135 - a 9px gap outside
     it, and nothing of the halo's to fight now that carpet 30 has taken its
     border. */
  const RING_RADIUS = 132;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (breath.running) return;
    breath = { ...breath, running: true };
    intervalId = setInterval(() => {
      breath = tickBreathing(breath);
    }, 1000);
  }

  function pause() {
    if (!breath.running) return;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    breath = { ...breath, running: false };
  }

  function toggle() {
    if (breath.running) {
      pause();
    } else {
      start();
    }
  }

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });

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

  /* Scaling class based on current phase */
  let scaleClass = $derived(!breath.running ? 'is-idle' : `is-${breath.phase}`);

  let phaseDuration = $derived(BOX_BREATHING_PHASES[breath.phaseIndex].duration);

  /* The ring resets to empty and instantly (no transition) on the frame a
     new phase starts, then - one animation frame later, once the browser
     has actually painted that empty frame - the CSS transition below takes
     over and sweeps it to wherever `phaseProgress` is heading, over the
     rest of that second. Skipping the reset frame would run the transition
     from the previous phase's *full* ring straight to this phase's first
     target, which unfills before it fills rather than starting empty.

     Keyed through a `$derived` and not off `breath` directly, which is what
     it took to key on the boundary at all. `tickBreathing` reassigns the
     whole state object every second, so an effect that read `breath.running`
     - as this one did, one line under a comment claiming it was keyed on
     `phaseIndex` alone - depended on `breath` itself and re-ran on every
     tick. It set the ring empty each second and then had one frame to
     transition out of it, so the fill never reached more than about a
     twentieth of the circle: the ring had been a stub since the day it
     landed, in a state no unit test can see and every render shows. Found
     on carpet 30's crops, once unboxing had made the reading the thing the
     surface is for. A `$derived` only invalidates when its value changes,
     so this now runs exactly at a boundary and when running flips. */
  let ringPhase = $derived(breath.running ? breath.phaseIndex : -1);
  $effect(() => {
    if (ringPhase < 0) return;
    ringResetting = true;
    const raf = requestAnimationFrame(() => {
      ringResetting = false;
    });
    return () => cancelAnimationFrame(raf);
  });

  let ringEmpty = $derived(!breath.running || ringResetting);
  let ringDashoffset = $derived(
    ringEmpty ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - phaseProgress(phaseDuration, breath.secondsRemaining))
  );
</script>

<!-- Carpet 30: no container. A breathing exercise is a ring, and the ring
     is the object rather than something that needs a box to say it is one -
     which is also what every reference does (Mobbin, eight of eight
     breathing screens: QUITTR, stoic., Finch, Breathwrk, Calm, Opal, WHOOP,
     Waking Up all draw the ring straight on the page). rule 4's argument for
     a fourth treatment had to be made here or nowhere, and this is where it
     failed: the card was carrying "this is a thing you do" for a drawing
     that already says so at 272px across. -->
<div
  class="breathing-exercise"
  data-kit-surface
  data-breathing-exercise
  {...roleAttrs(role)}
  {...rest}
>
  <div class="breathing-header">
    <span class="breathing-desc">{m.safe_space_breathing_desc()}</span>
  </div>

  <div class="breathing-stage">
    <!-- The ring sits behind the halo, in its own stacking layer, so the
         halo's press feedback and the ring's fill never fight over paint
         order. pointer-events:none - the ring is a reading, not a target;
         the button underneath already covers the whole tappable area. -->
    <svg
      class="breathing-ring"
      class:is-empty={ringEmpty}
      width="272"
      height="272"
      viewBox="0 0 272 272"
      aria-hidden="true"
    >
      <circle class="breathing-ring-track" cx="136" cy="136" r={RING_RADIUS} />
      <circle
        class="breathing-ring-progress"
        cx="136"
        cy="136"
        r={RING_RADIUS}
        stroke-dasharray={RING_CIRCUMFERENCE}
        stroke-dashoffset={ringDashoffset}
      />
    </svg>
    <!-- Clickable concentric breathing halo -->
    <button
      type="button"
      class="breathing-halo-trigger press"
      aria-label={breath.running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
      onclick={toggle}
    >
      <!-- Outermost fixed ambient boundary -->
      <div class="breathing-outer-ring">
        <!-- Middle breathing aura (scales with breath) -->
        <div class="breathing-aura {scaleClass}"></div>

        <!-- Inner solid breathing core -->
        <div class="breathing-core {scaleClass}">
          <div class="breathing-content" aria-live="polite">
            {#if breath.running}
              <span class="breathing-phase-text" data-breathing-phase={breath.phase}>
                {phaseLabel(breath.phase)}
              </span>
              <span class="breathing-count">{breath.secondsRemaining}</span>
              <!-- 4-step box breathing indicator dots -->
              <div class="breathing-dots" aria-hidden="true">
                {#each BOX_BREATHING_PHASES as p, i}
                  <span
                    class="breathing-dot"
                    class:is-active={breath.phaseIndex === i}
                  ></span>
                {/each}
              </div>
            {:else}
              <!-- The pattern, and not a title a second time. Redesign
                   ticket 47 took the section heading off /doubt entirely -
                   the field says where this is, and the screen holds
                   nothing but this - so the only words above the ring now
                   are the description this component draws itself. The
                   figure sits in the slot the phase word takes once the
                   count is running, so starting changes what the core says
                   rather than where it says it.

                   `aria-hidden`, because this sits in the live region and four
                   numerals with three separators are not something anybody can
                   act on. The words it replaced were: the heading above says
                   them, and the button's own label says what pressing it does.
                   So at rest the region is silent, and pausing announces
                   nothing rather than announcing digits. -->
              <span class="breathing-pattern" aria-hidden="true">4 · 4 · 4 · 4</span>
              <div class="breathing-dots" aria-hidden="true">
                {#each BOX_BREATHING_PHASES as _}
                  <span class="breathing-dot"></span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </button>
  </div>

  <div class="breathing-actions">
    <button
      type="button"
      class="btn btn-soft btn-block press"
      data-breathing-toggle
      onclick={toggle}
    >
      <Icon name={breath.running ? 'pause' : 'play'} size={18} />
      <span>
        {breath.running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
      </span>
    </button>
  </div>
</div>

<style>
  /* On the page, so the padding a card owed its own edge goes with the edge.
     What is left is the column and its rhythm. */
  .breathing-exercise {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-4);
  }

  .breathing-header {
    width: 100%;
  }

  .breathing-desc {
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .breathing-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) 0;
    width: 100%;
  }

  /* Centered on the stage over the halo. The ring's radius is drawn well
     outside the halo's own edge (240px across, so a 120px radius) on
     purpose: at 123 the stroke sat almost entirely under the halo's own
     opaque background, which paints after the ring in DOM order and
     covered all but a sliver of it. pointer-events:none - the ring is a
     reading, not a target; the button underneath already covers the
     whole tappable area, and this only has to not intercept its taps. */
  .breathing-ring {
    position: absolute;
    pointer-events: none;
    /* The 6px fill draws its outer edge at a 135px radius, so the band is
       exactly 270px across - which is exactly the column a 320px phone
       leaves, and carpet 28's hit test read a 1px overrun on each side. It
       has a viewBox, so constraining the width scales the whole drawing
       rather than cropping it. */
    max-width: 100%;
    height: auto;
    /* An absolutely positioned element takes no part in its flex parent's
       centering - .breathing-stage centers the button through
       align-items/justify-content, which only ever applied to in-flow
       children. Center this one explicitly on the same point instead. */
    top: 50%;
    left: 50%;
    /* 12 o'clock start rather than SVG's 3 o'clock default, so the sweep
       reads the way every clock-shaped progress reading does. */
    transform: translate(-50%, -50%) rotate(-90deg);
  }

  /* --role-hairline (kit.css) bundles width, style and colour into one
     border shorthand ("1px solid <colour>") - it is not a colour on its
     own, and stroke takes a paint value only. Reproducing its own colour
     formula here as opacity over --role-mark rather than trying to pull a
     colour out of the shorthand. */
  /* A guide, at rule 9's weight for one. It was 4 - the same as the fill
     that sweeps over it - so at rest the loudest mark on the screen was an
     empty track, and once running the reading that matters was a 4px stub
     on a 4px ring of the same colour. */
  .breathing-ring-track {
    fill: none;
    stroke: var(--role-mark);
    stroke-opacity: 0.35;
    stroke-width: 2;
  }

  /* Drawn shapes read off --role-draw (kit.css: "the stripe as it is,
     ...what every drawn shape in a chart uses - the line... the timeline's
     rail"), the same token the ring's aura and core borders now read
     below - not --role-accent, which nothing in kit.css defines (see the
     fix note by .breathing-aura). */
  .breathing-ring-progress {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 6;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;
  }

  /* The reset frame: instant, no transition, so the next frame's fill
     starts from a ring the browser has actually painted as empty rather
     than animating backwards from wherever the last phase left off. */
  .breathing-ring.is-empty .breathing-ring-progress {
    transition: none;
  }

  .breathing-halo-trigger {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    touch-action: manipulation;
  }

  /* No edge of its own (carpet 30). This was "the outermost fixed ambient
     boundary", which is a container saying where the thing is - the card's
     job, drawn a second time at 240px. Unboxed, five concentric circles
     stood between the reading and the figure and only three of them had
     one: the countdown, the aura and the core. What is left here is the
     box the other two are centred in. */
  .breathing-outer-ring {
    position: relative;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Middle aura ring: flat theme color, no gradients. --role-draw is "the
     stripe as it is... what every drawn shape in a chart uses" (kit.css) -
     a ring's own outline is exactly that kind of drawn shape. */
  .breathing-aura {
    position: absolute;
    width: 210px;
    height: 210px;
    border-radius: 50%;
    border: 1px solid var(--role-draw);
    transform-origin: center center;
    will-change: transform, opacity;
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
  }

  /* Inner core orb: solid theme tint and accent border, no gradients */
  .breathing-core {
    position: relative;
    z-index: 2;
    width: 170px;
    height: 170px;
    border-radius: 50%;
    background: var(--role-tint);
    border: 2px solid var(--role-draw);
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: center center;
    will-change: transform;
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Phase scaling states */
  .breathing-aura.is-idle,
  .breathing-core.is-idle {
    transform: scale(0.78);
    transition: transform 0.4s ease;
  }

  .breathing-aura.is-inhale,
  .breathing-core.is-inhale {
    transform: scale(1);
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .breathing-aura.is-hold-in,
  .breathing-core.is-hold-in {
    transform: scale(1);
    transition: none;
  }

  .breathing-aura.is-exhale,
  .breathing-core.is-exhale {
    transform: scale(0.65);
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .breathing-aura.is-hold-out,
  .breathing-core.is-hold-out {
    transform: scale(0.65);
    transition: none;
  }

  .breathing-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    pointer-events: none;
    user-select: none;
  }

  .breathing-phase-text {
    font-family: var(--font-display);
    font-size: var(--text-xl, 1.25rem);
    font-weight: var(--weight-display);
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .breathing-count {
    font-size: var(--text-4xl, 2.25rem);
    font-weight: var(--weight-display);
    font-family: var(--font-display);
    color: var(--role-ink, var(--text));
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* The phase word's own slot, in the display face at the same size, so the
     core reads as one line changing rather than two layouts swapping. Letter-
     spaced, because four numerals and three separators need the air a word
     does not. */
  .breathing-pattern {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--weight-display);
    color: var(--text-2);
    letter-spacing: 0.08em;
  }

  .breathing-dots {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .breathing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--role-mark, var(--outline));
    opacity: 0.4;
    transition: background 0.3s ease, transform 0.3s ease, opacity 0.3s ease;
  }

  .breathing-dot.is-active {
    /* Same token the inactive dot's fallback already reaches for: a small
       mark sitting on --role-tint (the core's own background) is exactly
       the case --role-mark exists for (kit.css). */
    background: var(--role-mark, var(--outline));
    opacity: 1;
    transform: scale(1.4);
  }

  .breathing-actions {
    width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .breathing-aura,
    .breathing-core {
      transform: none !important;
      transition: opacity 0.3s ease !important;
    }

    /* Still steps once a second with the count - the ring keeps carrying
       real information - just without the continuous 1s sweep between
       steps. */
    .breathing-ring-progress {
      transition: none !important;
    }
  }
</style>
