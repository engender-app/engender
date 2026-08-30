<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { moodMagnifier } from './moodMagnifier.svelte';
  import MoodFace from './MoodFace.svelte';

  let {
    value = null,
    compact = false,
    onPick,
  }: { value?: number | null; compact?: boolean; onPick: (v: number | null) => void } = $props();

  let moods = $derived([1, 2, 3, 4, 5].map((v) => ({ value: v, label: moodName(v) })));

  /* Grows the face under the pointer, the same magnifier quick add's fan
     answers a slide with (magnifier.ts, moodMagnifier.svelte.ts). A mouse
     hovers; a finger presses and slides - and that already works without
     taking the pointer captive, because a touch is implicitly captured to
     the face it went down on and every move bubbles up through the row.
     The release puts every face back. */
  const magnifier = moodMagnifier(5);
</script>

<div class="mood-picker" class:is-compact={compact} role="radiogroup" aria-label={m.mood()}>
  <div
    class="mood-row"
    role="presentation"
    onpointermove={magnifier.onRowMove}
    onpointerup={magnifier.onRowRelease}
    onpointercancel={magnifier.onRowRelease}
    onpointerleave={magnifier.onRowLeave}
  >
    {#each moods as mood, i (mood.value)}
      <button
        class="mood-btn"
        class:is-selected={mood.value === value}
        role="radio"
        aria-checked={mood.value === value}
        data-mood={mood.value}
        aria-label={mood.label}
        style:--mood-mag={magnifier.moodScale[i]}
        onclick={() => onPick(mood.value === value ? null : mood.value)}
      >
        <MoodFace step={mood.value} size={44} blink />
        <span class="mood-label">{mood.label}</span>
      </button>
    {/each}
  </div>
</div>
