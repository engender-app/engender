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

  /* Scaling class based on current phase */
  let scaleClass = $derived(!state.running ? 'is-idle' : `is-${state.phase}`);
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

  <div class="breathing-stage">
    <!-- Clickable concentric breathing halo -->
    <button
      type="button"
      class="breathing-halo-trigger press"
      aria-label={state.running ? m.safe_space_breathing_pause() : m.safe_space_breathing_start()}
      onclick={toggle}
    >
      <!-- Outermost fixed ambient boundary -->
      <div class="breathing-outer-ring">
        <!-- Middle breathing aura (scales with breath) -->
        <div class="breathing-aura {scaleClass}"></div>

        <!-- Inner solid breathing core -->
        <div class="breathing-core {scaleClass}">
          <div class="breathing-content" aria-live="polite">
            {#if state.running}
              <span class="breathing-phase-text" data-breathing-phase={state.phase}>
                {phaseLabel(state.phase)}
              </span>
              <span class="breathing-count">{state.secondsRemaining}</span>
              <!-- 4-step box breathing indicator dots -->
              <div class="breathing-dots" aria-hidden="true">
                {#each BOX_BREATHING_PHASES as p, i}
                  <span
                    class="breathing-dot"
                    class:is-active={state.phaseIndex === i}
                  ></span>
                {/each}
              </div>
            {:else}
              <span class="breathing-idle-title">{m.safe_space_calm_title()}</span>
              <span class="breathing-idle-sub">4 · 4 · 4 · 4</span>
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
    padding: var(--space-5) var(--space-4);
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
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) 0;
    width: 100%;
  }

  .breathing-halo-trigger {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: var(--radius-full, 9999px);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    touch-action: manipulation;
  }

  .breathing-outer-ring {
    position: relative;
    width: 210px;
    height: 210px;
    border-radius: var(--radius-full, 9999px);
    border: 1px solid var(--role-hairline);
    background: var(--bg-card);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Middle aura ring: flat theme color, no gradients */
  .breathing-aura {
    position: absolute;
    width: 184px;
    height: 184px;
    border-radius: var(--radius-full, 9999px);
    border: 1px solid var(--role-accent);
    background: var(--bg-subtle);
    transform-origin: center center;
    will-change: transform, opacity;
    transition: transform 4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
  }

  /* Inner core orb: solid theme tint and accent border, no gradients */
  .breathing-core {
    position: relative;
    z-index: 2;
    width: 148px;
    height: 148px;
    border-radius: var(--radius-full, 9999px);
    background: var(--role-tint);
    border: 2px solid var(--role-accent);
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
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .breathing-count {
    font-size: var(--text-4xl, 2.25rem);
    font-weight: 800;
    font-family: var(--font-display);
    color: var(--role-ink, var(--text));
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .breathing-idle-title {
    font-family: var(--font-display);
    font-size: var(--text-lg, 1.125rem);
    font-weight: 700;
    color: var(--text);
  }

  .breathing-idle-sub {
    font-size: var(--text-sm);
    color: var(--text-2, var(--muted));
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  .breathing-dots {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .breathing-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full, 9999px);
    background: var(--role-mark, var(--outline-strong));
    opacity: 0.4;
    transition: background 0.3s ease, transform 0.3s ease, opacity 0.3s ease;
  }

  .breathing-dot.is-active {
    background: var(--role-accent);
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
  }
</style>
