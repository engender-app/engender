<script lang="ts">
  /* Procedures, dates and your own recovery log, on the surface kit (phase
     5 UX ticket 25).

     Five areas below the procedure list, each of which was a SectionTitle
     over a `.list-group` and one of them over a `.card` holding a single
     line - so the recovery log read as five settings groups rather than as
     one procedure's record. Same conversion throughout: the kit's heading
     over the kit's list card, and the one card that held a line and a
     button is a notice, which is the surface for exactly that.

     The checklist here is appointment prep's checklist and gets the same
     treatment: three controls on the row, and the carried-forward badge
     dropped because the flag's own pressed state was already saying it. */
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
  import { journal, liveList } from '$lib/data/live/journal.svelte';
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
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
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

  /* The procedures, and the record kept against whichever one is open. */
  const SECTION_ROLE = { procedures: 0, recovery: 1 };

  const today = todayEpochDay();

  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedures = $derived(proceduresQuery.rows);

  let selectedId = $state<string | null>(null);
  /* Read off the live list rather than held as its own copy, so an edit or a
     delete elsewhere on this screen cannot leave a stale procedure open. */
  let selected = $derived(procedures.find((p) => p.id === selectedId) ?? null);

  let photosQuery = liveList((j) =>
    selectedId ? j.procedures.getPhotos(selectedId) : Promise.resolve([])
  );
  let photos = $derived(photosQuery.rows);

  let checklistQuery = liveList((j) =>
    selectedId ? j.procedures.getChecklist(selectedId).then((c) => c?.items) : Promise.resolve([])
  );
  let checklistItems = $derived(checklistQuery.rows);

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

  const record = recordEditor<Procedure, { id?: string; name: string; date: string }>({
    blank: () => ({ name: '', date: '' }),
    fromRecord: (procedure) => ({
      id: procedure.id,
      name: procedure.name,
      date: procedure.surgeryEpochDay === null ? '' : dateInputValueFromEpochDay(procedure.surgeryEpochDay)
    }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name) return false;
      const id = await journal.procedures.upsertProcedure({
        id: draft.id,
        name,
        // An empty date field clears the date rather than defaulting to today:
        // a procedure without one yet is an ordinary state here.
        surgeryEpochDay: epochDayFromDateInputValue(draft.date) ?? null
      });
      selectedId = id;
      /* Falls back to empty rather than to the draft in hand: the live list has
         not re-run yet, so a procedure just created is not in it - and empty is
         exactly what its notes are. Keeping the draft would open the new
         record showing the previously selected one's notes, and Save notes
         would then write them onto it. */
      notesDraft = procedures.find((p) => p.id === id)?.notes ?? '';
    },
    async remove(id) {
      if (selectedId === id) selectedId = null;
      await journal.procedures.deleteProcedure(id);
    },
    findById: (id) => procedures.find((p) => p.id === id)
  });
  let editor = $derived(record.editor);
  let deleteTarget = $derived(record.deleteTarget);
  let consultSheet = $state(false);
  let consultDate = $state('');
  let notesDraft = $state('');
  let photoSheet = $state(false);
  let photoDate = $state('');
  const photoRecord = recordEditor<ProcedurePhoto>({
    remove: (id) => journal.procedures.deletePhoto(id),
    findById: (id) => photos.find((p) => p.id === id)
  });
  let photoDeleteTarget = $derived(photoRecord.deleteTarget);
  let itemSheet = $state(false);
  let itemText = $state('');
  const itemRecord = recordEditor<ChecklistItem>({
    remove: (id) => journal.checklists.deleteItem(id),
    findById: (id) => checklistItems.find((i) => i.id === id)
  });
  let itemDeleteTarget = $derived(itemRecord.deleteTarget);

  function select(procedure: Procedure) {
    selectedId = selectedId === procedure.id ? null : procedure.id;
    notesDraft = selectedId ? procedure.notes : '';
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

</script>

<div class="screen">
  <ScreenHeader title={m.surgery_journey_title()} back="/more" subtitle={m.surgery_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.surgery_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={proceduresQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.procedures)}>
          {#each procedures as procedure (procedure.id)}
            <div class="kit-row is-split" data-procedure={procedure.id}>
              <button
                class="kit-row-main"
                aria-expanded={selectedId === procedure.id}
                aria-label={m.surgery_row_aria({ name: procedure.name })}
                onclick={() => select(procedure)}
              >
                <span class="kit-row-ico"><Icon name="flag" size={22} /></span>
                <span class="kit-row-text">
                  <span class="kit-row-title">{procedure.name}</span>
                  <span class="kit-row-sub">
                    {procedure.surgeryEpochDay === null ? m.surgery_date_none() : dayLabel(procedure.surgeryEpochDay)} · {recoveryText(procedure)}
                  </span>
                </span>
              </button>
              <button
                class="kit-row-act press"
                data-edit-procedure={procedure.id}
                aria-label={m.surgery_edit_sheet()}
                onclick={() => record.openEditor(procedure)}
              >
                <Icon name="pencil" size={18} />
              </button>
            </div>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="flag"
          key="surgery-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.procedures)}
          title={m.surgery_empty_title()}
          text={m.surgery_empty_body()}
          action={{ label: m.surgery_add(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  {#if selected}
    <div class="recovery" data-recovery-log={selected.id}>
      <SectionHeading text={m.surgery_date_label()} />
      <!-- With no date the notice said "No surgery date yet" and offered
           nothing to do about it, so the one thing a person on this panel
           wants was two taps away through the procedure's own editor
           (Alicja, 2026-08-26). Same editor, opened from where the sentence
           is. -->
      <Notice
        icon="clock"
        key="surgery-recovery"
        role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
        title={recoveryText(selected)}
        action={selected.surgeryEpochDay === null
          ? { label: m.surgery_set_date(), onclick: () => record.openEditor(selected) }
          : { label: m.surgery_milestone_add(), onclick: () => addAsMilestone(selected) }}
        data-add-as-milestone-notice
      />

      <SectionHeading text={m.surgery_consults_title()} />
      {#if selected.consults.length}
        <div style="margin-bottom:var(--space-3)">
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
            {#each selected.consults as consult (consult.id)}
              <ListRow
                static
                data-consult={consult.id}
                title={dayLabel(consult.epochDay)}
                action={{
                  icon: 'trash',
                  label: m.surgery_consult_delete_aria({ date: dayLabel(consult.epochDay) }),
                  onclick: () => journal.procedures.deleteConsult(consult.id),
                  attrs: { 'data-delete-consult': consult.id }
                }}
              />
            {/each}
          </ListCard>
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_consults_empty()}</p>
      {/if}
      <button class="btn btn-soft press" data-add-consult style="margin-bottom:var(--space-4)" onclick={openConsultSheet}>
        <span>{m.surgery_consult_add()}</span>
      </button>

      <SectionHeading text={m.surgery_notes_title()} />
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
      <button class="btn btn-soft press" data-save-notes style="margin-bottom:var(--space-4)" onclick={saveNotes}>
        <span>{m.surgery_notes_save()}</span>
      </button>

      <SectionHeading text={m.surgery_photos_title()} />
      <ReadGate read={photosQuery} variant="line" count={1}>
        {#snippet rows()}
          <div style="margin-bottom:var(--space-3)">
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
              {#each photos as photo (photo.id)}
                <ListRow
                  static
                  data-procedure-photo={photo.id}
                  subtitle={dayLabel(photo.epochDay)}
                  action={{
                    icon: 'trash',
                    label: m.surgery_photo_delete_aria({ date: dayLabel(photo.epochDay) }),
                    onclick: () => photoRecord.askToDelete(photo),
                    attrs: { 'data-delete-procedure-photo': photo.id }
                  }}
                >
                  {#snippet leading()}<PhotoThumb photo={photo} size={48} />{/snippet}
                </ListRow>
              {/each}
            </ListCard>
          </div>
        {/snippet}
        {#snippet empty()}
          <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_photos_empty()}</p>
        {/snippet}
      </ReadGate>
      <button class="btn btn-soft press" data-add-procedure-photo style="margin-bottom:var(--space-4)" onclick={openPhotoSheet}>
        <span>{m.add_photo()}</span>
      </button>

      <SectionHeading text={m.surgery_checklist_title()} />
      {#if checklistItems.length}
        <div style="margin-bottom:var(--space-3)">
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
          {#each checklistItems as item (item.id)}
            <div class="kit-row is-split" data-procedure-item={item.id}>
              <button
                class="kit-row-main"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={item.checked ? m.surgery_checklist_uncheck_aria({ content: item.content }) : m.surgery_checklist_check_aria({ content: item.content })}
                onclick={() => journal.checklists.setItemChecked(item.id, !item.checked)}
              >
                <span class="sj-box" class:sj-ticked={item.checked}>
                  {#if item.checked}<Icon name="check" size={20} />{/if}
                </span>
                <span class="kit-row-text">
                  <span class="kit-row-title" class:sj-done={item.checked}>{item.content}</span>
                </span>
              </button>
                <button
                  class="kit-row-act press"
                  class:sj-flagged={item.carriedForward}
                  data-carry-forward={item.id}
                  aria-pressed={item.carriedForward}
                  aria-label={item.carriedForward ? m.surgery_checklist_uncarry_aria({ content: item.content }) : m.surgery_checklist_carry_aria({ content: item.content })}
                  onclick={() => journal.checklists.setItemCarriedForward(item.id, !item.carriedForward)}
                >
                  <Icon name="flag" size={18} />
                </button>
                <button
                  class="kit-row-act press"
                  data-delete-procedure-item={item.id}
                  aria-label={m.surgery_checklist_delete_aria({ content: item.content })}
                  onclick={() => itemRecord.askToDelete(item)}
                >
                  <Icon name="trash" size={18} />
                </button>
            </div>
          {/each}
          </ListCard>
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_checklist_empty()}</p>
      {/if}
      <button class="btn btn-soft press" data-add-procedure-item aria-label={m.surgery_checklist_add_aria()} onclick={openItemSheet}>
        <span>{m.surgery_checklist_add()}</span>
      </button>
    </div>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.surgery_edit_sheet() : m.surgery_new_sheet()}
    onClose={() => (record.editor = null)}
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
        <button class="btn btn-primary" data-save-procedure onclick={record.save}><span>{m.surgery_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-procedure onclick={() => record.askToDelete()}><span>{m.surgery_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <ConfirmDeleteSheet
    open={deleteTarget !== null}
    title={m.surgery_delete_sheet()}
    question={deleteTarget ? m.surgery_delete_q({ name: deleteTarget.name }) : ''}
    hint={m.surgery_delete_hint()}
    confirmLabel={m.surgery_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-procedure': '' }}
    onConfirm={record.confirmDelete}
    onCancel={record.cancelDelete}
  />

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

  <ConfirmDeleteSheet
    open={photoDeleteTarget !== null}
    title={m.surgery_photo_delete_sheet()}
    question={photoDeleteTarget ? m.surgery_photo_delete_q() : ''}
    hint={m.surgery_photo_delete_hint()}
    confirmLabel={m.surgery_photo_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-procedure-photo': '' }}
    onConfirm={photoRecord.confirmDelete}
    onCancel={photoRecord.cancelDelete}
  />

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

  <ConfirmDeleteSheet
    open={itemDeleteTarget !== null}
    title={m.surgery_checklist_delete_sheet()}
    question={itemDeleteTarget ? m.surgery_checklist_delete_q() : ''}
    hint={itemDeleteTarget ? itemDeleteTarget.content : null}
    confirmLabel={m.surgery_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-procedure-item': '' }}
    onConfirm={itemRecord.confirmDelete}
    onCancel={itemRecord.cancelDelete}
  />

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

  /* The checkbox square and the struck-through-when-done rule are the
     appointment prep list's, where a ticked item is marked handled rather
     than hidden. What made the row tappable is the kit's split row now. */
  .sj-box {
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
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  .sj-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .sj-flagged {
    color: var(--role-mark);
  }
</style>
