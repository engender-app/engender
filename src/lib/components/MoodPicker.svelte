<script lang="ts">
  import Icon from './Icon.svelte';

  export const MOOD_LABELS = ['awful', 'bad', 'meh', 'good', 'great'];

  let {
    value = null,
    compact = false,
    onPick,
  }: { value?: number | null; compact?: boolean; onPick: (v: number | null) => void } = $props();

  const MOUTHS: Record<number, string> = {
    1: 'M8 16.5c1.2-1.6 2.6-2.4 4-2.4s2.8.8 4 2.4',
    2: 'M8.5 16c1-.9 2.2-1.4 3.5-1.4s2.5.5 3.5 1.4',
    3: 'M8.5 15.5h7',
    4: 'M8.5 14.6c1 .9 2.2 1.4 3.5 1.4s2.5-.5 3.5-1.4',
    5: 'M8 14c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4',
  };
  const MOODS = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: MOOD_LABELS[v - 1] }));
</script>

<!-- The face row is the static fallback + placeholder for the Rive mood
     state machine (F2); each mood stays a real focusable control. -->
<div class="mood-picker" class:is-compact={compact} role="radiogroup" aria-label="Mood">
  <div class="rive-note" aria-hidden="true"><Icon name="zap" size={12} /> Rive: mood faces state machine</div>
  <div class="mood-row">
    {#each MOODS as m (m.value)}
      <button
        class="mood-btn"
        class:is-selected={m.value === value}
        role="radio"
        aria-checked={m.value === value}
        data-mood={m.value}
        aria-label={m.label}
        onclick={() => onPick(m.value === value ? null : m.value)}
      >
        <svg viewBox="0 0 24 24" class="mood-face" aria-hidden="true">
          <circle cx="12" cy="12" r="10" class="mood-face-bg" style="fill:var(--mood-{m.value})" />
          <circle cx="8.6" cy="9.5" r="1.25" class="mood-face-ink" />
          <circle cx="15.4" cy="9.5" r="1.25" class="mood-face-ink" />
          <path d={MOUTHS[m.value]} class="mood-face-mouth" />
        </svg>
        <span class="mood-label">{m.label}</span>
      </button>
    {/each}
  </div>
</div>
