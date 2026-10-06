<script lang="ts">
  /* The starred photos under a Starred search, with their unstar mark. Its
     own component so /search and a saved question draw the same grid
     (after-release ticket 16 follow-up); the heading above it stays with
     each screen, which knows what else it is showing. */
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { photoSourceLabel } from '$lib/data/vocabulary/photoLibraryLabels';
  import { photoCaptionDate } from '$lib/data/dates';
  import type { LibraryPhoto } from '$lib/data/photos/library';
  import { measureCells, pinnedOut, tileIn, travelCells } from '$lib/motion/narrow';
  import type { CellBox } from '$lib/motion/regroup';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { photos }: { photos: LibraryPhoto[] } = $props();

  async function unstarPhoto(id: string) {
    await journal.photos.setStarred(id, false);
  }

  /* An unstarred photo leaves the grid the way a narrowed-away tile leaves
     the photo library (motion/narrow.ts): pinned out of the flow and faded
     where it stood, the rest walking to their new places. It used to vanish
     in one frame and the grid rewrapped under it. The rows arrive from a
     live read rather than from the tap, so the cells are measured before
     each change of `photos` reaches the DOM and walked after it. In the next
     animation frame, because that is where Svelte starts the leaving cell's
     outro and so pins it out of the flow; measured any sooner, the
     survivors still stand where they were and jump once the pin lands. */
  let grid = $state<HTMLElement>();
  let painted = $state(false);
  let before: CellBox[] = [];
  $effect.pre(() => {
    void photos;
    before = measureCells(grid, 'data-photo-key');
  });
  $effect(() => {
    void photos;
    const measured = before;
    requestAnimationFrame(() => travelCells(measured, grid, 'data-photo-key'));
    painted = true;
  });
</script>

<p class="search-hint">{m.search_starred_photos_scope()}</p>
<div class="photo-grid" data-starred-photos bind:this={grid}>
  {#each photos as p (p.id)}
    <div class="starred-photo-cell" data-photo-key={p.id} in:tileIn={{ when: painted }} out:pinnedOut>
      <PhotoThumb photo={p} size={104} label={photoSourceLabel(p.source)} />
      <span class="photo-date">{photoCaptionDate(p.epochDay)}</span>
      <button class="starred-photo-unstar press" aria-label={m.unstar_photo()} onclick={() => unstarPhoto(p.id)}>
        <Icon name="star" size={16} cls="is-starred" />
      </button>
    </div>
  {/each}
</div>

<style>
  /* Was /search's own rule; the saved question screen carries the same line. */
  .search-hint {
    font-size: var(--text-sm);
    color: var(--text-2);
    margin: var(--space-3) 0 0;
  }
</style>
