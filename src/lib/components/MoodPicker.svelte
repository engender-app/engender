<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import MoodFace from './MoodFace.svelte';

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
        <MoodFace value={mood.value} />
        <span class="mood-label">{mood.label}</span>
      </button>
    {/each}
  </div>
</div>
