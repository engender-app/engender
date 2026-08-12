<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import { moodName } from '$lib/data/vocabulary/labels';

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
  let moods = $derived([1, 2, 3, 4, 5].map((v) => ({ value: v, label: moodName(v) })));
</script>

<!-- The face row is the static fallback + placeholder for the Rive mood
     state machine (F2); each mood stays a real focusable control. -->
<div class="mood-picker" class:is-compact={compact} role="radiogroup" aria-label={m.mood()}>
  <div class="rive-note" aria-hidden="true"><Icon name="zap" size={12} /> Rive: mood faces state machine</div>
  <div class="mood-row">
    {#each moods as mood (mood.value)}
      <button
        class="mood-btn"
        class:is-selected={mood.value === value}
        role="radio"
        aria-checked={mood.value === value}
        data-mood={mood.value}
        aria-label={mood.label}
        onclick={() => onPick(mood.value === value ? null : mood.value)}
      >
        <svg viewBox="0 0 24 24" class="mood-face" aria-hidden="true">
          <circle cx="12" cy="12" r="10" class="mood-face-bg" style="fill:var(--mood-{mood.value})" />
          <circle cx="8.6" cy="9.5" r="1.25" class="mood-face-ink" />
          <circle cx="15.4" cy="9.5" r="1.25" class="mood-face-ink" />
          <path d={MOUTHS[mood.value]} class="mood-face-mouth" />
        </svg>
        <span class="mood-label">{mood.label}</span>
      </button>
    {/each}
  </div>
</div>
