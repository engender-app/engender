<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { createEntryDraft, type EntryDraft } from '$lib/data/entryDraft';
  import { pickPhotos } from '$lib/stores/photoPicking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { GenderDimension } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import BodyRegionPicker from '$lib/components/BodyRegionPicker.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { epochDay, entryId, seedMood }: { epochDay?: number; entryId?: number; seedMood?: number | null } = $props();

  /* An entry to edit is a round trip away now, so the draft cannot be built
     during initialisation the way it was over the synchronous store. The
     route wraps this component in {#key}, so a different entry or day mounts
     a fresh editor and this loads once.

     `['entry']` is not in the table list on purpose: this query fills a draft,
     and re-running it because something else wrote an entry would throw away
     what the user has typed. */
  let loaded = liveQuery([], (j) => (entryId != null ? j.entries.getEntry(entryId) : Promise.resolve(undefined)));
  let existing = $derived(loaded.value);
  let day = $derived(existing?.epochDay ?? epochDay ?? todayEpochDay());

  /* Local draft; committed as one action on Save (F1), and filled from the
     stored entry the moment it arrives (entryDraft.ts, ticket 29). */
  // Captured once on purpose: the route wraps this component in {#key}, so a
  // different entry or day mounts a fresh editor with a fresh draft.
  // svelte-ignore state_referenced_locally
  let entryDraft = $state<EntryDraft>(createEntryDraft(epochDay ?? todayEpochDay(), undefined, seedMood));

  onFirstResult(loaded, (entry) => {
    if (entry) entryDraft = createEntryDraft(entry.epochDay, entry);
  });

  let deleteOpen = $state(false);
  let saving = $state(false);
  /* The union of the active preset's dimensions and the entry's own: an
     old entry logged under a wider preset keeps its extra dimensions on screen
     (marked below), instead of silently dropping their history on save. */
  let dims = $derived.by(() => {
    const active = vocabulary.activeDimensions;
    const extras = Object.keys(entryDraft.dims)
      .filter((key) => !active.some((d) => d.key === key))
      .map((key) => vocabulary.dimensions.find((d) => d.key === key))
      .filter((d): d is GenderDimension => !!d);
    return [...active.map((dim) => ({ dim, inPreset: true })), ...extras.map((dim) => ({ dim, inPreset: false }))];
  });
  let preset = $derived(vocabulary.activePreset);
  let isToday = $derived(day === todayEpochDay());

  // An entry holds several photos, so one trip through the picker can bring
  // back several (photoPicking.ts).
  async function addPhoto() {
    for (const photo of await pickPhotos()) entryDraft.addPhoto(photo);
  }

  let moodMissing = $derived(entryDraft.mood == null);

  async function saveEntry() {
    if (moodMissing) {
      toast(m.entry_needs_mood());
      return;
    }
    if (saving) return; // a second tap while the worker is writing
    saving = true;
    try {
      const id = await journal.entries.upsertEntry(entryDraft.toUpsert());
      await goto('/');
      if (prefs.entryNudges && entryDraft.hasMoodOnlyContent) {
        toast(m.saved(), { actionLabel: m.add_details(), onAction: () => goto(`/entry/${id}`) });
      } else {
        toast(m.saved());
      }
    } catch (error) {
      console.error('could not save the entry', error);
      toast(m.entry_save_failed());
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    deleteOpen = false;
    if (existing) await journal.entries.deleteEntry(existing.id);
    goto('/');
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href={existing ? `/day/${day}` : '/'} aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{existing ? m.entry() : m.new_entry()}</h1>
    <div class="header-action">
      {#if existing}
        <button class="icon-btn" aria-label={m.delete_entry()} onclick={() => (deleteOpen = true)}>
          <Icon name="trash" size={20} />
        </button>
      {/if}
    </div>
  </header>
  <p class="editor-date">
    {isToday ? `${m.today()} · ` : ''}{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}{existing ? ` · ${fmtTime(existing.timestamp)}` : ''}
  </p>

  <!-- An existing entry has to arrive before the draft can hold it, so the
       editor waits rather than showing an empty form that fills itself in
       under the user's hands. A new entry has nothing to wait for. -->
  {#if loaded.loading}
    <Skeleton variant="block" count={3} />
  {:else}
  <section class="card editor-section">
    <h2 class="editor-heading">{m.mood()}</h2>
    <MoodPicker value={entryDraft.mood} onPick={(v) => entryDraft.setMood(v)} />
  </section>

  <section class="card editor-section">
    <div class="spread">
      <h2 class="editor-heading">{m.gender_label()}</h2>
      <a class="small" style="color:var(--accent);text-decoration:none" href="/settings">{m.preset_prefix()} {preset.name}</a>
    </div>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.gender_hint()}</p>
    {#each dims as { dim, inPreset } (dim.key)}
      <DimensionSlider {dim} value={entryDraft.dims[dim.key] ?? null} onInput={(v) => entryDraft.setDim(dim.key, v)} />
      {#if !inPreset}
        <p class="muted small" style="margin-top:calc(var(--space-2) * -1);margin-bottom:var(--space-3)">
          {m.not_in_preset()}
        </p>
      {/if}
    {/each}
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.tags_label()}</h2>
    <TagPicker
      groups={vocabulary.visibleTagGroups}
      selected={entryDraft.tags}
      onToggle={(id) => entryDraft.toggleTag(id)}
    />
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.body_map_label()}</h2>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.body_map_hint()}</p>
    <BodyRegionPicker
      regions={vocabulary.bodyRegions}
      values={entryDraft.bodyRegions}
      onToggle={(key) => entryDraft.toggleBodyRegion(key)}
      onIntensityInput={(key, v) => entryDraft.setBodyRegionIntensity(key, v)}
    />
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.note_label()}</h2>
    <textarea class="input" id="ed-note" name="note" rows="4" placeholder={m.note_placeholder()} bind:value={entryDraft.note}
    ></textarea>
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.photos_label()}</h2>
    <div class="photo-row">
      {#each entryDraft.photos as p, i (p)}
        <div class="photo-wrap">
          {#if p.kind === 'stored'}
            <PhotoThumb photo={p.photo} size={72} />
          {:else}
            <PhotoThumb photo={{ fileName: null }} bytes={p.photo.thumb} size={72} />
          {/if}
          <button class="photo-remove" aria-label={m.photo_remove()} onclick={() => entryDraft.removePhoto(i)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      {/each}
      <button class="photo-add" aria-label={m.add_photo()} onclick={addPhoto}>
        <Icon name="camera" size={22} /><span>{m.add_photo()}</span>
      </button>
    </div>
  </section>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save disabled={saving} onclick={saveEntry}>
      <Icon name="check" size={20} /><span>{m.save_entry()}</span>
    </button>
  </div>
  {/if}

  <Sheet bind:open={deleteOpen} title={m.delete_entry_q()}>
    <h3>{m.delete_entry_q()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.delete_entry_hint()}</p>
    <div class="stack-3">
      <button class="btn btn-danger" onclick={confirmDelete}><span>{m.delete_entry()}</span></button>
      <button class="btn btn-ghost" onclick={() => (deleteOpen = false)}><span>{m.keep_it()}</span></button>
    </div>
  </Sheet>
</div>
