<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { createEntryDraft, type EntryDraft } from '$lib/data/entryDraft';
  import { applyPersistedDraft, draftMatchesRoute, serializeDraft } from '$lib/data/entryDraftPersistence';
  import { localStorageEntryDraft } from '$lib/data/entryDraftStore';
  import { capturePhoto, pickPhotos } from '$lib/stores/photoPicking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { EntryPrompt, EntryTemplate, GenderDimension } from '$lib/data/types';
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

  /* Survives an Android process death (ticket 14): mirrored to localStorage
     on every change below and cleared the moment this editor unmounts, so
     only a killed-while-backgrounded process ever leaves it to be found on
     the next mount. A same-process background/resume never unmounts this
     component at all, so its in-memory state alone already handles that
     case - this only ever restores after a real process death. */
  const draftStore = localStorageEntryDraft();

  function restoreIfPersisted(target: EntryDraft) {
    const persisted = draftStore.read();
    if (!persisted) return;
    if (draftMatchesRoute(persisted, entryId, target.epochDay)) applyPersistedDraft(target, persisted);
    else draftStore.clear(); // a different editor's leftovers - not this one's to resume
  }

  // svelte-ignore state_referenced_locally
  restoreIfPersisted(entryDraft);

  onFirstResult(loaded, (entry) => {
    if (!entry) return;
    const fresh = createEntryDraft(entry.epochDay, entry);
    restoreIfPersisted(fresh);
    entryDraft = fresh;
  });

  $effect(() => {
    draftStore.write(serializeDraft(entryDraft));
  });

  onDestroy(() => draftStore.clear());

  let deleteOpen = $state(false);
  let saving = $state(false);
  let templateSheetOpen = $state(false);
  let promptDismissed = $state(false);
  /* Guided prompts and templates are entry-creation aids (ticket 17), not
     something to surface while editing an already-saved entry - `entryId`
     is undefined only for a new one. Read once, like `seedMood` above: the
     route wraps this component in {#key}, so a fresh editor always means a
     fresh prompt, never a stale one left over from a previous mount. */
  // svelte-ignore state_referenced_locally
  let prompt = $state<EntryPrompt | null>(
    entryId == null && prefs.guidedPromptsEnabled ? vocabulary.randomPrompt() : null
  );

  /* A template only ever pre-fills what this install currently shows -
     a hidden dimension or tag stays out of the draft even if the template
     names it, because the picker that would let someone edit it back off
     is exactly what `hidden` took out of the editor (CONTEXT: "Hidden").
     Applying the same template twice cannot double up: applyTemplate()
     unions the tags and overwrites the dims by key. */
  function applyTemplate(tpl: EntryTemplate) {
    const visibleTagIds = new Set(vocabulary.visibleTagGroups.flatMap((g) => g.tags.map((t) => t.id)));
    const visibleDimKeys = new Set(vocabulary.dimensions.filter((d) => !d.hidden).map((d) => d.key));
    entryDraft.applyTemplate(
      tpl.tags.filter((id) => visibleTagIds.has(id)),
      Object.fromEntries(Object.entries(tpl.dims).filter(([key]) => visibleDimKeys.has(key)))
    );
    templateSheetOpen = false;
  }
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

  async function takePhoto() {
    const photo = await capturePhoto();
    if (photo) entryDraft.addPhoto(photo);
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
      /* A quick log (seedMood set) that is still mood-only at save time
         offers to fill in the active preset's scales too, right on Home
         (ticket 13, beta B2) - the entry id travels there as a query param
         since the save already navigates there, the way `seedMood` and
         `celebrate` also arrive as query params (though those are read
         directly; this one is consumed once and stripped from the URL by
         +page.svelte, since the sheet must not reopen on a reload or the
         back button). Offering that sheet replaces the "Add details" nudge
         below rather than stacking alongside it - both are the same kind of
         post-save suggestion, and showing both would ask for the same thing
         twice. */
      const offerDims = seedMood != null && entryDraft.hasMoodOnlyContent && vocabulary.activeDimensions.length > 0;
      await goto(offerDims ? `/?quickLogDims=${id}` : '/');
      if (offerDims) {
        toast(m.saved());
      } else if (prefs.entryNudges && entryDraft.hasMoodOnlyContent) {
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

  {#if prompt && !promptDismissed}
    <div class="notice notice-info" role="status">
      <Icon name="sparkle" size={18} />
      <div class="notice-body">
        <span>{prompt.text}</span>
      </div>
      <button class="icon-btn" aria-label={m.dismiss()} onclick={() => (promptDismissed = true)}>
        <Icon name="x" size={18} />
      </button>
    </div>
  {/if}

  {#if entryId == null}
    <button class="btn btn-ghost" data-use-template onclick={() => (templateSheetOpen = true)}>
      <Icon name="sparkle" size={18} /><span>{m.use_template()}</span>
    </button>
  {/if}

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
        <Icon name="image" size={22} /><span>{m.add_photo()}</span>
      </button>
      <button class="photo-add" aria-label={m.add_photo_camera()} onclick={takePhoto}>
        <Icon name="camera" size={22} /><span>{m.add_photo_camera()}</span>
      </button>
    </div>
  </section>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save disabled={saving} onclick={saveEntry}>
      <Icon name="check" size={20} /><span>{m.save_entry()}</span>
    </button>
  </div>
  {/if}

  <Sheet bind:open={templateSheetOpen} title={m.use_template()}>
    <div class="stack-3">
      {#each vocabulary.entryTemplates as tpl (tpl.key)}
        <button class="list-row" onclick={() => applyTemplate(tpl)}>{tpl.name}</button>
      {/each}
    </div>
  </Sheet>

  <Sheet bind:open={deleteOpen} title={m.delete_entry_q()}>
    <h3>{m.delete_entry_q()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.delete_entry_hint()}</p>
    <div class="stack-3">
      <button class="btn btn-danger" onclick={confirmDelete}><span>{m.delete_entry()}</span></button>
      <button class="btn btn-ghost" onclick={() => (deleteOpen = false)}><span>{m.keep_it()}</span></button>
    </div>
  </Sheet>
</div>
