<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { MOOD_MOUTHS } from './kit/moodFace';

  let {
    value = null,
    compact = false,
    onPick,
  }: { value?: number | null; compact?: boolean; onPick: (v: number | null) => void } = $props();

  let moods = $derived([1, 2, 3, 4, 5].map((v) => ({ value: v, label: moodName(v) })));
</script>

<div class="mood-picker" class:is-compact={compact} role="radiogroup" aria-label={m.mood()}>
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
          <path d={MOOD_MOUTHS[mood.value]} class="mood-face-mouth" />
        </svg>
        <span class="mood-label">{mood.label}</span>
      </button>
    {/each}
  </div>
</div>
