<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { hairRemovalAreaName, hairRemovalMethodName, severityName } from '$lib/data/vocabulary/labels';
  import { daysSinceLastSession } from '$lib/data/hairRemovalSchedule';
  import { HAIR_REMOVAL_AREAS } from '$lib/data/hairRemovalAreas';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairRemovalSession, HairRemovalMethod } from '$lib/data/types';
  import { HAIR_REMOVAL_METHODS } from '$lib/data/types';
  import type { HairRemovalPhoto } from '$lib/data/journal/hairRemoval';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { capturePhoto, pickPhotos, type ReferencePhoto } from '$lib/stores/photoPicking';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const PAIN_RATINGS = [1, 2, 3, 4, 5];

  const today = todayEpochDay();

  let sessionsQuery = liveQuery(['hairRemoval'], (j) => j.hairRemoval.getSessions());
  let sessions = $derived(sessionsQuery.value ?? []);

  let recency = $derived(daysSinceLastSession(sessions, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let editor = $state<{
    id?: string;
    date: string;
    area: string;
    method: HairRemovalMethod;
    painRating: string;
    cost: string;
    provider: string;
  } | null>(null);
  let deleteTarget = $state<HairRemovalSession | null>(null);

  function openEditor(session: HairRemovalSession | null) {
    editor = session
      ? {
          id: session.id,
          date: dateInputValueFromEpochDay(session.epochDay),
          area: session.area,
          method: session.method,
          painRating: String(session.painRating),
          cost: session.cost,
          provider: session.provider
        }
      : { date: dateInputValueFromEpochDay(today), area: HAIR_REMOVAL_AREAS[0], method: 'laser', painRating: '3', cost: '', provider: '' };
  }

  async function saveSession() {
    if (!editor) return;
    await journal.hairRemoval.upsertSession({
      id: editor.id,
      epochDay: epochDayFromDateInputValue(editor.date) ?? today,
      area: editor.area,
      method: editor.method,
      painRating: Number(editor.painRating),
      cost: editor.cost,
      provider: editor.provider
    });
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = sessions.find((session) => session.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteSession() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.hairRemoval.deleteSession(id);
  }

  /* Only once a session has its own id: a photo belongs to one session
     (hairRemoval.ts's own foreign key), so there is nothing to attach it to
     before that first save. */
  let photosQuery = liveQuery(['hairRemoval'], (j) => (editor?.id ? j.hairRemoval.getPhotos(editor.id) : Promise.resolve([])));
  let photos = $derived(photosQuery.value ?? []);
  let photoDeleteTarget = $state<HairRemovalPhoto | null>(null);

  async function storePhoto(photo: NormalizedPhoto | null) {
    if (!editor?.id || !photo) return;
    await journal.hairRemoval.addPhoto(editor.id, photo);
  }

  async function pickSessionPhoto() {
    const [photo] = await pickPhotos(1);
    await storePhoto(photo ?? null);
  }

  // The context is this session: its own last photo, already loaded above.
  let reviewingPhoto = $state<NormalizedPhoto | null>(null);
  let reviewReference = $derived<ReferencePhoto | null>(
    photos.length ? { fileName: photos[photos.length - 1].fileName } : null
  );

  async function captureSessionPhoto() {
    const photo = await capturePhoto();
    if (photo) reviewingPhoto = photo;
  }

  async function useReviewedPhoto(photo: NormalizedPhoto) {
    reviewingPhoto = null;
    await storePhoto(photo);
  }

  async function deletePhoto() {
    if (!photoDeleteTarget) return;
    const id = photoDeleteTarget.id;
    photoDeleteTarget = null;
    await journal.hairRemoval.deletePhoto(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.hair_removal()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.hair_removal_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if sessionsQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if sessions.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.hair_removal_intro()}</p>

    <SectionTitle text={m.hair_removal_recency_title()} />
    <div class="list-group" style="margin-bottom:var(--space-4)">
      {#each HAIR_REMOVAL_AREAS as area (area)}
        {@const days = recency[area]}
        <div class="list-row" data-recency={area}>
          <span class="row-text">
            <span class="row-title">{hairRemovalAreaName(area)}</span>
            <span class="row-subtitle">
              {days === null ? m.hair_removal_area_never_used() : m.hair_removal_area_days_ago({ days: m.n_days({ n: days }) })}
            </span>
          </span>
        </div>
      {/each}
    </div>

    <div class="list-group">
      {#each [...sessions].reverse() as session (session.id)}
        <button
          class="list-row"
          data-hair-removal-session={session.id}
          aria-label={m.hair_removal_row_aria({ area: hairRemovalAreaName(session.area), date: dayLabel(session.epochDay) })}
          onclick={() => openEditor(session)}
        >
          <span class="row-text">
            <span class="row-title">{hairRemovalAreaName(session.area)}</span>
            <span class="row-subtitle">
              {dayLabel(session.epochDay)} · {hairRemovalMethodName(session.method)} · {severityName(session.painRating)}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.hair_removal_empty_title()} text={m.hair_removal_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.hair_removal_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.hair_removal_edit_sheet() : m.hair_removal_new_sheet()}
    onClose={() => (editor = null)}
  >
    {#if editor}
      <h3>{editor.id ? m.hair_removal_edit_sheet() : m.hair_removal_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="hair-removal-date">{m.hair_removal_date_label()}</label>
        <input class="input" type="date" id="hair-removal-date" name="hair-removal-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <label class="field-label" for="hair-removal-area">{m.hair_removal_area_label()}</label>
        <select class="input" id="hair-removal-area" bind:value={editor.area}>
          {#each HAIR_REMOVAL_AREAS as area (area)}
            <option value={area}>{hairRemovalAreaName(area)}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <span class="field-label">{m.hair_removal_method_label()}</span>
        <Segmented
          name={m.hair_removal_method_label()}
          options={HAIR_REMOVAL_METHODS.map((method) => ({ value: method, label: hairRemovalMethodName(method) }))}
          value={editor.method}
          onChange={(v) => (editor!.method = v as HairRemovalMethod)}
        />
      </div>
      <div class="field">
        <span class="field-label">{m.hair_removal_pain_label()}</span>
        <Segmented
          name={m.hair_removal_pain_label()}
          options={PAIN_RATINGS.map((v) => ({ value: String(v), label: severityName(v) }))}
          value={editor.painRating}
          onChange={(v) => (editor!.painRating = v)}
        />
      </div>
      <div class="field">
        <label class="field-label" for="hair-removal-cost">{m.hair_removal_cost_label()}</label>
        <input
          class="input"
          id="hair-removal-cost"
          name="hair-removal-cost"
          placeholder={m.hair_removal_cost_placeholder()}
          bind:value={editor.cost}
        />
      </div>
      <div class="field">
        <label class="field-label" for="hair-removal-provider">{m.hair_removal_provider_label()}</label>
        <input
          class="input"
          id="hair-removal-provider"
          name="hair-removal-provider"
          placeholder={m.hair_removal_provider_placeholder()}
          bind:value={editor.provider}
        />
      </div>

      <SectionTitle text={m.hair_removal_photo_section_title()} />
      {#if !editor.id}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.hair_removal_photo_hint()}</p>
      {:else}
        <div class="photo-row" style="margin-bottom:var(--space-3)">
          <button class="photo-add" aria-label={m.add_photo()} onclick={pickSessionPhoto}>
            <Icon name="image" size={20} /><span>{m.add_photo()}</span>
          </button>
          <button class="photo-add" aria-label={m.add_photo_camera()} onclick={captureSessionPhoto}>
            <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
          </button>
        </div>

        {#if photosQuery.loading}
          <Skeleton variant="line" count={1} />
        {:else if photos.length}
          <div class="list-group" style="margin-bottom:var(--space-3)">
            {#each photos as p (p.id)}
              <div class="list-row" data-hair-removal-photo={p.id}>
                <PhotoThumb photo={p} size={48} />
                <button class="icon-btn" aria-label={m.hair_removal_photo_delete_sheet()} onclick={() => (photoDeleteTarget = p)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <EmptyState title={m.hair_removal_photo_empty_title()} text={m.hair_removal_photo_empty_body()} />
        {/if}
      {/if}

      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-removal-session onclick={saveSession}><span>{m.hair_removal_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-hair-removal-session onclick={askToDelete}><span>{m.hair_removal_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.hair_removal_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.hair_removal_delete_q({ area: hairRemovalAreaName(deleteTarget.area) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_removal_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-hair-removal-session onclick={deleteSession}><span>{m.hair_removal_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={photoDeleteTarget !== null} title={m.hair_removal_photo_delete_sheet()} onClose={() => (photoDeleteTarget = null)}>
    {#if photoDeleteTarget}
      <h3>{m.hair_removal_photo_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_removal_photo_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-hair-removal-photo onclick={deletePhoto}><span>{m.hair_removal_photo_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (photoDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <PhotoAlignmentReview
    photo={reviewingPhoto}
    reference={reviewReference}
    onAccept={useReviewedPhoto}
    onRetake={captureSessionPhoto}
    onCancel={() => (reviewingPhoto = null)}
  />
</div>
