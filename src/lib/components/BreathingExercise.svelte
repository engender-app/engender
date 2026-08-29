<script lang="ts">
  /* Calming tool for Safe Space (ticket 52, ADR-0040): 4-4-4-4 box breathing.
     Smooth, paced visual guide to help ground during crisis or intense dysphoria.
     Self-contained component so future calming tools can join the dashboard
     without rewriting the screen. */
  import { onDestroy } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import {
    initialBreathingState,
    tickBreathing,
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

  let state = $state<BreathingState>(initialBreathingState());
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (state.running) return;
    state = { ...state, running: true };
    intervalId = setInterval(() => {
      state = tickBreathing(state);
    }, 1000);
  }

  function pause() {
    if (!state.running) return;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    state = { ...state, running: false };
  }

  function toggle() {
    if (state.running) {
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

  /* Visual scale target based on current phase */
  let scaleClass = $derived.by(() => {
    if (!state.running) return 'is-idle';
    switch (state.phase) {
      case 'inhale':
        return 'is-inhale';
      case 'hold-in':
        return 'is-hold-in';
      case 'exhale':
        return 'is-exhale';
      case 'hold-out':
        return 'is-hold-out';
    }
  });
</script>

<div
  class="card breathing-card"
  data-kit-surface
  data-breathing-exercise
  {...roleAttrs(role)}
  {...rest}
>
  <div class="breathing-header">
    <span class="breathing-desc">{m.safe_space_breathing_desc()}</span>
  </div>

  <div class="breathing-visual-area">
    <div class="breathing-outer-ring">
      <div class="breathing-bubble {scaleClass}"></div>
      <div class="breathing-content" aria-live="polite">
        {#if state.running}
          <span class="breathing-phase-text" data-breathing-phase={state.phase}>
            {phaseLabel(state.phase)}
          </span>
          <span class="breathing-count">{state.secondsRemaining}</span>
        {:else}
          <span class="breathing-idle-text">{m.safe_space_calm_title()}</span>
          <span class="breathing-idle-sub">4 · 4 · 4 · 4</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="breathing-actions">
    <button
      type="button"
      class="btn btn-soft btn-block press"
      data-breathing-toggle
      onclick={toggle}
    >
      <Icon name={state.running ? 'pause' : 'play'} size={18} />
      <span>
        {state.running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
      </span>
    </button>
  </div>
</div>

<style>
  .breathing-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-4);
    gap: var(--space-4);
  }

  .breathing-header {
    width: 100%;
  }

  .breathing-desc {
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .breathing-visual-area {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) 0;
  }

  .breathing-outer-ring {
    position: relative;
    width: 170px;
    height: 170px;
    border-radius: var(--radius-full, 9999px);
    border: 1px solid var(--card-line);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .breathing-bubble {
    position: absolute;
    width: 150px;
    height: 150px;
    border-radius: var(--radius-full, 9999px);
    background: var(--role-bg, var(--surface-2));
    border: 1px solid var(--role-mark, var(--outline-strong));
    opacity: 0.85;
    transform-origin: center center;
    will-change: transform;
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  }

  .breathing-bubble.is-idle {
    transform: scale(0.72);
    transition: transform 0.4s ease;
    opacity: 0.5;
  }

  .breathing-bubble.is-inhale {
    transform: scale(1);
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0.9;
  }

  .breathing-bubble.is-hold-in {
    transform: scale(1);
    transition: none;
    opacity: 0.9;
  }

  .breathing-bubble.is-exhale {
    transform: scale(0.58);
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0.6;
  }

  .breathing-bubble.is-hold-out {
    transform: scale(0.58);
    transition: none;
    opacity: 0.6;
  }

  .breathing-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    pointer-events: none;
    user-select: none;
  }

  .breathing-phase-text {
    font-family: var(--font-display, inherit);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }

  .breathing-count {
    font-size: var(--text-2xl, 1.5rem);
    font-weight: 700;
    color: var(--role-ink, var(--text-1));
    line-height: 1;
  }

  .breathing-idle-text {
    font-family: var(--font-display, inherit);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-1);
  }

  .breathing-idle-sub {
    font-size: var(--text-xs);
    color: var(--muted);
    letter-spacing: 0.05em;
  }

  .breathing-actions {
    width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .breathing-bubble {
      transform: none !important;
      transition: opacity 0.3s ease !important;
    }
  }
</style>
