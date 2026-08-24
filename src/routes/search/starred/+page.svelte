<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* Unbounded, like photos.inJournal() (settings/photos/+page.svelte): a
     starred list is self-limiting by how much a person actually stars,
     not by how large the journal is (ADR-0004's concern). */
  let entriesQuery = liveQuery(['entry'], (j) => j.entries.searchEntries('', [], { starred: true }));
  let entries = $derived(entriesQuery.value ?? []);

  let photosQuery = liveQuery(['photo'], (j) => j.photos.starredPhotos());
  let photos = $derived(photosQuery.value ?? []);

  let loading = $derived(entriesQuery.loading || photosQuery.loading);
  let empty = $derived(!loading && entries.length === 0 && photos.length === 0);

  async function unstarPhoto(id: string) {
    await journal.photos.setStarred(id, false);
  }
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.starred_shelf_title()} back="/search" />

  {#if loading}
    <Skeleton variant="card" count={3} />
  {:else if empty}
    <EmptyState title={m.starred_shelf_empty_title()} text={m.starred_shelf_empty_body()} />
  {:else}
    {#if photos.length}
      <SectionTitle text={m.starred_shelf_photos_label()} />
      <div class="photo-grid">
        {#each photos as p (p.id)}
          <div class="starred-photo-cell">
            <PhotoThumb photo={p} size={104} />
            <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
            <button
              class="starred-photo-unstar"
              aria-label={m.unstar_photo()}
              onclick={() => unstarPhoto(p.id)}
            >
              <Icon name="star" size={16} cls="is-starred" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if entries.length}
      <SectionTitle text={m.starred_shelf_entries_label()} />
      {#each entries as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {/if}
  {/if}
</div>
