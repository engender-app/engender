<script lang="ts">
  /* Procedures, dates and your own recovery log, on the surface kit (phase
     5 UX ticket 25 and phase 5 deepening ticket 12).
     Rebuilt into a comprehensive 4-phase Procedure Care & Recovery Hub:
     1. Planning Phase (no date set): Consult questions, preparation checklist, insurance tasks.
     2. Pre-Op Phase (date set, before surgery day): Live day countdown, packing list, clearance tasks.
     3. Surgery Day: On surgery day, prompts user to record surgery day as transition milestone upon explicit confirmation (ADR-0045).
     4. Recovery Phase (1..90 days post-op): Post-op recovery day badge (Post-Op Day X), recovery feelings diary, wound healing progression photo album.
     5. Archived Phase (>90 days post-op): Permanent surgical history record. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { SURGERY_RECOVERY_CUTOFF_DAYS, procedurePhase, recoveryDay, type ProcedurePhase } from '$lib/data/recoveryDay';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import type { ChecklistItem, Procedure, ProcedureConsult } from '$lib/data/types';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ProcedureRecoveryCard from '$lib/components/ProcedureRecoveryCard.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { compareStretchLink } from '$lib/components/kit/compareStretchLink.svelte';
  import { compareStretchNoticeProps } from '$lib/data/compareStretch';

  /* The procedures, and the record kept against whichever one is open. */
  const SECTION_ROLE = { procedures: 0, recovery: 1 };

  const today = todayEpochDay();

  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedures = $derived(proceduresQuery.rows);

  let selectedId = $state<string | null>(null);
  /* Read off the live list rather than held as its own copy, so an edit or a
     delete elsewhere on this screen cannot leave a stale procedure open. */
  let selected = $derived(procedures.find((p) => p.id === selectedId) ?? null);

  let selectedPhase = $derived<ProcedurePhase | null>(
    selected ? procedurePhase(selected.surgeryEpochDay, today) : null
  );

  let selectedRecDay = $derived(
    selected ? recoveryDay(selected.surgeryEpochDay, today) : null
  );

  /* Ticket 18: the recovery window as one side of `/compare` - only once
     there is a surgery date to measure from (planning and pre-op have no
     days yet). A one-day stretch on surgery day itself is still a real
     window, not a reason to hide the link - `compareStretchLink`'s own
     too-short/no-data states are exactly what a marginal window like that
     is for. Its end clamps to today while recovery is still active
     (surgery day and recovery) and holds at the 90-day cutoff once
     archived, so an old procedure's stretch stops growing (ADR-0010's
     "clamp at read time", the same rule an open-ended tryout or era
     follows). */
  let recoveryWindow = $derived(
    selected && selected.surgeryEpochDay !== null && selectedPhase !== 'planning' && selectedPhase !== 'pre_op'
      ? { start: selected.surgeryEpochDay, end: Math.min(today, selected.surgeryEpochDay + SURGERY_RECOVERY_CUTOFF_DAYS) }
      : null
  );
  let recoveryOpenEnded = $derived(selectedPhase === 'surgery_day' || selectedPhase === 'recovery');
  const compareLink = compareStretchLink(() => recoveryWindow);
  const SURGERY_COMPARE_COPY = {
    title: m.surgery_compare_title,
    openHint: m.surgery_compare_open_hint,
    tooShort: m.surgery_compare_too_short,
    noPrecedingData: m.surgery_compare_no_data,
    action: m.surgery_compare_action
  };

  let photosQuery = liveList((j) =>
    selectedId ? j.procedures.getPhotos(selectedId) : Promise.resolve([])
  );
  let photos = $derived(photosQuery.rows);

  let checklistQuery = liveList((j) =>
    selectedId ? j.procedures.getChecklist(selectedId).then((c) => c?.items) : Promise.resolve([])
  );
  let checklistItems = $derived(checklistQuery.rows);

  let milestoneQuery = liveList((j) =>
    selectedId ? j.procedures.getMilestone(selectedId).then((m) => (m ? [m] : [])) : Promise.resolve([])
  );
  let linkedMilestone = $derived(milestoneQuery.rows[0] ?? null);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

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
      notesDraft = procedures.find((p) => p.id === id)?.notes ?? '';
    },
    async remove(id) {
      if (selectedId === id) selectedId = null;
      await journal.procedures.deleteProcedure(id);
    },
    findById: (id) => procedures.find((p) => p.id === id)
  });

  let consultSheet = $state(false);
  let consultDate = $state('');
  let notesDraft = $state('');
  let photoSheet = $state(false);
  let photoDate = $state('');
  let milestoneConfirmSheet = $state(false);

  async function storePhoto(photo: NormalizedPhoto): Promise<void> {
    const epochDay = epochDayFromDateInputValue(photoDate);
    if (!selectedId || epochDay === null) return;
    photoSheet = false;
    await journal.procedures.addPhoto(selectedId, epochDay, photo);
  }

  const recoveryPhotos = photoSection<ProcedurePhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => journal.procedures.deletePhoto(id),
    reference: () => lastPhotoReference(photos)
  });

  let itemSheet = $state(false);
  let itemText = $state('');
  const itemRecord = recordEditor<ChecklistItem>({
    remove: (id) => journal.checklists.deleteItem(id),
    findById: (id) => checklistItems.find((i) => i.id === id)
  });

  function select(procedure: Procedure) {
    selectedId = selectedId === procedure.id ? null : procedure.id;
    notesDraft = selectedId ? procedure.notes : '';
  }

  function promptMilestoneConfirmation() {
    milestoneConfirmSheet = true;
  }

  async function confirmRecordMilestone() {
    if (!selectedId) return;
    milestoneConfirmSheet = false;
    await journal.procedures.recordSurgeryMilestone(selectedId);
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
            <ProcedureRecoveryCard
              {procedure}
              selected={selectedId === procedure.id}
              {today}
              linkedMilestone={selectedId === procedure.id ? linkedMilestone : null}
              photoCount={selectedId === procedure.id ? photos.length : 0}
              checklistCount={selectedId === procedure.id ? checklistItems.length : 0}
              onclick={() => select(procedure)}
              onedit={() => record.openEditor(procedure)}
            />
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

  {#if selected && selectedPhase}
    <div class="recovery" data-recovery-log={selected.id} data-phase={selectedPhase}>
      {#snippet checklistBlock(title: string, readonly = false)}
        <SectionHeading text={title} />
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
                    onclick={async () => await journal.checklists.setItemChecked(item.id, !item.checked)}
                  >
                    <span class="sj-box" class:sj-ticked={item.checked}>
                      {#if item.checked}<Icon name="check" size={20} />{/if}
                    </span>
                    <span class="kit-row-text">
                      <span class="kit-row-title" class:sj-done={item.checked}>{item.content}</span>
                    </span>
                  </button>
                  {#if !readonly}
                    <button
                      class="kit-row-act press"
                      class:sj-flagged={item.carriedForward}
                      data-carry-forward={item.id}
                      aria-pressed={item.carriedForward}
                      aria-label={item.carriedForward ? m.surgery_checklist_uncarry_aria({ content: item.content }) : m.surgery_checklist_carry_aria({ content: item.content })}
                      onclick={async () => await journal.checklists.setItemCarriedForward(item.id, !item.carriedForward)}
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
                  {/if}
                </div>
              {/each}
            </ListCard>
          </div>
        {:else if !readonly}
          <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_checklist_empty()}</p>
        {/if}
        {#if !readonly}
          <button class="btn btn-soft press" data-add-procedure-item aria-label={m.surgery_checklist_add_aria()} onclick={openItemSheet} style="margin-bottom:var(--space-4)">
            <span>{m.surgery_checklist_add()}</span>
          </button>
        {/if}
      {/snippet}

      {#snippet notesBlock(title: string, placeholder: string)}
        <SectionHeading text={title} />
        <Field label={title} id="surgery-notes" hidden>
          {#snippet children(id)}
            <textarea
              class="input"
              {id}
              name="surgery-notes"
              rows="4"
              {placeholder}
              bind:value={notesDraft}
            ></textarea>
          {/snippet}
        </Field>
        <button class="btn btn-soft press" data-save-notes style="margin-bottom:var(--space-4)" onclick={saveNotes}>
          <span>{m.surgery_notes_save()}</span>
        </button>
      {/snippet}

      {#snippet consultsBlock()}
        {#if selected!.consults.length}
          <div style="margin-bottom:var(--space-3)">
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
              {#each selected!.consults as consult (consult.id)}
                <ListRow
                  static
                  data-consult={consult.id}
                  title={dayLabel(consult.epochDay)}
                  action={{
                    icon: 'trash',
                    label: m.surgery_consult_delete_aria({ date: dayLabel(consult.epochDay) }),
                    onclick: async () => await journal.procedures.deleteConsult(consult.id),
                    attrs: { 'data-delete-consult': consult.id }
                  }}
                />
              {/each}
            </ListCard>
          </div>
        {:else}
          <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_consults_empty()}</p>
        {/if}
      {/snippet}

      <!-- Ticket 18: the recovery window as one side of `/compare`, offered
           only once there is one (surgery day onward - planning and pre-op
           have no stretch yet). -->
      {#snippet compareBlock()}
        {#if compareLink.state.status !== 'hidden'}
          {@const compareNotice = compareStretchNoticeProps(compareLink.state, recoveryOpenEnded, SURGERY_COMPARE_COPY)}
          <div style="margin-top:var(--space-4);margin-bottom:var(--space-4)">
            <Notice
              icon="shuffle"
              key="surgery-compare"
              role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
              title={compareNotice.title}
              text={compareNotice.text}
              action={compareNotice.action}
            />
          </div>
        {/if}
      {/snippet}

      <!-- Phase 1: Planning Phase (no date set) -->
      {#if selectedPhase === 'planning'}
        <SectionHeading text={m.surgery_phase_planning()} />
        <Notice
          icon="clipboard"
          key="surgery-planning"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={m.surgery_day_unscheduled()}
          text={m.surgery_planning_title()}
          action={{ label: m.surgery_set_date(), onclick: () => record.openEditor(selected) }}
          data-add-as-milestone-notice
        />

        <SectionHeading text={m.surgery_consults_title()} />
        {@render consultsBlock()}
        <button class="btn btn-soft press" data-add-consult style="margin-bottom:var(--space-4)" onclick={openConsultSheet}>
          <span>{m.surgery_consult_add()}</span>
        </button>

        {@render notesBlock(m.surgery_consult_questions_title(), m.surgery_notes_placeholder())}

        {@render checklistBlock(m.surgery_prep_checklist_title())}

      <!-- Phase 2: Pre-Op Phase (date set in future) -->
      {:else if selectedPhase === 'pre_op'}
        <SectionHeading text={m.surgery_phase_pre_op()} />
        <Notice
          icon="clock"
          key="surgery-preop"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={recoveryText(selected)}
          text={selected.surgeryEpochDay ? dayLabel(selected.surgeryEpochDay) : ''}
          action={{ label: m.surgery_edit_sheet(), onclick: () => record.openEditor(selected) }}
          data-add-as-milestone-notice
        />

        {@render checklistBlock(m.surgery_clearance_checklist_title())}

        <SectionHeading text={m.surgery_consults_title()} />
        {@render consultsBlock()}
        <button class="btn btn-soft press" data-add-consult style="margin-bottom:var(--space-4)" onclick={openConsultSheet}>
          <span>{m.surgery_consult_add()}</span>
        </button>

        {@render notesBlock(m.surgery_notes_title(), m.surgery_notes_placeholder())}

      <!-- Phase 3: Surgery Day Phase (surgery date is today) -->
      {:else if selectedPhase === 'surgery_day'}
        <SectionHeading text={m.surgery_phase_surgery_day()} />
        <Notice
          icon="flag"
          key="surgery-today"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={m.surgery_day_title()}
          text={dayLabel(today)}
          data-add-as-milestone-notice
        />

        {@render compareBlock()}

        {#if linkedMilestone}
          <div style="margin-bottom:var(--space-4)">
            <Notice
              icon="flag"
              key="surgery-milestone-linked"
              role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
              title={m.surgery_milestone_linked_badge()}
              text={m.surgery_milestone_recorded_notice({ name: linkedMilestone.name })}
            />
          </div>
        {:else}
          <div style="margin-bottom:var(--space-4)">
            <Notice
              icon="flag"
              key="surgery-milestone-prompt"
              role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
              title={m.surgery_milestone_prompt_title()}
              text={m.surgery_milestone_prompt_body()}
              action={{ label: m.surgery_milestone_prompt_action(), primary: true, onclick: promptMilestoneConfirmation }}
              data-record-milestone-prompt
            />
          </div>
        {/if}

        {@render checklistBlock(m.surgery_checklist_title())}

        {@render notesBlock(m.surgery_notes_title(), m.surgery_notes_placeholder())}

      <!-- Phase 4: Recovery Phase (1..90 days post-op) -->
      {:else if selectedPhase === 'recovery'}
        <SectionHeading text={m.surgery_phase_recovery()} />
        <Notice
          icon="heart"
          key="surgery-recovery"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={selectedRecDay?.type === 'since' ? m.surgery_post_op_day({ days: String(selectedRecDay.days) }) : recoveryText(selected)}
          text={selected.surgeryEpochDay ? dayLabel(selected.surgeryEpochDay) : ''}
          action={linkedMilestone
            ? undefined
            : { label: m.surgery_milestone_add(), onclick: promptMilestoneConfirmation }}
          data-add-as-milestone-notice
        />

        {@render compareBlock()}

        {@render notesBlock(m.surgery_feelings_title(), m.surgery_feelings_placeholder())}

        <SectionHeading text={m.surgery_wound_album_title()} />
        <PhotoSection
          section={recoveryPhotos}
          read={photosQuery}
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          handle="procedure-photo"
          subtitle={(photo) => dayLabel(photo.epochDay)}
          deleteLabel={(photo) => m.surgery_photo_delete_aria({ date: dayLabel(photo.epochDay) })}
          confirm={{
            title: m.surgery_photo_delete_sheet(),
            question: () => m.surgery_photo_delete_q(),
            hint: () => m.surgery_photo_delete_hint(),
            confirmLabel: m.surgery_photo_delete(),
            cancelLabel: m.keep_it()
          }}
        >
          {#snippet empty()}
            <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_wound_album_empty()}</p>
          {/snippet}
          {#snippet addControl()}
            <button class="btn btn-soft press" data-add-photo style="margin-bottom:var(--space-4)" onclick={openPhotoSheet}>
              <span>{m.add_photo()}</span>
            </button>
          {/snippet}
        </PhotoSection>

        {@render checklistBlock(m.surgery_recovery_checklist_title())}

        <SectionHeading text={m.surgery_consults_title()} />
        {@render consultsBlock()}
        <button class="btn btn-soft press" data-add-consult style="margin-bottom:var(--space-4)" onclick={openConsultSheet}>
          <span>{m.surgery_consult_add()}</span>
        </button>

      <!-- Phase 5: Archived Phase (>90 days post-op) -->
      {:else if selectedPhase === 'archived'}
        <SectionHeading text={m.surgery_phase_archived()} />
        <Notice
          icon="archive"
          key="surgery-archived"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={m.surgery_archived_title()}
          text={selectedRecDay?.type === 'since' ? m.surgery_archived_summary({ days: String(selectedRecDay.days) }) : ''}
          data-add-as-milestone-notice
        />

        {@render compareBlock()}

        <SectionHeading text={m.surgery_wound_album_title()} />
        <PhotoSection
          section={recoveryPhotos}
          read={photosQuery}
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          handle="procedure-photo"
          subtitle={(photo) => dayLabel(photo.epochDay)}
          deleteLabel={(photo) => m.surgery_photo_delete_aria({ date: dayLabel(photo.epochDay) })}
          confirm={{
            title: m.surgery_photo_delete_sheet(),
            question: () => m.surgery_photo_delete_q(),
            hint: () => m.surgery_photo_delete_hint(),
            confirmLabel: m.surgery_photo_delete(),
            cancelLabel: m.keep_it()
          }}
        >
          {#snippet empty()}
            <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_wound_album_empty()}</p>
          {/snippet}
          {#snippet addControl()}
            <button class="btn btn-soft press" data-add-photo style="margin-bottom:var(--space-4)" onclick={openPhotoSheet}>
              <span>{m.add_photo()}</span>
            </button>
          {/snippet}
        </PhotoSection>

        {@render notesBlock(m.surgery_notes_title(), m.surgery_notes_placeholder())}

        <SectionHeading text={m.surgery_consults_title()} />
        {@render consultsBlock()}

        {@render checklistBlock(m.surgery_checklist_title(), true)}
      {/if}
    </div>
  {/if}

  <RecordSheet
    {record}
    handle="procedure"
    newTitle={m.surgery_new_sheet()}
    editTitle={m.surgery_edit_sheet()}
    saveLabel={m.surgery_save()}
    deleteLabel={m.surgery_delete()}
    confirm={{
      title: m.surgery_delete_sheet(),
      question: (procedure) => m.surgery_delete_q({ name: procedure.name }),
      hint: () => m.surgery_delete_hint(),
      confirmLabel: m.surgery_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.surgery_name_label()} id="surgery-name">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="surgery-name"
            placeholder={m.surgery_name_placeholder()}
            bind:value={editor.name}
          />
        {/snippet}
      </Field>
      <Field label={m.surgery_date_label()} id="surgery-date">
        {#snippet children(id)}
          <DatePicker name="surgery-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>

  <Sheet open={consultSheet} title={m.surgery_consult_sheet()} onClose={() => (consultSheet = false)}>
    <h3>{m.surgery_consult_sheet()}</h3>
    <Field label={m.surgery_consult_date_label()} id="surgery-consult-date">
      {#snippet children(id)}
        <DatePicker name="surgery-consult-date" bind:value={consultDate} {id} />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-consult onclick={addConsult}><span>{m.surgery_consult_add()}</span></button>
  </Sheet>

  <Sheet open={photoSheet} title={m.surgery_photos_title()} onClose={() => (photoSheet = false)}>
    <h3>{m.surgery_photos_title()}</h3>
    <Field label={m.surgery_photo_date_label()} id="surgery-photo-date">
      {#snippet children(id)}
        <DatePicker name="surgery-photo-date" bind:value={photoDate} {id} />
      {/snippet}
    </Field>
    <div class="stack-3">
      <button class="btn btn-soft" data-pick-procedure-photo onclick={recoveryPhotos.pick}>
        <span>{m.surgery_photo_pick()}</span>
      </button>
      <button class="btn btn-soft" data-capture-procedure-photo onclick={recoveryPhotos.review.capture}>
        <span>{m.surgery_photo_capture()}</span>
      </button>
    </div>
  </Sheet>

  <Sheet open={itemSheet} title={m.surgery_checklist_sheet()} onClose={() => (itemSheet = false)}>
    <h3>{m.surgery_checklist_sheet()}</h3>
    <Field label={m.surgery_checklist_sheet()} id="surgery-item" hidden>
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="surgery-item"
          placeholder={m.surgery_checklist_placeholder()}
          bind:value={itemText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-procedure-item onclick={addItem}><span>{m.surgery_checklist_add()}</span></button>
  </Sheet>

  <!-- Surgery Day Milestone Confirmation Sheet (ADR-0045 explicit confirmation) -->
  {#if selected}
    <Sheet open={milestoneConfirmSheet} title={m.surgery_milestone_confirm_sheet()} onClose={() => (milestoneConfirmSheet = false)}>
      <h3>{m.surgery_milestone_confirm_q({ name: selected.name })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.surgery_milestone_confirm_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-primary" data-confirm-record-milestone onclick={confirmRecordMilestone}>
          <span>{m.surgery_milestone_prompt_action()}</span>
        </button>
        <button class="btn btn-soft" onclick={() => (milestoneConfirmSheet = false)}>
          <span>{m.keep_it()}</span>
        </button>
      </div>
    </Sheet>
  {/if}

  <RecordSheet
    record={itemRecord}
    handle="procedure-item"
    confirm={{
      title: m.surgery_checklist_delete_sheet(),
      question: () => m.surgery_checklist_delete_q(),
      hint: (item) => item.content,
      confirmLabel: m.surgery_delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>

<style>
  .recovery {
    margin-top: var(--space-4);
  }

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
    border-color: var(--role-mark, var(--accent));
    color: var(--role-mark, var(--accent));
  }

  .sj-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .sj-flagged {
    color: var(--role-mark, var(--accent));
  }
</style>
