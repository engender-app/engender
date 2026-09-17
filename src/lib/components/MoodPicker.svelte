<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { moodMagnifier } from './moodMagnifier.svelte';
  import MoodFace from './MoodFace.svelte';

  let {
    value = null,
    compact = false,
    bar = false,
    onPick,
  }: {
    value?: number | null;
    compact?: boolean;
    /** Compact faces in full-size targets beside the save controls. */
    bar?: boolean;
    onPick: (v: number | null) => void;
  } = $props();

  let moods = $derived([1, 2, 3, 4, 5].map((v) => ({ value: v, label: moodName(v) })));

  /* Grows the face under the pointer, the same magnifier quick add's fan
     answers a slide with (magnifier.ts, moodMagnifier.svelte.ts). A mouse
     hovers; a finger presses and slides - and that already works without
     taking the pointer captive, because a touch is implicitly captured to
     the face it went down on and every move bubbles up through the row.
     The release puts every face back. */
  const magnifier = moodMagnifier(5);

  /* The row hears about the pick before the caller does: the beat afterwards -
     the four unpicked faces turning to look at the chosen one - is addressed
     by cell index, and the index is a thing only the row knows. Clearing a
     mood sends null, and null is the row letting go. */
  function choose(i: number) {
    const next = moods[i].value === value ? null : moods[i].value;
    magnifier.onPick(next === null ? null : i);
    onPick(next);
  }
</script>

<div class="mood-picker" class:is-compact={compact} class:is-bar={bar} role="radiogroup" use:rovingRadio aria-label={m.mood()}>
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
        onclick={() => choose(i)}
      >
        <MoodFace step={mood.value} size={bar ? 32 : 44} alive gaze={magnifier.moodGaze[i]} />
        {#if !bar}
          <span class="mood-label">{mood.label}</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* The bar form's own geometry; the faces' drawing, ring and magnifier are
     components.css's and are untouched. Scoped here rather than in the
     shared sheet because this row is the one consumer of the form. */
  .mood-picker.is-bar .mood-row {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-1);
    --mood-lift: 16px;
  }
  .mood-picker.is-bar .mood-btn {
    flex: 1 0 48px;
    min-width: 48px;
    min-height: 48px;
    gap: 0;
    padding: var(--space-2);
  }
  /* The picked face's 1.18 scale on a 32px face is 38px, inside the bar's
     48px line, so the row never grows the bar. */
  .mood-picker.is-bar .mood-btn.is-selected :global(.mood-face) {
    transform: scale(1.18);
  }
</style>
