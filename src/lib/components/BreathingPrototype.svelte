<script lang="ts">
  /* THROWAWAY (breathing ticket 01, stage A). Three figures on the one
     clock, picked from by ?breath=a|b|c on /doubt. Deleted once one is
     chosen. */
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
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

  let { role, variant = 'a' }: { role?: Role; variant?: 'a' | 'b' | 'c' } = $props();

  let clock = $state(restingClock());
  let started = $state(false);
  let phaseIndex = $state(0);
  let reduced = $state(false);
  let root: SVGSVGElement | undefined = $state();
  let raf = 0;

  const running = $derived(isRunning(clock));

  /* Box side length and origin for (b). */
  const BOX = 232;
  const BOX_O = (272 - BOX) / 2;
  const ORBIT = 128;

  function lapPoint(lap: number): [number, number] {
    if (variant === 'b') {
      const side = Math.floor(lap * 4) % 4;
      const t = lap * 4 - Math.floor(lap * 4);
      const a = BOX_O;
      const b = BOX_O + BOX;
      if (side === 0) return [a + t * BOX, a];
      if (side === 1) return [b, a + t * BOX];
      if (side === 2) return [b - t * BOX, b];
      return [a, b - t * BOX];
    }
    const angle = lap * 2 * Math.PI - Math.PI / 2;
    return [136 + ORBIT * Math.cos(angle), 136 + ORBIT * Math.sin(angle)];
  }

  function paint(now: number) {
    if (!root) return;
    reduced = isReducedMotion();
    const elapsed = clockElapsed(clock, now);
    const r = readBreath(elapsed, reduced);
    const lag = readBreath(Math.max(0, elapsed - 350), reduced);
    const [x, y] = lapPoint(r.cycleProgress);
    root.style.setProperty('--breath', r.level.toFixed(4));
    root.style.setProperty('--breath-lag', lag.level.toFixed(4));
    root.style.setProperty('--lap-x', `${x.toFixed(2)}px`);
    root.style.setProperty('--lap-y', `${y.toFixed(2)}px`);
    if (r.phaseIndex !== phaseIndex) phaseIndex = r.phaseIndex;
  }

  function frame(now: number) {
    paint(now);
    raf = isRunning(clock) ? requestAnimationFrame(frame) : 0;
  }

  $effect(() => {
    if (root) paint(performance.now());
  });

  function toggle() {
    const now = performance.now();
    if (isRunning(clock)) {
      clock = pauseClock(clock, now);
      cancelAnimationFrame(raf);
      raf = 0;
      paint(now);
    } else {
      clock = startClock(clock, now);
      started = true;
      raf = requestAnimationFrame(frame);
    }
  }

  onDestroy(() => cancelAnimationFrame(raf));

  const phaseLabel = (phase: BreathingPhase): string =>
    phase === 'inhale'
      ? m.safe_space_breathing_inhale()
      : phase === 'exhale'
        ? m.safe_space_breathing_exhale()
        : m.safe_space_breathing_hold();

  const word = $derived(started ? phaseLabel(BOX_BREATHING_PHASES[phaseIndex].phase) : '4 · 4 · 4 · 4');
  const WORD_FADE = 420;
</script>

