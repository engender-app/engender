<script lang="ts">
  /* The mood row: five moods, flush to the page with no container around it
     at all.

     Each one is a circle in its own step of the ramp with the face drawn in
     it, and the label underneath (Alicja, 2026-08-25: "the mood icon should
     always be a circle. no chips."). What it replaced was a filled tile with
     the label inside it and the face drawn without its disc.

     The tile existed for a real reason, worth writing down because it is the
     thing this now has to carry another way. ADR-0025's five steps are
     literal hexes chosen so --text clears 4.5:1 on top of them - they are
     built to be sat on - and on the dark theme they are all dark, so five of
     them as small flat dots on a dark panel have very little separation from
     each other or from the panel. A tile gave each step enough area to be
     read as a colour.

     What carries it now is the drawing rather than the area. Ticket 31 put
     2.2 units of mouth or a change of curve direction between neighbouring
     steps and gave the two ends of the ramp lids instead of dots, so a mood
     is legible from its face alone at 22px - well under the 40 these are.
     The colour is no longer the only thing telling the five apart, which is
     what the tile was compensating for.

     Selection is a ring outside the circle, which is the same answer the
     editor's picker gives (DIRECTION.md, tier 3: a picked mood lifts and
     takes its ring). It used to be the accent taking the tile's edge.

     Labels come from the vocabulary rather than from a catalogue read here,
     which is where every other mood label in the app comes from.

     The handle is , which is what the entry editor's own picker
     already carries: one concept, one handle (ADR-0029). This component had
     a  of its own while it had no screen to live on, and
     two names for "a mood option in a picker" is the drift the ADR exists
     to stop - the walkthrough would have had to learn which of the two a
     given screen happened to use. */
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import MoodFace from '../MoodFace.svelte';

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
</script>

<div class="kit-moods" data-kit-surface role="radiogroup" aria-label={m.mood()} data-mood-chips>
  {#each STEPS as step (step)}
    <button
      type="button"
      class="kit-mood press"
      role="radio"
      aria-checked={step === value}
      aria-label={moodName(step)}
      data-mood={step}
      onclick={() => onPick(step === value ? null : step)}
    >
      <MoodFace {step} size={40} />
      <span aria-hidden="true">{moodName(step)}</span>
    </button>
  {/each}
</div>
