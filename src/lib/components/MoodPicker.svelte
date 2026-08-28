<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { isReducedMotion } from '$lib/motion/tokens';
  import { magnifyRow } from '$lib/motion/magnifier';
  import MoodFace from './MoodFace.svelte';

  let {
    value = null,
    compact = false,
    onPick,
  }: { value?: number | null; compact?: boolean; onPick: (v: number | null) => void } = $props();

  let moods = $derived([1, 2, 3, 4, 5].map((v) => ({ value: v, label: moodName(v) })));

  /* Grows the face under the pointer, the same magnifier quick add's fan
     answers a slide with (magnifier.ts) - a mouse can hover this row too. */
  let moodScale = $state<number[]>(moods.map(() => 1));
  const RESTING = [1, 1, 1, 1, 1];

  function onRowMove(e: PointerEvent) {
    if (isReducedMotion()) return;
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moodScale = magnifyRow(e.clientX, row, moods.length);
  }
  function onRowLeave() {
    moodScale = RESTING;
  }
</script>

<div class="mood-picker" class:is-compact={compact} role="radiogroup" aria-label={m.mood()}>
  <div class="mood-row" onpointermove={onRowMove} onpointerleave={onRowLeave}>
    {#each moods as mood, i (mood.value)}
      <button
        class="mood-btn"
        class:is-selected={mood.value === value}
        role="radio"
        aria-checked={mood.value === value}
        data-mood={mood.value}
        aria-label={mood.label}
        style:--mood-mag={moodScale[i]}
        onclick={() => onPick(mood.value === value ? null : mood.value)}
      >
        <MoodFace step={mood.value} size={44} blink />
        <span class="mood-label">{mood.label}</span>
      </button>
    {/each}
  </div>
</div>
