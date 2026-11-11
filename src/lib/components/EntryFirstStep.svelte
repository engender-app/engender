<script lang="ts">
  /* A new entry's first step (tester report 02, ticket 03): the quick answer
     before the writing. The five faces and every scale the person has ticked,
     in their own order, and nothing else - a person who only wants to mark
     the day is done here, and nothing on it is required.

     The faces are first and the scales under them, so however long the list
     of scales grows the faces are never below it, and the foot that saves is
     pinned under the scroll region (EntryEditor's SaveBar). Mode chips are not
     scales and stay with the rest of the entry.

     Renders no wrapper of its own: its blocks are the step's children, so they
     take the screen's 20 between blocks like any other. */
  import { m } from '$lib/paraglide/messages';
  import type { GenderDimension } from '$lib/data/types';
  import MoodPicker from './MoodPicker.svelte';
  import DimensionSlider from './DimensionSlider.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    mood,
    dims,
    values,
    saving,
    onMood,
    onDim,
    faces = $bindable()
  }: {
    mood: number | null;
    /** The ticked scales, plus any the draft already holds that are not. */
    dims: { dim: GenderDimension; ticked: boolean }[];
    values: Record<string, number>;
    saving: boolean;
    onMood: (mood: number | null) => void;
    onDim: (key: string, value: number) => void;
    /** The faces' group, which an unmet save focuses. */
    faces?: HTMLElement;
  } = $props();
</script>

<fieldset class="first-step-faces" data-first-step-moods disabled={saving} inert={saving} bind:this={faces}>
  <MoodPicker value={mood} onPick={onMood} />
</fieldset>

{#if dims.length > 0}
  <SectionHeading text={m.gender_label()} />
  {#each dims as { dim, ticked } (dim.key)}
    <DimensionSlider {dim} value={values[dim.key] ?? null} onInput={(v) => { if (!saving) onDim(dim.key, v); }} />
    {#if !ticked}
      <p class="first-step-hint">{m.scale_not_ticked()}</p>
    {/if}
  {/each}
{/if}

<style>
  .first-step-faces { margin-inline: 0; padding: 0; border: 0; min-width: 0; }
  /* Under the slider it belongs to, closing up against it as the editor's
     own hint does. */
  .first-step-hint {
    color: var(--text-2);
    font-size: var(--text-sm);
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  }
</style>
