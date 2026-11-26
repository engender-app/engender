<script lang="ts">
  /* Edit a procedure in place. Lead with the active phase and its
     reading (DIRECTION.md rule 16), then show phase records, related
     papers, fields and Delete.

     Planning, pre-op, surgery day, recovery and archived all share
     the same Notes and Checklist. Consult questions go in the
     shared appointment prep list. */
  import { undoable, offerUndo } from '$lib/stores/deleteUndo';
  import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
  import { journalTextAutocomplete } from '$lib/platform';
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { SURGERY_RECOVERY_CUTOFF_DAYS, procedurePhase, recoveryDay, type ProcedurePhase } from '$lib/data/recoveryDay';
  import { fmtDay, intlLocale } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { ChecklistItem, Procedure, ProcedureConsult, ProcedureKind } from '$lib/data/types';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { toast } from '$lib/stores/toasts.svelte';
  import { attempt, deleter, writer } from '$lib/stores/attempt.svelte';
  import { OFFERS, answerOffer, type OfferAnswer } from '$lib/data/offers';
  import { collapse, crossfade, resize } from '$lib/motion/reveal';
  import { motionDuration, scrollBehavior } from '$lib/motion/tokens';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import ProcedureFields from '$lib/components/ProcedureFields.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import CalendarHandoffSheet from '$lib/components/CalendarHandoffSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import { compareStretchLink } from '$lib/components/kit/compareStretchLink.svelte';
  import { compareStretchNoticeProps } from '$lib/data/compareStretch';
  import { blankCostDraft, costDraftFrom, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const LIST = '/health/surgery';

  /* The procedure, and the record kept against it - the same two roles the
     index gives its cards and the log that used to open under them. */
  const SECTION_ROLE = { procedure: 0, recovery: 1 };

  const today = $derived(currentDay());

  type Draft = {
    name: string;
    date: string;
    kind: ProcedureKind | null;
    dilationOptIn: boolean;
    archived: boolean;
    cost: CostDraft;
    notes: string;
  };

  const detail = detailDraft<Procedure, Draft>({
    read: async (j, id) => (await j.procedures.getProcedures()).find((p) => p.id === id),
    blank: () => ({
      name: '', date: '', kind: null, dilationOptIn: false, archived: false,
      cost: blankCostDraft(deviceDefaultCurrency()), notes: ''
    }),
    fromRecord: (procedure) => ({
      name: procedure.name,
      date: procedure.surgeryEpochDay === null ? '' : dateInputValueFromEpochDay(procedure.surgeryEpochDay),
      kind: procedure.kind,
      dilationOptIn: procedure.dilationOptIn,
      archived: procedure.archived,
      cost: costDraftFrom(procedure.cost, deviceDefaultCurrency(), intlLocale()),
      notes: procedure.notes
    }),
    saving: () => detailsWrite.busy || notesWrite.busy
  });
  let draft = $derived(detail.draft);
  let stored = $derived(detail.record);

  let phase = $derived<ProcedurePhase | null>(
    stored ? procedurePhase(stored.surgeryEpochDay, today, stored.archived) : null
  );
  let recDay = $derived(stored ? recoveryDay(stored.surgeryEpochDay, today) : null);
  let phaseLabel = $derived.by(() => {
    switch (phase) {
      case 'planning': return m.surgery_phase_planning();
      case 'pre_op': return m.surgery_phase_pre_op();
      case 'surgery_day': return m.surgery_day();
      case 'recovery': return m.surgery_phase_recovery();
      case 'archived': return m.surgery_phase_archived();
      default: return '';
    }
  });

  /* Ticket 18: the recovery window as one side of `/compare` - only once
     there is a surgery date to measure from (planning and pre-op have no
     days yet). Its end clamps to today for the first 90 days and holds at
     that cutoff after, archived or not (ADR-0010's "clamp at read time").
     It is open-ended only while it still ends today. */
  let recoveryWindow = $derived(
    stored && stored.surgeryEpochDay !== null && phase !== 'planning' && phase !== 'pre_op'
      ? { start: stored.surgeryEpochDay, end: Math.min(today, stored.surgeryEpochDay + SURGERY_RECOVERY_CUTOFF_DAYS) }
      : null
  );
  let recoveryOpenEnded = $derived(recoveryWindow !== null && recoveryWindow.end === today);
  const compareLink = compareStretchLink(() => recoveryWindow);
  const SURGERY_COMPARE_COPY = {
    title: m.surgery_compare_title,
    openHint: m.surgery_compare_open_hint,
    tooShort: m.surgery_compare_too_short,
    noPrecedingData: m.surgery_compare_no_data,
    action: m.open_compare
  };

  let photosQuery = liveList((j) => (stored ? j.procedures.getPhotos(detail.id) : Promise.resolve([])));
  let photos = $derived(photosQuery.rows);

  let checklistQuery = liveList((j) =>
    stored ? j.procedures.getChecklist(detail.id).then((c) => c?.items ?? []) : Promise.resolve([])
  );
  let checklistItems = $derived(checklistQuery.rows);

  let milestoneQuery = liveList((j) =>
    stored ? j.procedures.getMilestone(detail.id).then((found) => (found ? [found] : [])) : Promise.resolve([])
  );
  let linkedMilestone = $derived(milestoneQuery.rows[0] ?? null);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  function recoveryText(procedure: Procedure): string {
    const day = recoveryDay(procedure.surgeryEpochDay, today);
    if (day.type === 'unscheduled') return m.no_date_yet();
    if (day.type === 'upcoming') return m.surgery_day_upcoming({ days: m.n_days({ n: day.days }) });
    if (day.type === 'surgeryDay') return m.surgery_day();
    return m.surgery_day_since({ days: m.n_days({ n: day.days }) });
  }

  /* The procedure's own facts, saved together by one button. The notes are
     in the same draft so leaving asks once about anything unsaved, but
     each save writes and commits only its own half: an unsaved note stays
     unsaved across a details save, and the other way round. */
  const detailsWrite = writer();
  let canSaveDetails = $derived(!!draft.name.trim() && draft.kind !== null && costDraftOk(draft.cost));

  async function saveDetails() {
    const procedure = stored;
    const kind = draft.kind;
    const name = draft.name.trim();
    if (!procedure || !kind || !name || !costDraftOk(draft.cost)) return;
    const next: Procedure = {
      ...procedure,
      name,
      // An empty date field clears the date rather than defaulting to today:
      // a procedure without one yet is an ordinary state here.
      surgeryEpochDay: epochDayFromDateInputValue(draft.date) ?? null,
      kind,
      dilationOptIn: kind === 'custom' && draft.dilationOptIn,
      archived: draft.archived,
      cost: costFromDraft(draft.cost)
    };
    const saved = await detailsWrite.run(() => journal.procedures.upsertProcedure({
      id: next.id,
      name: next.name,
      surgeryEpochDay: next.surgeryEpochDay,
      kind: next.kind,
      dilationOptIn: next.dilationOptIn,
      archived: next.archived,
      cost: next.cost
    }), m.write_failed());
    if (!saved) return;
    detail.commit({ ...next, notes: procedure.notes });
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* A save that moves the procedure into another phase (a date set, the
     archive switch flipped) rebuilds the whole log above the fields. The
     old log crossfades off under the new one (the `{#key phase}` below),
     and the page scrolls by however much the log grew or shrank so the
     fields and the Save button just pressed stay where they were. Without
     this the button was thrown 1150px down for the length of the old
     log's leaving rows and came back 1010px in one frame (measured
     un-archiving a procedure at 390px). */
  /* The arriving half of that swap, the way ListRow's `lineIn` pairs with
     its own out-only crossfade. Local, so it plays only when the phase
     changes under a screen already up, never on the screen's arrival: the
     navigation is what brings the first log in. */
  const phaseIn = (node: Element) => crossfade(node, undefined, { direction: 'in' });
  let detailsEl = $state<HTMLElement>();
  let detailsTopBefore: number | null = null;
  $effect.pre(() => {
    void phase;
    detailsTopBefore = detailsEl ? detailsEl.getBoundingClientRect().top : null;
  });
  $effect(() => {
    void phase;
    const anchor = detailsEl;
    const top = detailsTopBefore;
    detailsTopBefore = null;
    if (!anchor || top === null) return;
    const scroller = anchor.closest('[data-app-scroll-region]');
    if (!scroller) return;
    /* Held for the length of the new log's arrival rather than once: its
       notices open their own height (Notice's arrival) over --dur-slow,
       and a single correction let those 241px push the button off the
       bottom of the screen on an eased slide. A ResizeObserver rather than
       a frame loop, because it runs after layout and before paint: a
       requestAnimationFrame read sees the previous frame's layout, and
       the button bounced 48px for one frame each time. */
    const settle = () => {
      const moved = anchor.getBoundingClientRect().top - top;
      if (moved) scroller.scrollBy(0, moved);
    };
    settle();
    const watch = new ResizeObserver(settle);
    watch.observe(anchor.parentElement ?? anchor);
    const stop = setTimeout(() => watch.disconnect(), motionDuration('--dur-slow') + 150);
    return () => { clearTimeout(stop); watch.disconnect(); };
  });

  /* Planning has no date yet, and the field that takes one is further
     down: the notice's action goes to it rather than to a sheet. */
  async function goToDate() {
    await tick();
    const field = document.getElementById('surgery-date');
    field?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    field?.focus({ preventScroll: true });
  }

  const notesWrite = writer();
  async function saveNotes() {
    const procedure = stored;
    const notes = draft.notes;
    if (!procedure) return;
    if (await notesWrite.run(() => journal.procedures.setNotes(procedure.id, notes), m.write_failed())) {
      detail.commit({ ...procedure, notes });
      toast(m.surgery_notes_saved(), { kind: 'record-saved' });
    }
  }

  let confirmingDelete = $state(false);
  const removing = deleter();
  async function deleteProcedure() {
    const id = stored?.id;
    if (!id) return;
    let deletion: UndoableDelete | undefined;
    if (!(await removing.run(async () => { deletion = await undoable((j) => j.procedures.deleteProcedure(id)); }))) return;
    confirmingDelete = false;
    offerUndo(deletion!, m.record_deleted());
    // Deleting answered the question an unsaved edit would have asked.
    detail.discard();
    await replaceRoute(LIST);
  }

  // Ticket 18: only once there is a date to hand off.
  let calendarSheet = $state(false);

  let consultSheet = $state(false);
  let consultDate = $state('');
  let photoSheet = $state(false);
  let photoDate = $state('');

  /* Every sheet below closes once its write lands and stays open with a
     toast when it does not (after-release 06). */
  const sheetWrite = writer();

  /** False when the write failed, which keeps a reviewed shot under review. */
  async function storePhoto(photo: NormalizedPhoto): Promise<boolean> {
    const epochDay = epochDayFromDateInputValue(photoDate);
    const id = stored?.id;
    if (!id || epochDay === null) return true;
    if (!(await sheetWrite.run(() => journal.procedures.addPhoto(id, epochDay, photo), m.write_failed()))) return false;
    photoSheet = false;
    toast(m.saved(), { kind: 'record-saved' });
    return true;
  }

  const recoveryPhotos = photoSection<ProcedurePhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => undoable((j) => j.procedures.deletePhoto(id)),
    reference: () => lastPhotoReference(photos)
  });

  /* A consult date asks before it goes and says that it went
     (after-release 07). */
  const consultRecord = recordEditor<ProcedureConsult>({
    remove: (id) => undoable((j) => j.procedures.deleteConsult(id)),
    deleted: () => m.surgery_consult_deleted(),
    findById: (id) => stored?.consults.find((consult) => consult.id === id)
  });

  let itemSheet = $state(false);
  let itemText = $state('');
  const itemRecord = recordEditor<ChecklistItem>({
    remove: (id) => undoable((j) => j.checklists.deleteItem(id)),
    findById: (id) => checklistItems.find((i) => i.id === id)
  });

  /* One entry in the offer registry (ADR-0045): "reaching surgery day or the recovery phase in the procedure
     hub". Both places that call `promptMilestoneConfirmation` only draw
     while the procedure has no milestone. */
  const MILESTONE_OFFER = OFFERS['surgery-day-milestone'];
  let milestoneOffer = $state<{ procedureId: string } | null>(null);

  function promptMilestoneConfirmation() {
    if (!stored) return;
    milestoneOffer = { procedureId: stored.id };
  }

  /* Closed once the write lands (after-release 06). */
  const offerWrite = writer();
  async function answerMilestoneOffer(given: OfferAnswer) {
    const subject = milestoneOffer;
    if (!subject) return;
    let added = false;
    if (!(await offerWrite.run(async () => { added = await answerOffer(MILESTONE_OFFER, subject, given, journal); }, m.write_failed()))) return;
    milestoneOffer = null;
    if (added) toast(m.milestone_added());
  }

  function openConsultSheet() {
    consultDate = dateInputValueFromEpochDay(today);
    consultSheet = true;
  }

  async function addConsult() {
    const epochDay = epochDayFromDateInputValue(consultDate);
    const id = stored?.id;
    if (!id || epochDay === null) return;
    if (!(await sheetWrite.run(() => journal.procedures.addConsult(id, epochDay), m.write_failed()))) return;
    consultSheet = false;
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* The question is the prep list's own item, so it shows under "What to
     raise" on the appointment screen and on the clinician summary. */
  let questionSheet = $state(false);
  let questionText = $state('');

  function openQuestionSheet() {
    questionText = '';
    questionSheet = true;
  }

  async function addQuestion() {
    const content = questionText.trim();
    if (!content) return;
    if (!(await sheetWrite.run(() => journal.checklists.addToStandaloneChecklist(content), m.write_failed()))) return;
    questionSheet = false;
    toast(m.appointment_prep_added_toast(), { kind: 'record-saved' });
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
    const id = stored?.id;
    if (!id || !content) return;
    if (!(await sheetWrite.run(() => journal.procedures.addChecklistItem(id, content), m.write_failed()))) return;
    itemSheet = false;
    toast(m.saved(), { kind: 'record-saved' });
  }
</script>

{#snippet woundAlbum()}
  <SectionHeading text={m.surgery_wound_album_title()} />
  <PhotoSection
    section={recoveryPhotos}
    read={photosQuery}
    role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
    handle="procedure-photo"
    subtitle={(photo) => dayLabel(photo.epochDay)}
    deleteLabel={(photo) => m.surgery_photo_delete_aria({ date: dayLabel(photo.epochDay) })}
    confirm={{
      title: m.photo_delete_sheet(),
      question: () => m.photo_delete_q(),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet empty()}
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.surgery_wound_album_empty()}</p>
    {/snippet}
    {#snippet addControl()}
      <button class="btn btn-soft press" data-add-photo style="margin-bottom:var(--space-4)" onclick={openPhotoSheet}>
        <span>{m.add()}</span>
      </button>
    {/snippet}
  </PhotoSection>
{/snippet}

{#snippet checklistBlock(readonly = false)}
  <SectionHeading text={m.surgery_checklist_title()} />
  {#if checklistItems.length}
    <div style="margin-bottom:var(--space-3)">
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
        {#each checklistItems as item (item.id)}
          <div transition:collapse class="kit-row is-split" data-procedure-item={item.id}>
            <button
              class="kit-row-main"
              role="checkbox"
              aria-checked={item.checked}
              aria-label={item.checked ? m.surgery_checklist_uncheck_aria({ content: item.content }) : m.surgery_checklist_check_aria({ content: item.content })}
              onclick={() => attempt(() => journal.checklists.setItemChecked(item.id, !item.checked), m.write_failed())}
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
                onclick={() => attempt(() => journal.checklists.setItemCarriedForward(item.id, !item.carriedForward), m.write_failed())}
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

{#snippet notesBlock()}
  <SectionHeading text={m.surgery_notes_title()} />
  <Field label={m.surgery_notes_title()} id="surgery-notes" hidden>
    {#snippet children(id)}
      <textarea autocomplete={journalTextAutocomplete()}
        class="input"
        {id}
        name="surgery-notes"
        rows="4"
        placeholder={m.surgery_notes_placeholder()}
        bind:value={draft.notes}
      ></textarea>
    {/snippet}
  </Field>
  <button class="btn btn-soft press" data-save-notes style="margin-bottom:var(--space-4)" disabled={notesWrite.busy} onclick={saveNotes}>
    <span>{m.surgery_notes_save()}</span>
  </button>
{/snippet}

{#snippet consultsBlock(procedure: Procedure)}
  {#if procedure.consults.length}
    <div style="margin-bottom:var(--space-3)" transition:collapse>
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}>
        {#each procedure.consults as consult (consult.id)}
          <div class="rows-divide" transition:collapse>
            <ListRow
              static
              data-consult={consult.id}
              title={dayLabel(consult.epochDay)}
              action={{
                icon: 'trash',
                label: m.surgery_consult_delete_aria({ date: dayLabel(consult.epochDay) }),
                onclick: () => consultRecord.askToDelete(consult),
                attrs: { 'data-delete-consult': consult.id }
              }}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-3)" transition:collapse>{m.surgery_consults_empty()}</p>
  {/if}
{/snippet}

<!-- A consult date, and a question to take into it. The question goes on
     the appointment prep list. -->
{#snippet consultActions()}
  <div class="consult-actions">
    <button class="btn btn-soft press" data-add-consult onclick={openConsultSheet}>
      <span>{m.surgery_consult_add()}</span>
    </button>
    <button class="btn btn-soft press" data-add-consult-question onclick={openQuestionSheet}>
      <span>{m.surgery_consult_question_add()}</span>
    </button>
  </div>
{/snippet}

{#snippet consultsSection(procedure: Procedure, withActions = true)}
  <SectionHeading text={m.surgery_consults_title()} />
  {@render consultsBlock(procedure)}
  {#if withActions}{@render consultActions()}{/if}
{/snippet}

<!-- Ticket 18: the recovery window as one side of `/compare`, offered only
     once there is one (surgery day onward). -->
{#snippet compareBlock()}
  {#if compareLink.state.status !== 'hidden'}
    {@const compareNotice = compareStretchNoticeProps(compareLink.state, recoveryOpenEnded, SURGERY_COMPARE_COPY)}
    <div style="margin-top:var(--space-4);margin-bottom:var(--space-4)">
      <Notice
        icon="columns"
        key="surgery-compare"
        role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
        title={compareNotice.title}
        text={compareNotice.text}
        action={compareNotice.action}
      />
    </div>
  {/if}
{/snippet}

<div class="screen">
  <ScreenHeader title={m.surgery_name_label()} back={LIST} />
  <SourceRecordHandoff id={detail.id} ready={!detail.loading && !detail.failed} found={!!stored} />

  {#if detail.failed}
    <Notice key="procedure-read" title={stored ? m.read_refresh_failed() : m.read_failed()}
      text={stored ? m.read_stale_body() : undefined}
      action={{ label: m.read_retry(), onclick: () => detail.retry() }} />
  {/if}
  {#if detail.loading && !detail.failed}
    <div out:crossfade><Skeleton variant="block" count={3} /></div>
  {:else if stored && phase}
    <div class="procedure" data-recovery-log={stored.id} data-procedure-screen={stored.id} data-phase={phase}>
      <!-- The procedure's name, and the phase it is in under it. In the
           page rather than in the field: the field's title is fixed at
           "Procedure", because a name that arrives with the read after the
           navigation has started grew the field by a line or two in one
           frame at the end of the transition (91px measured on a
           three-line name). Every other detail screen keeps a fixed title
           for the same reason. A rename crossfades the words, and the
           wrapper travels the height when the new name wraps differently,
           the roadmap's category heading's own treatment. -->
      <div use:resize>
        <SectionHeading text={stored.name} sub={phaseLabel} crossfade />
      </div>
      {#key phase}
      <div class="phase-log" data-phase-log={phase} in:phaseIn out:crossfade>
      {#if phase === 'planning'}
        <Notice
          icon="clipboard"
          key="surgery-planning"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={m.no_date_yet()}
          action={{ label: m.surgery_set_date(), onclick: () => void goToDate() }}
          data-add-as-milestone-notice
        />
        {@render consultsSection(stored)}
        {@render notesBlock()}
        {@render checklistBlock()}

      {:else if phase === 'pre_op'}
        <Notice
          icon="clipboard"
          key="surgery-preop"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={recoveryText(stored)}
          text={stored.surgeryEpochDay ? dayLabel(stored.surgeryEpochDay) : ''}
          data-add-as-milestone-notice
        />
        {@render checklistBlock()}
        {@render consultsSection(stored)}
        {@render notesBlock()}

      {:else if phase === 'surgery_day'}
        <Notice
          icon="clipboard"
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
              icon="summit"
              key="surgery-milestone-linked"
              role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
              title={m.surgery_milestone_linked_badge()}
              text={m.surgery_milestone_recorded_notice({ name: linkedMilestone.name })}
            />
          </div>
        {:else}
          <div style="margin-bottom:var(--space-4)">
            <Notice
              icon="summit"
              key="surgery-milestone-prompt"
              role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
              title={m.surgery_milestone_prompt_title()}
              action={{ label: m.surgery_milestone_prompt_action(), primary: true, onclick: promptMilestoneConfirmation }}
              data-record-milestone-prompt
            />
          </div>
        {/if}
        {@render checklistBlock()}
        {@render notesBlock()}

      {:else if phase === 'recovery'}
        <Notice
          icon="clipboard"
          key="surgery-recovery"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={recDay?.type === 'since' ? m.surgery_post_op_day({ days: String(recDay.days) }) : recoveryText(stored)}
          text={stored.surgeryEpochDay ? dayLabel(stored.surgeryEpochDay) : ''}
          action={linkedMilestone
            ? undefined
            : { label: m.surgery_milestone_add(), onclick: promptMilestoneConfirmation }}
          data-add-as-milestone-notice
        />
        {@render compareBlock()}
        {@render notesBlock()}
        {@render woundAlbum()}
        {@render checklistBlock()}
        {@render consultsSection(stored)}

      {:else if phase === 'archived'}
        <Notice
          icon="archive"
          key="surgery-archived"
          role={roleAt(activeFlag.roles, SECTION_ROLE.recovery)}
          title={m.surgery_archived_title()}
          text={recDay?.type === 'since' ? m.surgery_archived_summary({ days: String(recDay.days) }) : ''}
          data-add-as-milestone-notice
        />
        {@render compareBlock()}
        {@render woundAlbum()}
        {@render notesBlock()}
        {@render consultsSection(stored, false)}
        {@render checklistBlock(true)}
      {/if}
      </div>
      {/key}

      <!-- Outside the phase chain on purpose (ADR-0065): a
           document filed against a procedure stays visible whichever phase
           the procedure is in now. -->
      <LinkedDocuments kind="procedure" id={stored.id} />

      <!-- The procedure's own facts, edited where they stand. They used to
           live in a sheet behind a pencil on the index card. Last, because
           they change least: a name, a type and a date are set once, and the
           log above is what gets written to week by week. -->
      <div bind:this={detailsEl}>
        <SectionHeading text={m.details_title()} />
      </div>
      <fieldset class="procedure-details" disabled={detailsWrite.busy} aria-busy={detailsWrite.busy}>
        <ProcedureFields
          bind:name={draft.name}
          bind:kind={draft.kind}
          bind:date={draft.date}
          bind:cost={draft.cost}
          bind:dilationOptIn={draft.dilationOptIn}
          bind:archived={draft.archived}
          showArchive
        />
        <!-- One button to a line. Laid inline, the way a `.stack-3` of
             buttons lays out, the calendar button arriving beside Save when
             a date was saved dropped Save in one frame. -->
        <div class="details-actions">
          <button class="btn btn-primary press" data-save-procedure disabled={!canSaveDetails} onclick={saveDetails}>
            <span>{m.save_changes()}</span>
          </button>
          <!-- It opens its own height when a save gives the procedure its
               date, so Delete travels down rather than jumping. -->
          {#if stored.surgeryEpochDay !== null}
            <div class="action-slot" transition:collapse>
              <button class="btn btn-soft press" data-add-to-calendar onclick={() => (calendarSheet = true)}>
                <span>{m.calendar_handoff_button()}</span>
              </button>
            </div>
          {/if}
          <div class="action-slot">
            <button class="btn btn-ghost press" data-delete-procedure onclick={() => (confirmingDelete = true)}>
              <span>{m.surgery_delete_sheet()}</span>
            </button>
          </div>
        </div>
      </fieldset>
    </div>

    {#if stored.surgeryEpochDay !== null}
      <CalendarHandoffSheet
        open={calendarSheet}
        kind="surgery"
        epochDay={stored.surgeryEpochDay}
        onClose={() => (calendarSheet = false)}
      />
    {/if}

    <ConfirmDeleteSheet
      open={confirmingDelete}
      title={m.surgery_delete_sheet()}
      question={m.surgery_delete_q({ name: stored.name })}
      hint={m.surgery_delete_hint()}
      confirmLabel={m.delete()}
      cancelLabel={m.keep_it()}
      confirmAttrs={{ 'data-confirm-delete-procedure': '' }}
      onConfirm={deleteProcedure}
      onCancel={() => { confirmingDelete = false; removing.dismiss(); }}
      busy={removing.busy}
      failed={removing.failed}
    />

    <Sheet
      busy={offerWrite.busy}
      open={milestoneOffer !== null}
      title={MILESTONE_OFFER.copy.title()}
      onClose={() => void answerMilestoneOffer('decline')}
    >
      <h3>{m.surgery_milestone_confirm_q({ name: stored.name })}</h3>
      <div class="stack-3">
        <button
          class="btn btn-primary"
          data-confirm-record-milestone
          disabled={offerWrite.busy}
          onclick={() => void answerMilestoneOffer('confirm')}
        >
          <span>{MILESTONE_OFFER.copy.confirm()}</span>
        </button>
        <button class="btn btn-soft" onclick={() => void answerMilestoneOffer('decline')}>
          <span>{MILESTONE_OFFER.copy.decline()}</span>
        </button>
      </div>
    </Sheet>
  {/if}

  <Sheet busy={sheetWrite.busy} open={consultSheet} title={m.surgery_consult_sheet()} onClose={() => (consultSheet = false)}>
    <h3>{m.surgery_consult_sheet()}</h3>
    <Field label={m.surgery_consult_date_label()} id="surgery-consult-date">
      {#snippet children(id)}
        <DatePicker name="surgery-consult-date" bind:value={consultDate} {id} />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-consult disabled={sheetWrite.busy} onclick={addConsult}><span>{m.surgery_consult_add()}</span></button>
  </Sheet>

  <Sheet busy={sheetWrite.busy} open={questionSheet} title={m.surgery_consult_question_sheet()} onClose={() => (questionSheet = false)}>
    <h3>{m.surgery_consult_question_sheet()}</h3>
    <Field label={m.surgery_consult_question_label()} id="surgery-consult-question" hidden>
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="surgery-consult-question"
          placeholder={m.surgery_consult_question_placeholder()}
          bind:value={questionText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-consult-question disabled={sheetWrite.busy} onclick={addQuestion}><span>{m.appointment_prep_add_button()}</span></button>
  </Sheet>

  <Sheet busy={sheetWrite.busy} open={photoSheet} title={m.surgery_photos_title()} onClose={() => (photoSheet = false)}>
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
        <span>{m.take_a_photo()}</span>
      </button>
    </div>
  </Sheet>

  <Sheet busy={sheetWrite.busy} open={itemSheet} title={m.surgery_checklist_sheet()} onClose={() => (itemSheet = false)}>
    <h3>{m.surgery_checklist_sheet()}</h3>
    <Field label={m.surgery_checklist_sheet()} id="surgery-item" hidden>
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="surgery-item"
          placeholder={m.surgery_checklist_placeholder()}
          bind:value={itemText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-procedure-item disabled={sheetWrite.busy} onclick={addItem}><span>{m.surgery_checklist_add()}</span></button>
  </Sheet>

  <RecordSheet
    record={consultRecord}
    handle="consult"
    confirm={{
      title: m.surgery_consult_delete_sheet(),
      question: (consult) => m.surgery_consult_delete_q({ date: dayLabel(consult.epochDay) }),
      confirmLabel: m.surgery_consult_delete_sheet(),
      cancelLabel: m.keep_it()
    }}
  />

  <RecordSheet
    record={itemRecord}
    handle="procedure-item"
    confirm={{
      title: m.surgery_checklist_delete_sheet(),
      question: () => m.surgery_checklist_delete_q(),
      hint: (item) => item.content,
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>

<DiscardSheet guard={detail.guard} />

<style>
  .consult-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .sj-box {
    border: 2px solid var(--outline);
    border-radius: var(--r-block);
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
