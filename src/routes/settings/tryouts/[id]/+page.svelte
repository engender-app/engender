<script lang="ts">
  /* One tryout, on the surface kit (phase 5 UX ticket 25).

     Four cards became four named areas, which is the call ticket 22 made
     for the entry editor and recorded in DIRECTION.md: fields sit flush to
     the page under a heading rather than inside a box, because a box drawn
     around a form says the form is one item in a list of them.

     The felt-sense entries and the photographs kept their delete beside
     them, on the kit's split row, so a row is one control and the delete
     is another rather than a button floating inside a row that also opens
     something. */
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
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Three areas below the form: how it has felt, what it looked like, and
     what was written while it ran. */
  const SECTION_ROLE = { feeling: 0, photos: 1, entries: 2 };

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
  const photoRecord = recordEditor<TryoutPhoto>({
    remove: (id) => journal.tryouts.deletePhoto(id),
    findById: (id) => photos.find((p) => p.id === id)
  });
  let photoDeleteTarget = $derived(photoRecord.deleteTarget);

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

  const feelingRecord = recordEditor<FeltSenseEntry>({
    remove: (id) => journal.feltSense.remove(id),
    findById: (id) => feeling.find((f) => f.id === id)
  });
  let feelingDeleteTarget = $derived(feelingRecord.deleteTarget);
  /* One example per kind. Name and pronouns had their own and the other four
     shared "a short name for it", so moving between Style, Garment, Makeup
     and Presentation step changed the highlight and nothing else - which
     reads as a switcher that does not work (Alicja, 2026-08-26). An example
     of the thing itself is the shortest way to say what the kind means. */
  function labelPlaceholder(kind: TryoutKind): string {
    if (kind === 'name') return m.tryout_label_placeholder_name();
    if (kind === 'pronouns') return m.tryout_label_placeholder_pronouns();
    if (kind === 'style') return m.tryout_label_placeholder_style();
    if (kind === 'garment') return m.tryout_label_placeholder_garment();
    if (kind === 'makeup') return m.tryout_label_placeholder_makeup();
    if (kind === 'presentation_step') return m.tryout_label_placeholder_presentation_step();
    return m.tryout_label_placeholder_other();
  }
</script>


<div class="screen">
  <ScreenHeader title={isNew ? m.tryout_new_title() : m.tryout_edit_title()} back="/settings/tryouts" />

  <div class="editor-section">
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
        placeholder={labelPlaceholder(draft.kind)}
        bind:value={draft.label}
      />
    </div>
    {#if hasDescription(draft.kind)}
      <div class="disclosed" transition:disclose>
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
    <button class="btn btn-primary press" data-save-tryout disabled={draft.label.trim().length === 0} onclick={saveTryout}>
      <span>{isNew ? m.tryout_save() : m.tryout_save_changes()}</span>
    </button>
  </div>

  {#if !isNew}
    <SectionHeading text={m.tryout_feeling_title()} />
    <MoodPicker value={feelingMood} onPick={(v) => (feelingMood = v)} compact />
    <textarea
      class="input"
      rows="2"
     
      placeholder={m.tryout_feeling_note_placeholder()}
      bind:value={feelingNote}
    ></textarea>
    <button
      class="btn btn-soft btn-block press"
      style="margin:var(--space-3) 0"
      disabled={feelingMood == null}
      data-add-feeling
      onclick={addFeeling}
    >
      <span>{m.tryout_feeling_save()}</span>
    </button>
    {#if feelingQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={2} /></div>
    {:else if feeling.length}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}>
          {#each feeling.slice(0, HISTORY_LIMIT) as f (f.id)}
            <div class="kit-row is-static" data-feeling={f.id}>
              <span class="kit-row-text">
                <span class="kit-row-title">{dayLabel(f.epochDay)}</span>
                {#if f.note}<span class="kit-row-sub">{f.note}</span>{/if}
              </span>
              <button
                class="kit-row-act press"
                data-delete-feeling={f.id}
                aria-label={m.tryout_feeling_delete_sheet()}
                onclick={() => feelingRecord.askToDelete(f)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </ListCard>
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="heart"
          key="tryout-feeling-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}
          text={m.tryout_feeling_none()}
        />
      </div>
    {/if}

    <SectionHeading text={m.tryout_photo_section_title()} />
    <div class="photo-row" style="margin-bottom:var(--space-3)">
      <button class="photo-add" aria-label={m.add_photo()} onclick={pickTryoutPhoto}>
        <Icon name="image" size={20} /><span>{m.add_photo()}</span>
      </button>
      <button class="photo-add" aria-label={m.add_photo_camera()} onclick={tryoutPhotoReview.capture}>
        <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
      </button>
    </div>
    {#if photosQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={1} /></div>
    {:else if photos.length}
      <div style="margin-bottom:var(--space-3)">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}>
          {#each photos as p (p.id)}
            <div class="kit-row is-static" data-tryout-photo={p.id}>
              <PhotoThumb photo={p} size={48} />
              <span class="kit-row-text"></span>
              <button
                class="kit-row-act press"
                data-delete-tryout-photo={p.id}
                aria-label={m.tryout_photo_delete_sheet()}
                onclick={() => photoRecord.askToDelete(p)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </ListCard>
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="camera"
          key="tryout-photos-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
          title={m.tryout_photo_empty_title()}
          text={m.tryout_photo_empty_body()}
        />
      </div>
    {/if}

    <SectionHeading text={m.tryout_entries_title()} />
    {#if entriesQuery.loading}
      <div out:crossfade><Skeleton variant="card" count={2} /></div>
    {:else if entriesInRange.length}
      <div class="screen-part">
        {#each entriesInRange as e (e.id)}
          <EntryCard entry={e} />
        {/each}
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="book"
          key="tryout-entries-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.entries)}
          title={m.tryout_entries_none()}
          text={m.tryout_entries_none_body()}
        />
      </div>
    {/if}
  {/if}

  <ConfirmDeleteSheet
    open={feelingDeleteTarget !== null}
    title={m.tryout_feeling_delete_sheet()}
    question={m.tryout_feeling_delete_q()}
    hint={m.tryout_feeling_delete_hint()}
    confirmLabel={m.tryout_feeling_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-feeling': '' }}
    onConfirm={feelingRecord.confirmDelete}
    onCancel={feelingRecord.cancelDelete}
  />

  <ConfirmDeleteSheet
    open={photoDeleteTarget !== null}
    title={m.tryout_photo_delete_sheet()}
    question={m.tryout_photo_delete_q()}
    hint={m.tryout_photo_delete_hint()}
    confirmLabel={m.tryout_photo_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-tryout-photo': '' }}
    onConfirm={photoRecord.confirmDelete}
    onCancel={photoRecord.cancelDelete}
  />

  <PhotoAlignmentReview
    photo={tryoutPhotoReview.photo}
    reference={tryoutPhotoReview.reference}
    onAccept={tryoutPhotoReview.accept}
    onRetake={tryoutPhotoReview.capture}
    onCancel={tryoutPhotoReview.cancel}
  />
</div>