<div class="proto" data-breathing-proto={variant} {...roleAttrs(role)}>
  <span class="desc">{m.safe_space_breathing_desc()}</span>

  <button
    type="button"
    class="stage"
    aria-label={running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
    onclick={toggle}
  >
    <svg
      bind:this={root}
      class="figure v-{variant}"
      class:reduced
      viewBox="0 0 272 272"
      width="272"
      height="272"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="tide-clip">
          <circle cx="136" cy="136" r="112" />
        </clipPath>
        <clipPath id="tide-water">
          <rect class="water" x="0" y="24" width="272" height="224" />
        </clipPath>
      </defs>

      {#if variant === 'a'}
        <circle class="track" cx="136" cy="136" r={ORBIT} />
        {#each [0, 1, 2, 3] as q}
          <line class="tick" x1="136" y1={136 - ORBIT - 6} x2="136" y2={136 - ORBIT + 6} transform="rotate({q * 90} 136 136)" />
        {/each}
        <circle class="aura" cx="136" cy="136" r="112" />
        <circle class="core" cx="136" cy="136" r="100" />
      {:else if variant === 'b'}
        <rect class="track" x={BOX_O} y={BOX_O} width={BOX} height={BOX} rx="6" />
        <rect class="block" x={136 - 70} y={136 - 70} width="140" height="140" rx="6" />
      {:else}
        <circle class="track" cx="136" cy="136" r={ORBIT} />
        {#each [0, 1, 2, 3] as q}
          <line class="tick" x1="136" y1={136 - ORBIT - 6} x2="136" y2={136 - ORBIT + 6} transform="rotate({q * 90} 136 136)" />
        {/each}
        <circle class="vessel" cx="136" cy="136" r="112" />
        <g clip-path="url(#tide-clip)">
          <rect class="water" x="0" y="24" width="272" height="224" />
        </g>
      {/if}

      <circle class="lap" cx="0" cy="0" r="7" />

      <g class="words">
        {#key word}
          <text
            class="word"
            class:on-fill={variant === 'b'}
            x="136"
            y="136"
            in:fade={{ duration: WORD_FADE }}
            out:fade={{ duration: WORD_FADE }}>{word}</text
          >
        {/key}
      </g>
      {#if variant === 'c'}
        <g class="words" clip-path="url(#tide-water)">
          {#key word}
            <text
              class="word on-fill"
              x="136"
              y="136"
              in:fade={{ duration: WORD_FADE }}
              out:fade={{ duration: WORD_FADE }}>{word}</text
            >
          {/key}
        </g>
      {/if}
    </svg>
  </button>

  <span class="sr-only" aria-live="polite">{started ? word : ''}</span>

  <button type="button" class="btn btn-soft btn-block press" onclick={toggle}>
    <Icon name={running ? 'pause' : 'play'} size={18} />
    <span>{running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}</span>
  </button>
</div>

<style>
  .proto {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    text-align: center;
  }
  .desc {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .stage {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    touch-action: manipulation;
    max-width: 100%;
  }
  .figure {
    display: block;
    max-width: 100%;
    height: auto;
    overflow: visible;
    --breath: 0;
    --breath-lag: 0;
  }
  .figure * {
    transform-box: view-box;
    transform-origin: 136px 136px;
  }

  .track {
    fill: none;
    stroke: var(--text-2);
    stroke-width: 1;
    opacity: 0.6;
  }
  .tick {
    stroke: var(--text-2);
    stroke-width: 2;
  }
  .lap {
    fill: var(--role-draw);
    stroke: var(--bg);
    stroke-width: 3;
    transform: translate(var(--lap-x, 136px), var(--lap-y, 8px));
    transform-origin: 0 0;
  }

  /* (a) halo */
  .aura {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 1;
    transform: scale(calc(0.64 + 0.36 * var(--breath-lag)));
  }
  .core {
    fill: var(--role-tint);
    stroke: var(--role-draw);
    stroke-width: 2;
    transform: scale(calc(0.64 + 0.36 * var(--breath)));
  }

  /* (b) box */
  .block {
    fill: var(--role-draw);
    transform: scale(calc(0.78 + 0.6 * var(--breath)));
  }

  /* (c) tide: low water at rest, high water full. */
  .vessel {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 2;
  }
  .water {
    fill: var(--role-draw);
    transform: translateY(calc((1 - var(--breath)) * 170px + 14px));
  }

  .word {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: var(--weight-display);
    fill: var(--text);
    text-anchor: middle;
    dominant-baseline: central;
  }
  .word.on-fill {
    fill: var(--role-fill-ink);
  }

  /* Reduced motion: nothing scales or travels, the breath is a fade. */
  .reduced .core,
  .reduced .aura,
  .reduced .block {
    transform: none;
    opacity: calc(0.35 + 0.65 * var(--breath));
  }
  .reduced .water {
    transform: translateY(54px);
    opacity: calc(0.35 + 0.65 * var(--breath));
  }

  .btn {
    width: 100%;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
