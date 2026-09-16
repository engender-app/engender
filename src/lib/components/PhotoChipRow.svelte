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
  /* One line that scrolls rather than a wrapping block: six chips at the
     Polish spellings are wider than 390px, and a filter row that grows to
     two lines moves the grid under it every time the journal gains a
     source. `.search-chips` wraps for the opposite reason - its chips are
     a record of what somebody typed, and all of them have to be visible at
     once. */
  .photo-chips {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    scrollbar-width: none;
    /* The pill's 6px hit-area overhang (.tag-chip::after, components.css)
       is clipped by the scroller otherwise, taking a third of the target
       with it. */
    padding: 6px 0;
    margin-bottom: var(--space-2);
  }
  .photo-chips::-webkit-scrollbar {
    display: none;
  }
  .photo-chips .tag-chip {
    flex: none;
  }
</style>
