<script lang="ts">
  /* Electrolysis and laser sessions, on the surface kit (phase 5 UX
     ticket 25). Two lists on the screen and a third inside the editor,
     all of them `.list-group` before this; the recency figures and the
     session photos state something and go nowhere, so they are static
     rows, and the sessions themselves open the editor. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { hairRemovalAreaName, hairRemovalMethodName, severityName } from '$lib/data/vocabulary/labels';
  import { daysSinceLastSession } from '$lib/data/hairRemovalSchedule';
  import { HAIR_REMOVAL_AREAS } from '$lib/data/hairRemovalAreas';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairRemovalSession, HairRemovalMethod } from '$lib/data/types';
  import { HAIR_REMOVAL_METHODS } from '$lib/data/types';
  import type { HairRemovalPhoto } from '$lib/data/journal/hairRemoval';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { pickPhotos } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two areas: how long since each area was last worked on, and the
     sessions themselves. */
  const SECTION_ROLE = { recency: 0, sessions: 1 };

  const PAIN_RATINGS = [1, 2, 3, 4, 5];

  const today = todayEpochDay();

  let sessionsQuery = liveList((j) => j.hairRemoval.getSessions());
  let sessions = $derived(sessionsQuery.rows);

  let recency = $derived(daysSinceLastSession(sessions, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  const record = recordEditor<
    HairRemovalSession,
    { id?: string; date: string; area: string; method: HairRemovalMethod; painRating: string; cost: string; provider: string }
  >({
    blank: () => ({ date: dateInputValueFromEpochDay(today), area: HAIR_REMOVAL_AREAS[0], method: 'laser', painRating: '3', cost: '', provider: '' }),
    fromRecord: (session) => ({
      id: session.id,
      date: dateInputValueFromEpochDay(session.epochDay),
      area: session.area,
      method: session.method,
      painRating: String(session.painRating),
      cost: session.cost,
      provider: session.provider
    }),
    async upsert(draft) {
      await journal.hairRemoval.upsertSession({
        id: draft.id,
        epochDay: epochDayFromDateInputValue(draft.date) ?? today,
        area: draft.area,
        method: draft.method,
        painRating: Number(draft.painRating),
        cost: draft.cost,
        provider: draft.provider
      });
    },
    remove: (id) => journal.hairRemoval.deleteSession(id),
    findById: (id) => sessions.find((session) => session.id === id)
  });
  let editor = $derived(record.editor);
  let deleteTarget = $derived(record.deleteTarget);

  /* Only once a session has its own id: a photo belongs to one session
     (hairRemoval.ts's own foreign key), so there is nothing to attach it to
     before that first save. */
  let photosQuery = liveList((j) => (editor?.id ? j.hairRemoval.getPhotos(editor.id) : Promise.resolve([])));
  let photos = $derived(photosQuery.rows);

  async function storePhoto(photo: NormalizedPhoto | null) {
    if (!editor?.id || !photo) return;
    await journal.hairRemoval.addPhoto(editor.id, photo);
  }

  async function pickSessionPhoto() {
    const [photo] = await pickPhotos(1);
    await storePhoto(photo ?? null);
  }

  // The context is this session: its own last photo, already loaded above.
  const sessionPhotoReview = photoReview(
    () => (photos.length ? { fileName: photos[photos.length - 1].fileName } : null),
    storePhoto
  );

  const photoRecord = recordEditor<HairRemovalPhoto>({
    remove: (id) => journal.hairRemoval.deletePhoto(id),
    findById: (id) => photos.find((p) => p.id === id)
  });
  let photoDeleteTarget = $derived(photoRecord.deleteTarget);
</script>

<div class="screen">
  <ScreenHeader title={m.hair_removal()} back="/more" subtitle={m.hair_removal_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.hair_removal_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={sessionsQuery} variant="line" count={3}>
    {#snippet rows(sessions)}
      <div class="screen-part">
        <SectionHeading text={m.hair_removal_recency_title()} />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recency)}>
          {#each HAIR_REMOVAL_AREAS as area (area)}
            {@const days = recency[area]}
            <ListRow
              static
              data-recency={area}
              title={hairRemovalAreaName(area)}
              subtitle={days === null
                ? m.hair_removal_area_never_used()
                : m.hair_removal_area_days_ago({ days: m.n_days({ n: days }) })}
            />
          {/each}
        </ListCard>

        <SectionHeading text={m.hair_removal()} />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          {#each [...sessions].reverse() as session (session.id)}
            <ListRow
              key={session.id}
              data-hair-removal-session={session.id}
              icon="shuffle"
              title={hairRemovalAreaName(session.area)}
              subtitle={`${dayLabel(session.epochDay)} · ${hairRemovalMethodName(session.method)} · ${severityName(session.painRating)}`}
              chevron={false}
              onclick={() => record.openEditor(session)}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="shuffle"
          key="hair-removal-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.hair_removal_empty_title()}
          text={m.hair_removal_empty_body()}
          action={{ label: m.hair_removal_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.hair_removal_edit_sheet() : m.hair_removal_new_sheet()}
    onClose={() => (record.editor = null)}
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

      <SectionHeading text={m.hair_removal_photo_section_title()} />
      {#if !editor.id}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.hair_removal_photo_hint()}</p>
      {:else}
        <div class="photo-row" style="margin-bottom:var(--space-3)">
          <button class="photo-add" aria-label={m.add_photo()} onclick={pickSessionPhoto}>
            <Icon name="image" size={20} /><span>{m.add_photo()}</span>
          </button>
          <button class="photo-add" aria-label={m.add_photo_camera()} onclick={sessionPhotoReview.capture}>
            <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
          </button>
        </div>

        <ReadGate read={photosQuery} variant="line" count={1}>
          {#snippet rows(photos)}
            <div style="margin-bottom:var(--space-3)">
              <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
                {#each photos as p (p.id)}
                  <ListRow
                    static
                    data-hair-removal-photo={p.id}
                    action={{
                      icon: 'trash',
                      label: m.hair_removal_photo_delete_sheet(),
                      onclick: () => photoRecord.askToDelete(p),
                      attrs: { 'data-delete-hair-removal-photo': p.id }
                    }}
                  >
                    {#snippet leading()}<PhotoThumb photo={p} size={48} />{/snippet}
                  </ListRow>
                {/each}
              </ListCard>
            </div>
          {/snippet}
          {#snippet empty()}
            <Notice
              icon="camera"
              key="hair-removal-photos-empty"
              title={m.hair_removal_photo_empty_title()}
              text={m.hair_removal_photo_empty_body()}
            />
          {/snippet}
        </ReadGate>
      {/if}

      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-removal-session onclick={record.save}><span>{m.hair_removal_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-hair-removal-session onclick={() => record.askToDelete()}><span>{m.hair_removal_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <ConfirmDeleteSheet
    open={deleteTarget !== null}
    title={m.hair_removal_delete_sheet()}
    question={deleteTarget ? m.hair_removal_delete_q({ area: hairRemovalAreaName(deleteTarget.area) }) : ''}
    hint={m.hair_removal_delete_hint()}
    confirmLabel={m.hair_removal_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-hair-removal-session': '' }}
    onConfirm={record.confirmDelete}
    onCancel={record.cancelDelete}
  />

  <ConfirmDeleteSheet
    open={photoDeleteTarget !== null}
    title={m.hair_removal_photo_delete_sheet()}
    question={photoDeleteTarget ? m.hair_removal_photo_delete_q() : ''}
    hint={m.hair_removal_photo_delete_hint()}
    confirmLabel={m.hair_removal_photo_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-hair-removal-photo': '' }}
    onConfirm={photoRecord.confirmDelete}
    onCancel={photoRecord.cancelDelete}
  />

  <PhotoAlignmentReview
    photo={sessionPhotoReview.photo}
    reference={sessionPhotoReview.reference}
    onAccept={sessionPhotoReview.accept}
    onRetake={sessionPhotoReview.capture}
    onCancel={sessionPhotoReview.cancel}
  />
</div>
