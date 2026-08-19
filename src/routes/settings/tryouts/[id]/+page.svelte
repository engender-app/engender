<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import type { FeltSenseEntry, TryoutKind, TryoutPhoto } from '$lib/data/types';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { pickPhotos } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const KINDS: TryoutKind[] = ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'];
  const KIND_OPTIONS = KINDS.map((value) => ({ value, label: tryoutKindName(value) }));

  // A name or pronoun set already gets a placeholder shaped for it; every
  // other kind gets the free-text description instead (ticket 13's own
  // scope split).
  const hasDescription = (kind: TryoutKind) => kind !== 'name' && kind !== 'pronouns';

  const isNew = page.params.id === 'new';
  const tryoutId = page.params.id as string;
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let stored = liveQuery([], (j) => (isNew ? Promise.resolve([]) : j.tryouts.getTryouts()));
  let existing = $derived(stored.value?.find((t) => t.id === page.params.id));

  let draft = $state({
    kind: 'name' as TryoutKind,
    label: '',
    description: '',
    start: dateInputValueFromEpochDay(todayEpochDay()),
    end: ''
  });

  onFirstResult(stored, (tryouts) => {
    const found = tryouts?.find((t) => t.id === page.params.id);
    if (found) {
      draft = {
        kind: found.kind,
        label: found.label,
        description: found.description ?? '',
        start: dateInputValueFromEpochDay(found.startEpochDay),
        end: found.endEpochDay == null ? '' : dateInputValueFromEpochDay(found.endEpochDay)
      };
    }
  });

  async function saveTryout() {
    await journal.tryouts.upsertTryout({
      id: existing?.id,
      kind: draft.kind,
      label: draft.label,
      description: hasDescription(draft.kind) ? draft.description : null,
      startEpochDay: epochDayFromDateInputValue(draft.start) ?? todayEpochDay(),
      endEpochDay: draft.end ? epochDayFromDateInputValue(draft.end) : null
    });
    /* Back to the list rather than to this tryout's own new id: navigating
       within the same [id] route would reuse this component instance
       without `isNew`/`tryoutId` - captured once at the top - ever
       updating, leaving the felt-sense section permanently hidden after a
       create. Reopening the row is one extra tap, the same shape
       reminders' own create flow already has. */
    if (isNew) await goto('/settings/tryouts');
  }

  /* Only once a tryout has its own id, the same reasoning hair-removal's
     own photo section gives: a photo belongs to one tryout, so there is
     nothing to attach it to before that first save. */
  let photosQuery = liveQuery(['tryout'], (j) => (isNew ? Promise.resolve([]) : j.tryouts.getPhotos(tryoutId)));
  let photos = $derived(photosQuery.value ?? []);
  let photoDeleteTarget = $state<TryoutPhoto | null>(null);

  async function storePhoto(photo: NormalizedPhoto | null) {
    if (isNew || !photo) return;
    await journal.tryouts.addPhoto(tryoutId, todayEpochDay(), photo);
  }

  async function pickTryoutPhoto() {
    const [photo] = await pickPhotos(1);
    await storePhoto(photo ?? null);
  }

  // The context is this tryout: its own last photo, already loaded above.
  const tryoutPhotoReview = photoReview(
    () => (photos.length ? { fileName: photos[photos.length - 1].fileName } : null),
    storePhoto
  );

  async function deletePhoto() {
    if (!photoDeleteTarget) return;
    const id = photoDeleteTarget.id;
    photoDeleteTarget = null;
    await journal.tryouts.deletePhoto(id);
  }

  const HISTORY_LIMIT = 50;
  let feelingQuery = liveQuery(['feltSense'], (j) => (isNew ? Promise.resolve([]) : j.feltSense.forTryout(tryoutId)));
  let feeling = $derived(feelingQuery.value ?? []);

  let entriesQuery = liveQuery(['entry'], (j) =>
    isNew || !existing
      ? Promise.resolve([])
      : j.entries.searchEntries('', [], { startEpochDay: existing.startEpochDay, endEpochDay: existing.endEpochDay })
  );
  let entriesInRange = $derived(entriesQuery.value ?? []);

  let feelingMood = $state<number | null>(null);
  let feelingNote = $state('');
  async function addFeeling() {
    if (feelingMood == null) return;
    await journal.feltSense.add(
      { tryoutId },
      { epochDay: todayEpochDay(), mood: feelingMood, note: feelingNote.trim() || null }
    );
    feelingMood = null;
    feelingNote = '';
  }

  let feelingDeleteTarget = $state<FeltSenseEntry | null>(null);
  async function deleteFeeling() {
    if (!feelingDeleteTarget) return;
    const id = feelingDeleteTarget.id;
    feelingDeleteTarget = null;
    await journal.feltSense.remove(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings/tryouts" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{isNew ? m.tryout_new_title() : m.tryout_edit_title()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card editor-section">
    <div class="field">
      <span class="field-label">{m.tryout_kind_label()}</span>
      <Segmented
        name={m.tryout_kind_label()}
        options={KIND_OPTIONS}
        value={draft.kind}
        onChange={(v) => (draft.kind = v as TryoutKind)}
      />
    </div>
    <div class="field">
      <label class="field-label" for="tr-label">{m.tryout_label_label()}</label>
      <input
        class="input"
        id="tr-label"
        name="tr-label"
        placeholder={draft.kind === 'name'
          ? m.tryout_label_placeholder_name()
          : draft.kind === 'pronouns'
            ? m.tryout_label_placeholder_pronouns()
            : m.tryout_label_placeholder_other()}
        bind:value={draft.label}
      />
    </div>
    {#if hasDescription(draft.kind)}
      <div class="field">
        <label class="field-label" for="tr-description">{m.tryout_description_label()}</label>
        <textarea
          class="input"
          id="tr-description"
          rows="2"
          placeholder={m.tryout_description_placeholder()}
          bind:value={draft.description}
        ></textarea>
      </div>
    {/if}
    <div class="field">
      <label class="field-label" for="tr-start">{m.tryout_start_label()}</label>
      <input class="input" type="date" id="tr-start" name="tr-start" bind:value={draft.start} />
    </div>
    <div class="field">
      <label class="field-label" for="tr-end">{m.tryout_end_label()} <span class="muted">{m.tryout_end_hint()}</span></label>
      <input class="input" type="date" id="tr-end" name="tr-end" bind:value={draft.end} />
    </div>
    <button class="btn btn-primary" data-save-tryout disabled={draft.label.trim().length === 0} onclick={saveTryout}>
      <span>{isNew ? m.tryout_save() : m.tryout_save_changes()}</span>
    </button>
  </div>

  {#if !isNew}
    <SectionTitle text={m.tryout_feeling_title()} />
    <div class="card">
      <MoodPicker value={feelingMood} onPick={(v) => (feelingMood = v)} compact />
      <textarea
        class="input"
        rows="2"
        style="margin-top:var(--space-3)"
        placeholder={m.tryout_feeling_note_placeholder()}
        bind:value={feelingNote}
      ></textarea>
      <button
        class="btn btn-soft btn-block"
        style="margin-top:var(--space-3)"
        disabled={feelingMood == null}
        data-add-feeling
        onclick={addFeeling}
      >
        <span>{m.tryout_feeling_save()}</span>
      </button>
    </div>
    {#if feelingQuery.loading}
      <Skeleton variant="line" count={2} />
    {:else if feeling.length}
      <div class="list-group" style="margin-top:var(--space-3)">
        {#each feeling.slice(0, HISTORY_LIMIT) as f (f.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{dayLabel(f.epochDay)}</span>
              {#if f.note}<span class="row-subtitle">{f.note}</span>{/if}
            </span>
            <button class="icon-btn" aria-label={m.tryout_feeling_delete_sheet()} onclick={() => (feelingDeleteTarget = f)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="padding:var(--space-4)">{m.tryout_feeling_none()}</p>
    {/if}

    <SectionTitle text={m.tryout_photo_section_title()} />
    <div class="photo-row" style="margin-bottom:var(--space-3)">
      <button class="photo-add" aria-label={m.add_photo()} onclick={pickTryoutPhoto}>
        <Icon name="image" size={20} /><span>{m.add_photo()}</span>
      </button>
      <button class="photo-add" aria-label={m.add_photo_camera()} onclick={tryoutPhotoReview.capture}>
        <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
      </button>
    </div>
    {#if photosQuery.loading}
      <Skeleton variant="line" count={1} />
    {:else if photos.length}
      <div class="list-group" style="margin-bottom:var(--space-3)">
        {#each photos as p (p.id)}
          <div class="list-row" data-tryout-photo={p.id}>
            <PhotoThumb photo={p} size={48} />
            <button class="icon-btn" aria-label={m.tryout_photo_delete_sheet()} onclick={() => (photoDeleteTarget = p)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState title={m.tryout_photo_empty_title()} text={m.tryout_photo_empty_body()} />
    {/if}

    <SectionTitle text={m.tryout_entries_title()} />
    {#if entriesQuery.loading}
      <Skeleton variant="card" count={2} />
    {:else if entriesInRange.length}
      {#each entriesInRange as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {:else}
      <EmptyState title={m.tryout_entries_none()} text={m.tryout_entries_none_body()} />
    {/if}
  {/if}

  <Sheet open={feelingDeleteTarget !== null} title={m.tryout_feeling_delete_sheet()} onClose={() => (feelingDeleteTarget = null)}>
    {#if feelingDeleteTarget}
      <h3>{m.tryout_feeling_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.tryout_feeling_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-feeling onclick={deleteFeeling}><span>{m.tryout_feeling_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (feelingDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={photoDeleteTarget !== null} title={m.tryout_photo_delete_sheet()} onClose={() => (photoDeleteTarget = null)}>
    {#if photoDeleteTarget}
      <h3>{m.tryout_photo_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.tryout_photo_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-tryout-photo onclick={deletePhoto}><span>{m.tryout_photo_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (photoDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <PhotoAlignmentReview
    photo={tryoutPhotoReview.photo}
    reference={tryoutPhotoReview.reference}
    onAccept={tryoutPhotoReview.accept}
    onRetake={tryoutPhotoReview.capture}
    onCancel={tryoutPhotoReview.cancel}
  />
</div>
