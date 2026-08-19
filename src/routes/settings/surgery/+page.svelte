<script lang="ts">
  /* The surgery journey module (phase 5 ticket 07, CONTEXT: "Procedure").
     One screen for every procedure someone is tracking, with the selected
     one's recovery log opened below the list rather than on a route of its
     own: a procedure is not addressable from anywhere else in the app, so a
     [id] route would buy nothing and cost the stale-params trap a dynamic
     route brings.

     Nothing on this screen supplies content. There is no aftercare advice,
     no recovery target, and no reading of the day counter as ahead of or
     behind anything - the checklist is whatever the person writes, and the
     app contributes the dates and the structure around it. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { recoveryDay } from '$lib/data/recoveryDay';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import type { ChecklistItem, Procedure, ProcedureConsult } from '$lib/data/types';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { pickPhotos } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const today = todayEpochDay();

  let proceduresQuery = liveQuery(['procedure'], (j) => j.procedures.getProcedures());
  let procedures = $derived(proceduresQuery.value ?? []);

  let selectedId = $state<string | null>(null);
  /* Read off the live list rather than held as its own copy, so an edit or a
     delete elsewhere on this screen cannot leave a stale procedure open. */
  let selected = $derived(procedures.find((p) => p.id === selectedId) ?? null);

  let photosQuery = liveQuery(['procedure'], (j) =>
    selectedId ? j.procedures.getPhotos(selectedId) : Promise.resolve([])
  );
  let photos = $derived(photosQuery.value ?? []);

  let checklistQuery = liveQuery(['checklist', 'procedure'], (j) =>
    selectedId ? j.procedures.getChecklist(selectedId) : Promise.resolve(undefined)
  );
  let checklistItems = $derived(checklistQuery.value?.items ?? []);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** The counter's own wording. The arithmetic is recoveryDay.ts's; which of
      its four cases a person reads is this screen's business, the same split
      milestoneStatus and its callers keep. */
  function recoveryText(procedure: Procedure): string {
    const day = recoveryDay(procedure.surgeryEpochDay, today);
    if (day.type === 'unscheduled') return m.surgery_day_unscheduled();
    if (day.type === 'upcoming') return m.surgery_day_upcoming({ days: m.n_days({ n: day.days }) });
    if (day.type === 'surgeryDay') return m.surgery_day_of();
    return m.surgery_day_since({ days: m.n_days({ n: day.days }) });
  }

  let editor = $state<{ id?: string; name: string; date: string } | null>(null);
  let deleteTarget = $state<Procedure | null>(null);
  let consultSheet = $state(false);
  let consultDate = $state('');
  let notesDraft = $state('');
  let photoSheet = $state(false);
  let photoDate = $state('');
  let photoDeleteTarget = $state<ProcedurePhoto | null>(null);
  let itemSheet = $state(false);
  let itemText = $state('');
  let itemDeleteTarget = $state<ChecklistItem | null>(null);

  function openEditor(procedure: Procedure | null) {
    editor = procedure
      ? { id: procedure.id, name: procedure.name, date: procedure.surgeryEpochDay === null ? '' : dateInputValueFromEpochDay(procedure.surgeryEpochDay) }
      : { name: '', date: '' };
  }

  function select(procedure: Procedure) {
    selectedId = selectedId === procedure.id ? null : procedure.id;
    notesDraft = selectedId ? procedure.notes : '';
  }

  async function saveProcedure() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) return;
    const id = await journal.procedures.upsertProcedure({
      id: editor.id,
      name,
      // An empty date field clears the date rather than defaulting to today:
      // a procedure without one yet is an ordinary state here.
      surgeryEpochDay: epochDayFromDateInputValue(editor.date) ?? null
    });
    editor = null;
    selectedId = id;
    /* Falls back to empty rather than to the draft in hand: the live list has
       not re-run yet, so a procedure just created is not in it - and empty is
       exactly what its notes are. Keeping the draft would open the new
       record showing the previously selected one's notes, and Save notes
       would then write them onto it. */
    notesDraft = procedures.find((p) => p.id === id)?.notes ?? '';
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = procedures.find((p) => p.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteProcedure() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    if (selectedId === id) selectedId = null;
    await journal.procedures.deleteProcedure(id);
  }

  /* Offered, never automatic: a surgery date produces a milestone only on
     this tap, the same way a milestone template does (ticket 07's spec, and
     why milestone suggestions from data were dropped rather than built).
     Goes through the ordinary template machinery - `surgery` is already a
     MILESTONE_TEMPLATE_KEYS key - so what comes out is an ordinary
     milestone, editable and deletable like any other. */
  async function addAsMilestone(procedure: Procedure) {
    if (procedure.surgeryEpochDay === null) return;
    await journal.milestones.upsertMilestone({
      name: procedure.name,
      epochDay: procedure.surgeryEpochDay,
      templateKey: 'surgery'
    });
    toast(m.surgery_milestone_added());
  }

  function openConsultSheet() {
    consultDate = dateInputValueFromEpochDay(today);
    consultSheet = true;
  }

  async function addConsult() {
    const epochDay = epochDayFromDateInputValue(consultDate);
    if (!selectedId || epochDay === null) return;
    consultSheet = false;
    await journal.procedures.addConsult(selectedId, epochDay);
  }

  async function saveNotes() {
    if (!selectedId) return;
    await journal.procedures.setNotes(selectedId, notesDraft);
  }

  function openPhotoSheet() {
    photoDate = dateInputValueFromEpochDay(today);
    photoSheet = true;
  }

  async function storePhoto(photo: NormalizedPhoto | null) {
    const epochDay = epochDayFromDateInputValue(photoDate);
    if (!selectedId || !photo || epochDay === null) return;
    photoSheet = false;
    await journal.procedures.addPhoto(selectedId, epochDay, photo);
  }

  async function pickRecoveryPhoto() {
    const [photo] = await pickPhotos(1);
    await storePhoto(photo ?? null);
  }

  // The context is this procedure's recovery log: its own last photo,
  // already loaded above.
  const recoveryPhotoReview = photoReview(
    () => (photos.length ? { fileName: photos[photos.length - 1].fileName } : null),
    storePhoto
  );

  async function deletePhoto() {
    if (!photoDeleteTarget) return;
    const id = photoDeleteTarget.id;
    photoDeleteTarget = null;
    await journal.procedures.deletePhoto(id);
  }

  function openItemSheet() {
    itemText = '';
    itemSheet = true;
  }

  async function addItem() {
    const content = itemText.trim();
    if (!selectedId || !content) return;
    itemSheet = false;
    await journal.procedures.addChecklistItem(selectedId, content);
  }

  async function confirmDeleteItem() {
    if (!itemDeleteTarget) return;
    const id = itemDeleteTarget.id;
    itemDeleteTarget = null;
    await journal.checklists.deleteItem(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.surgery_journey_title()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.surgery_add()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if proceduresQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if procedures.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_intro()}</p>

    <div class="list-group">
      {#each procedures as procedure (procedure.id)}
        <div class="list-row" style="cursor:default" data-procedure={procedure.id}>
          <button
            class="procedure-open"
            aria-expanded={selectedId === procedure.id}
            aria-label={m.surgery_row_aria({ name: procedure.name })}
            onclick={() => select(procedure)}
          >
            <span class="row-text">
              <span class="row-title">{procedure.name}</span>
              <span class="row-subtitle">
                {procedure.surgeryEpochDay === null ? m.surgery_date_none() : dayLabel(procedure.surgeryEpochDay)} · {recoveryText(procedure)}
              </span>
            </span>
          </button>
          <button class="icon-btn" data-edit-procedure={procedure.id} aria-label={m.surgery_edit_sheet()} onclick={() => openEditor(procedure)}>
            <Icon name="pencil" size={18} />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.surgery_empty_title()} text={m.surgery_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.surgery_add()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  {#if selected}
    <div class="recovery" data-recovery-log={selected.id}>
      <SectionTitle text={m.surgery_date_label()} />
      <div class="card" style="margin-bottom:var(--space-4)">
        <p class="row-title" style="margin-bottom:var(--space-1)">{recoveryText(selected)}</p>
        {#if selected.surgeryEpochDay !== null}
          <button class="btn btn-soft" data-add-as-milestone onclick={() => addAsMilestone(selected)}>
            <span>{m.surgery_milestone_add()}</span>
          </button>
        {/if}
      </div>

      <SectionTitle text={m.surgery_consults_title()} />
      {#if selected.consults.length}
        <div class="list-group" style="margin-bottom:var(--space-3)">
          {#each selected.consults as consult (consult.id)}
            <div class="list-row" data-consult={consult.id}>
              <span class="row-text"><span class="row-title">{dayLabel(consult.epochDay)}</span></span>
              <button
                class="icon-btn"
                data-delete-consult={consult.id}
                aria-label={m.surgery_consult_delete_aria({ date: dayLabel(consult.epochDay) })}
                onclick={() => journal.procedures.deleteConsult(consult.id)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_consults_empty()}</p>
      {/if}
      <button class="btn btn-soft" data-add-consult style="margin-bottom:var(--space-4)" onclick={openConsultSheet}>
        <span>{m.surgery_consult_add()}</span>
      </button>

      <SectionTitle text={m.surgery_notes_title()} />
      <div class="field">
        <textarea
          class="input"
          id="surgery-notes"
          name="surgery-notes"
          rows="4"
          placeholder={m.surgery_notes_placeholder()}
          bind:value={notesDraft}
        ></textarea>
      </div>
      <button class="btn btn-soft" data-save-notes style="margin-bottom:var(--space-4)" onclick={saveNotes}>
        <span>{m.surgery_notes_save()}</span>
      </button>

      <SectionTitle text={m.surgery_photos_title()} />
      {#if photosQuery.loading}
        <Skeleton variant="line" count={1} />
      {:else if photos.length}
        <div class="list-group" style="margin-bottom:var(--space-3)">
          {#each photos as photo (photo.id)}
            <div class="list-row" data-procedure-photo={photo.id}>
              <PhotoThumb photo={photo} size={48} />
              <span class="row-text"><span class="row-subtitle">{dayLabel(photo.epochDay)}</span></span>
              <button
                class="icon-btn"
                data-delete-procedure-photo={photo.id}
                aria-label={m.surgery_photo_delete_aria({ date: dayLabel(photo.epochDay) })}
                onclick={() => (photoDeleteTarget = photo)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_photos_empty()}</p>
      {/if}
      <button class="btn btn-soft" data-add-procedure-photo style="margin-bottom:var(--space-4)" onclick={openPhotoSheet}>
        <span>{m.add_photo()}</span>
      </button>

      <SectionTitle text={m.surgery_checklist_title()} />
      {#if checklistItems.length}
        <div class="list-group" style="margin-bottom:var(--space-3)">
          {#each checklistItems as item (item.id)}
            <div class="list-row" style="cursor:default" data-procedure-item={item.id}>
              <button
                class="item-toggle"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={item.checked ? m.surgery_checklist_uncheck_aria({ content: item.content }) : m.surgery_checklist_check_aria({ content: item.content })}
                onclick={() => journal.checklists.setItemChecked(item.id, !item.checked)}
              >
                <span class="row-icon" class:sj-ticked={item.checked}>
                  {#if item.checked}<Icon name="check" size={20} />{/if}
                </span>
                <span class="row-text">
                  <span class="row-title" class:sj-done={item.checked}>{item.content}</span>
                  {#if item.carriedForward}<span class="row-subtitle">{m.surgery_checklist_carried_badge()}</span>{/if}
                </span>
              </button>
              <span class="row-trailing">
                <button
                  class="icon-btn"
                  class:sj-flagged={item.carriedForward}
                  data-carry-forward={item.id}
                  aria-pressed={item.carriedForward}
                  aria-label={item.carriedForward ? m.surgery_checklist_uncarry_aria({ content: item.content }) : m.surgery_checklist_carry_aria({ content: item.content })}
                  onclick={() => journal.checklists.setItemCarriedForward(item.id, !item.carriedForward)}
                >
                  <Icon name="flag" size={18} />
                </button>
                <button
                  class="icon-btn"
                  data-delete-procedure-item={item.id}
                  aria-label={m.surgery_checklist_delete_aria({ content: item.content })}
                  onclick={() => (itemDeleteTarget = item)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_checklist_empty()}</p>
      {/if}
      <button class="btn btn-soft" data-add-procedure-item aria-label={m.surgery_checklist_add_aria()} onclick={openItemSheet}>
        <span>{m.surgery_checklist_add()}</span>
      </button>
    </div>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.surgery_edit_sheet() : m.surgery_new_sheet()}
    onClose={() => (editor = null)}
  >
    {#if editor}
      <h3>{editor.id ? m.surgery_edit_sheet() : m.surgery_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="surgery-name">{m.surgery_name_label()}</label>
        <input
          class="input"
          id="surgery-name"
          name="surgery-name"
          placeholder={m.surgery_name_placeholder()}
          bind:value={editor.name}
        />
      </div>
      <div class="field">
        <label class="field-label" for="surgery-date">{m.surgery_date_label()}</label>
        <input class="input" type="date" id="surgery-date" name="surgery-date" bind:value={editor.date} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-procedure onclick={saveProcedure}><span>{m.surgery_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-procedure onclick={askToDelete}><span>{m.surgery_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.surgery_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.surgery_delete_q({ name: deleteTarget.name })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.surgery_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-procedure onclick={deleteProcedure}><span>{m.surgery_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={consultSheet} title={m.surgery_consult_sheet()} onClose={() => (consultSheet = false)}>
    <h3>{m.surgery_consult_sheet()}</h3>
    <div class="field">
      <label class="field-label" for="surgery-consult-date">{m.surgery_consult_date_label()}</label>
      <input class="input" type="date" id="surgery-consult-date" name="surgery-consult-date" bind:value={consultDate} />
    </div>
    <button class="btn btn-primary" data-save-consult onclick={addConsult}><span>{m.surgery_consult_add()}</span></button>
  </Sheet>

  <Sheet open={photoSheet} title={m.surgery_photos_title()} onClose={() => (photoSheet = false)}>
    <h3>{m.surgery_photos_title()}</h3>
    <div class="field">
      <label class="field-label" for="surgery-photo-date">{m.surgery_photo_date_label()}</label>
      <input class="input" type="date" id="surgery-photo-date" name="surgery-photo-date" bind:value={photoDate} />
    </div>
    <div class="stack-3">
      <button class="btn btn-soft" data-pick-procedure-photo onclick={pickRecoveryPhoto}>
        <span>{m.surgery_photo_pick()}</span>
      </button>
      <button class="btn btn-soft" data-capture-procedure-photo onclick={recoveryPhotoReview.capture}>
        <span>{m.surgery_photo_capture()}</span>
      </button>
    </div>
  </Sheet>

  <Sheet open={photoDeleteTarget !== null} title={m.surgery_photo_delete_sheet()} onClose={() => (photoDeleteTarget = null)}>
    {#if photoDeleteTarget}
      <h3>{m.surgery_photo_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.surgery_photo_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-procedure-photo onclick={deletePhoto}><span>{m.surgery_photo_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (photoDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={itemSheet} title={m.surgery_checklist_sheet()} onClose={() => (itemSheet = false)}>
    <h3>{m.surgery_checklist_sheet()}</h3>
    <div class="field">
      <input
        class="input"
        id="surgery-item"
        name="surgery-item"
        placeholder={m.surgery_checklist_placeholder()}
        bind:value={itemText}
      />
    </div>
    <button class="btn btn-primary" data-save-procedure-item onclick={addItem}><span>{m.surgery_checklist_add()}</span></button>
  </Sheet>

  <Sheet open={itemDeleteTarget !== null} title={m.surgery_checklist_delete_sheet()} onClose={() => (itemDeleteTarget = null)}>
    {#if itemDeleteTarget}
      <h3>{m.surgery_checklist_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{itemDeleteTarget.content}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-procedure-item onclick={confirmDeleteItem}><span>{m.surgery_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (itemDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <PhotoAlignmentReview
    photo={recoveryPhotoReview.photo}
    reference={recoveryPhotoReview.reference}
    onAccept={recoveryPhotoReview.accept}
    onRetake={recoveryPhotoReview.capture}
    onCancel={recoveryPhotoReview.cancel}
  />
</div>

<style>
  .recovery {
    margin-top: var(--space-4);
  }

  /* Both are a whole row made tappable: one opens a procedure's recovery
     log, the other ticks a checklist item. The checkbox square and the
     struck-through-when-done rule below are the appointment prep list's,
     where a ticked item is marked handled rather than hidden. */
  .procedure-open,
  .item-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .row-icon {
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .sj-ticked {
    border-color: var(--accent);
    color: var(--accent);
  }

  .sj-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .sj-flagged {
    color: var(--accent);
  }
</style>
