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
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { photos }: { photos: LibraryPhoto[] } = $props();

  async function unstarPhoto(id: string) {
    await journal.photos.setStarred(id, false);
  }
</script>

<p class="search-hint">{m.search_starred_photos_scope()}</p>
<div class="photo-grid" data-starred-photos>
  {#each photos as p (p.id)}
    <div class="starred-photo-cell">
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
