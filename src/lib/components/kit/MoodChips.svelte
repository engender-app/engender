<script lang="ts">
  import { rovingRadio } from '$lib/components/rovingRadio';
  /* The row draws five rounded-square mood faces with labels underneath.
     The mood ramp clears 4.5:1 against --text. The faces also
     distinguish adjacent steps at 22px through mouth shape and eyelids,
     so the picker does not rely on hue alone.

     Selection lifts the face and draws a ring outside it. Read the labels
     from the mood vocabulary and use data-mood, the entry editor's picker
     handle (ADR-0029). */
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { moodMagnifier } from '../moodMagnifier.svelte';
  import MoodFace from '../MoodFace.svelte';
  import { holdFacesWhileStill } from '$lib/motion/holdWhileStill';

  let {
    value = null,
    onPick
  }: {
    value?: number | null;
    /** Picking the selected mood again clears it, so a mistap is undoable
        without a second control to undo it with. */
    onPick: (value: number | null) => void;
  } = $props();

  const STEPS = [1, 2, 3, 4, 5];

  /* Grows the face under the pointer, the same magnifier quick add's fan
     answers a slide with (magnifier.ts via moodMagnifier.svelte.ts). A
     mouse hovers; a finger presses and slides - implicit capture on the
     pressed face keeps the moves coming as the finger travels, and they
     bubble up here. The release puts every face back. */
  const magnifier = moodMagnifier(STEPS.length);

  /* The row hears about the pick before the caller does, because the beat it
     runs afterwards - the four unpicked faces turning to look at the chosen
     one - needs the cell index, and the index is a thing only the row knows.
     Clearing a mood sends null, and null is the row letting go. */
  function announce(i: number, next: number | null) {
    magnifier.onPick(next === null ? null : i);
    onPick(next);
  }

  /* A tap toggles: picking the selected mood again clears it. An arrow key
     picks nothing here, because Today's pick opens the editor: arrows only
     move focus, and Space or Enter is the pick (rovingRadio's
     `selectOnArrow`, audit A11Y-02). */
  function choose(i: number) {
    announce(i, STEPS[i] === value ? null : STEPS[i]);
  }
</script>

<div
  class="kit-moods"
  data-kit-surface
  role="radiogroup"
  use:rovingRadio={{ selectOnArrow: false }}
  tabindex="-1"
  aria-label={m.mood()}
  data-mood-chips
  {@attach holdFacesWhileStill}
  onpointermove={magnifier.onRowMove}
  onpointerup={magnifier.onRowRelease}
  onpointercancel={magnifier.onRowRelease}
  onpointerleave={magnifier.onRowLeave}
>
  {#each STEPS as step, i (step)}
    <button
      type="button"
      class="kit-mood press"
      role="radio"
      aria-checked={step === value}
      aria-label={moodName(step)}
      data-mood={step}
      style:--mood-mag={magnifier.moodScale[i]}
      onclick={() => choose(i)}
    >
      <!-- 48, not 40 - the same number as --touch-target, so the circle itself now clears
           the row item's own floor rather than the label beneath it being what gets it
           there. -->
      <MoodFace {step} size={48} alive gaze={magnifier.moodGaze[i]} />
      <span aria-hidden="true">{moodName(step)}</span>
    </button>
  {/each}
</div>
