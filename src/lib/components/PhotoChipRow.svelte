<script lang="ts">
  /* The chips over a photo grid (phase 11 ticket 14).

     Drawn by the library and by the journey export, which is the whole
     reason it is a component: the two screens narrow the same list by the
     same vocabulary, and a chip that means "Hair" on one and something
     else on the other would be worse than no chip at all.

     `.tag-chip` and not a Segmented: the number of chips is whatever the
     journal happens to hold, between two and six, and a segmented control
     is a fixed set of alternatives sized to fit. The reference is komoot's
     photo screen (Mobbin), where the same row sits over the same kind of
     grid.

     No colour carries the meaning. A chip is selected or it is not, in the
     accent every other selected chip in the app uses; which source a
     photograph came from is said in words on the tile itself (ADR-0012's
     rule, applied to a grid). */
  import { m } from '$lib/paraglide/messages';
  import type { PhotoChip } from '$lib/data/photos/library';
  import { photoChipLabel } from '$lib/data/vocabulary/photoLibraryLabels';

  let {
    chips,
    chip,
    onPick
  }: {
    /** Which chips this library has anything behind. Empty draws nothing:
        a library that answers to one chip has nothing to narrow
        (library.ts). */
    chips: PhotoChip[];
    chip: PhotoChip;
    onPick: (next: PhotoChip) => void;
  } = $props();
</script>

{#if chips.length}
  <div class="photo-chips" role="group" aria-label={m.ph_chips_label()} data-photo-chips>
    {#each chips as one (one)}
      <button
        class="tag-chip press"
        class:is-selected={one === chip}
        aria-pressed={one === chip}
        data-photo-chip={one}
        onclick={() => onPick(one)}
      >
        {photoChipLabel(one)}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Wraps, the way `.search-chips` does (screens.css). One scrolling line
     was the first shape, taken from the reference, and at 390px it put
     Surgery and Video off the right edge with nothing saying they were
     there - six chips in English are already wider than the screen and the
     Polish spellings are wider again. A second line costs one row of
     height once; a chip nobody can see is a filter nobody can reach. */
  .photo-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    /* The pill's own 6px hit-area overhang (.tag-chip::after,
       components.css) needs room above and below, or two wrapped rows'
       targets meet. */
    padding: 6px 0;
    margin-bottom: var(--space-2);
  }
</style>
