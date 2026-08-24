<script lang="ts">
  /* The chip row: the mood picker, flush to the page with no container
     around it at all.

     Mood is a filled tile with its label inside rather than a dot, and that
     is a consequence of how the ramp was built. ADR-0025's steps are
     literal hexes chosen so --text clears 4.5:1 on top of them - they are
     made to be sat on. On the dark theme they are all dark, so the same
     five colours used as small dots on a dark panel have almost no
     separation from each other or from the panel.

     Nothing sits in the tile but its label. Selection is the accent taking
     the tile's edge, and the dot that used to mark it was the pattern the
     ramp's own note argues against reintroduced on top of a border that
     already said the same thing.

     Labels come from the vocabulary rather than from a catalogue read here,
     which is where every other mood label in the app comes from. */
  import { m } from '$lib/paraglide/messages';
  import { moodName } from '$lib/data/vocabulary/labels';

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
      data-mood-chip={step}
      onclick={() => onPick(step === value ? null : step)}
    >
      <span aria-hidden="true">{moodName(step)}</span>
    </button>
  {/each}
</div>
