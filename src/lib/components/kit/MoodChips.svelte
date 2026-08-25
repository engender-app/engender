<script lang="ts">
  /* The chip row: the mood picker, flush to the page with no container
     around it at all.

     Mood is a filled tile with its label inside rather than a dot, and that
     is a consequence of how the ramp was built. ADR-0025's steps are
     literal hexes chosen so --text clears 4.5:1 on top of them - they are
     made to be sat on. On the dark theme they are all dark, so the same
     five colours used as small dots on a dark panel have almost no
     separation from each other or from the panel.

     The face inside is the same one an entry carries in a day card, minus
     its disc: on a tile already filled with the mood's own colour a filled
     circle would be invisible, and what is left - the eyes and the mouth -
     is the part that says which step this is. Selection is the accent
     taking the tile's edge. An earlier pass marked it with a dot as well,
     which is the pattern the ramp's own note argues against, on top of a
     border that already said the same thing.

     Labels come from the vocabulary rather than from a catalogue read here,
     which is where every other mood label in the app comes from.

     The handle is `data-mood`, which is what the entry editor's own picker
     already carries: one concept, one handle (ADR-0029). This component had
     a `data-mood-chip` of its own while it had no screen to live on, and
     two names for "a mood option in a picker" is the drift the ADR exists
     to stop - the walkthrough would have had to learn which of the two a
     given screen happened to use. */
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';
  import MoodFace from './MoodFace.svelte';

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

<div class="kit-chips" role="radiogroup" aria-label={m.mood()} data-mood-chips>
  {#each STEPS as step (step)}
    <button
      type="button"
      class="kit-chip press"
      style={`--chip-fill: var(--mood-${step})`}
      role="radio"
      aria-checked={step === value}
      aria-label={moodName(step)}
      data-mood={step}
      onclick={() => onPick(step === value ? null : step)}
    >
      <MoodFace {step} size={26} disc={false} />
      <span aria-hidden="true">{moodName(step)}</span>
    </button>
  {/each}
</div>
