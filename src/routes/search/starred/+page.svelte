<script lang="ts">
  /* The starred shelf (phase 5 ticket 22), rebuilt on the kit.

     Two named areas rather than two `SectionTitle` labels over a photo grid
     and a flat run of entry cards: the photos keep their grid, which is what
     a photo wants, and the entries become day cards like everywhere else, so
     a starred entry looks the same here as it does on Home and on a day.

     Unbounded, and that is the design rather than an oversight - see the
     query's own note below. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  /* Unbounded, like photos.inJournal() (media/photos/+page.svelte): a
     starred list is self-limiting by how much a person actually stars,
     not by how large the journal is (ADR-0004's concern). */
  let entriesQuery = liveList((j) => j.entries.searchEntries('', [], { starred: true }));
  let entries = $derived(entriesQuery.rows);
  let groups = $derived(entryDayGroups(entries));

  let photosQuery = liveList((j) => j.photos.starredPhotos());
  let photos = $derived(photosQuery.rows);

  /* Not ReadGate's shape, and deliberately so (phase 5 audit ticket 04): the
     gate branches on one read, and this screen is empty only when both of
     its two come back with nothing. Starred entries with no starred photos
     is not an empty screen. */
  let loading = $derived(entriesQuery.loading || photosQuery.loading);
  let empty = $derived(!loading && entries.length === 0 && photos.length === 0);

  /* One coloured area: the entries. The photo grid is photographs, which
     bring their own colour and take none from the flag. */
  let role = $derived(roleAt(activeFlag.roles, 0));

  async function unstarPhoto(id: string) {
    await journal.photos.setStarred(id, false);
  }
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.starred_shelf_title()} screen="starred" back="/search" />

  {#if loading}
    <Skeleton variant="card" count={3} />
  {:else if empty}
    <Notice
      icon="star"
      key="starred-empty"
      {role}
      title={m.starred_shelf_empty_title()}
      text={m.starred_shelf_empty_body()}
    />
  {:else}
    {#if photos.length}
      <SectionHeading text={m.starred_shelf_photos_label()} />
      <div class="photo-grid" data-starred-photos>
        {#each photos as p (p.id)}
          <div class="starred-photo-cell">
            <PhotoThumb photo={p} size={104} />
            <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
            <button
              class="starred-photo-unstar press"
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
      <SectionHeading text={m.starred_shelf_entries_label()} />
      <EntryDays {groups} {role} />
    {/if}
  {/if}
</div>
