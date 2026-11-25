<script lang="ts">
  /* One appointment, on its own screen (prh12). Tapping a visit or a wait
     on the appointments list used to open an editor sheet over the list;
     everything about one appointment is laid out here instead and edited
     where it stands, the way a procedure's own screen does it
     (`/health/surgery/[id]`, prh12 bug 20).

     Same order whatever state it is in: what it is and when (the heading),
     then what the visit needs in that state, then the surgery journey it
     belongs to where it is a consult, then its own facts as fields, then
     Delete. The state is one of three, read off the day it is on:

     - upcoming (today counts until the day is over, appointments.ts's own
       line): "What to raise", the standing prep list, then the note. The
       list is unowned (ADR-0066), so every upcoming visit's screen shows the
       same one, the one taken into any appointment.
     - past: the note, which is where an outcome goes, then the debrief -
       the entry where one was written, the offer on the most recent visit
       where it is still open.
     - a wait (no day yet, functional-audit ticket 26): its dated updates,
       then the note. A visit that began as a wait keeps its updates once
       it has a day.

     No document can be filed against an appointment (DocumentTargetKind is
     closed at four kinds, ADR-0065), and an appointment holds no photos, so
     neither has a section here. */
  import { undoable, offerUndo } from '$lib/stores/deleteUndo';
  import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration, fmtTime, intlLocale } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, timestampAtLocalTime } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { Appointment, AppointmentStatusUpdate, WaitingAppointment } from '$lib/data/types';
  import type { AppointmentInput } from '$lib/data/journal/appointments';
  import { mostRecentPastAppointment, waitingSince } from '$lib/data/journal/appointments';
  import { debriefOfferVisible } from '$lib/data/vocabulary/entryTemplates';
  import { gapTo } from '$lib/data/vocabulary/hubLabels';
  import { toast } from '$lib/stores/toasts.svelte';
  import { deleter, rowWriter, writer } from '$lib/stores/attempt.svelte';
  import { collapse, crossfade, resize } from '$lib/motion/reveal';
  import { motionDuration } from '$lib/motion/tokens';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import AppointmentFields from '$lib/components/AppointmentFields.svelte';
  import AppointmentPrep from '$lib/components/AppointmentPrep.svelte';
  import ProviderSheet from '$lib/components/ProviderSheet.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import CalendarHandoffSheet from '$lib/components/CalendarHandoffSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { blankCostDraft, costDraftFrom, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const LIST = '/health/appointments';

  /* The appointment, and the record kept against it - the visit's own role
     on the list, and the prep list's. */
  const SECTION_ROLE = { appointment: 0, log: 1 };

  type Record = Appointment | WaitingAppointment;
  type State = 'upcoming' | 'past' | 'wait';

  const today = $derived(currentDay());
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const dayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

  type Draft = {
    kind: string;
    providerId: string | null;
    place: string;
    date: string;
    time: string;
    referred: string;
    cost: CostDraft;
    note: string;
  };

  const detail = detailDraft<Record, Draft>({
    read: async (j, id) =>
      (await j.appointments.getAppointments()).find((a) => a.id === id) ??
      (await j.appointments.getWaiting()).find((a) => a.id === id),
    blank: () => ({
      kind: '', providerId: null, place: '', date: '', time: '', referred: '',
      cost: blankCostDraft(deviceDefaultCurrency()), note: ''
    }),
    fromRecord: (appointment) => ({
      kind: appointment.kind ?? '',
      providerId: appointment.providerId,
      place: appointment.place ?? '',
      date: appointment.epochDay === null ? '' : dateInputValueFromEpochDay(appointment.epochDay),
      time: appointment.time ?? '',
      referred: appointment.referredEpochDay === null ? '' : dateInputValueFromEpochDay(appointment.referredEpochDay),
      cost: costDraftFrom(appointment.cost, deviceDefaultCurrency(), intlLocale()),
      note: appointment.note ?? ''
    }),
    saving: () => detailsWrite.busy || noteWrite.busy
  });
  let draft = $derived(detail.draft);
  let stored = $derived(detail.record);

  /* Today's visit counts as coming up until the day is over, the line
     appointments.ts's own selectors draw. */
  let visitState = $derived<State | null>(
    !stored ? null : stored.epochDay === null ? 'wait' : stored.epochDay >= today ? 'upcoming' : 'past'
  );

  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedureName = $derived(
    stored?.procedureId ? proceduresQuery.rows.find((p) => p.id === stored!.procedureId)?.name : undefined
  );
  let providersQuery = liveList((j) => j.appointments.getProviders());

  const titleOf = (appointment: Record) => appointment.kind ?? procedureName ?? m.appointments_untitled();

  /** The day, its time where it keeps one, and how far off it is while it
      is still ahead (ADR-0067's amendment: a gap may be stated on an area's
      own screen). A wait says how long it has been, as a fact. */
  function whenLine(appointment: Record): string {
    if (appointment.epochDay === null) {
      const since = waitingSince(appointment.referredEpochDay, today);
      if (since === null || appointment.referredEpochDay === null) return m.no_date_yet();
      return appointment.referredEpochDay === today
        ? m.appointments_waiting_since_today()
        : m.appointments_waiting_since({
            day: fmtDay(appointment.referredEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
            duration: fmtDuration(since)
          });
    }
    const day = dayLabel(appointment.epochDay);
    const when = appointment.time
      ? m.appointments_day_time({ day, time: fmtTime(timestampAtLocalTime(appointment.epochDay, appointment.time)) })
      : day;
    if (appointment.epochDay < today) return when;
    const gap = appointment.epochDay === today ? m.appointments_gap_today() : m.appointments_gap({ gap: gapTo(appointment.epochDay, today) });
    return `${when} · ${gap}`;
  }

  /* The wait's updates, newest first, the order somebody reads a log. */
  let statusQuery = liveList((j) =>
    stored
      ? j.appointments.getStatusUpdates().then((all) => all.filter((u) => u.appointmentId === detail.id).reverse())
      : Promise.resolve([] as AppointmentStatusUpdate[])
  );
  let updates = $derived(statusQuery.rows);

  /* The standing prep list (AppointmentPrep). */
  let checklistQuery = liveList((j) => j.checklists.getStandaloneChecklist().then((c) => c?.items));

  /* The debrief, scoped to this appointment (checklists.ts, ticket 58):
     the entry where one was written, for any past visit; the offer only on
     the most recent one, which is the one visit it belongs to. */
  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let isLastVisit = $derived(
    visitState === 'past' && mostRecentPastAppointment(appointmentsQuery.rows, today)?.id === detail.id
  );
  let debriefQuery = liveQuery((j) => j.checklists.getDebriefState(visitState === 'past' ? detail.id : null));
  let debriefEntryId = $derived(debriefQuery.value?.appointmentId === detail.id ? debriefQuery.value.debriefEntryId : null);
  let showDebriefOffer = $derived(
    isLastVisit && debriefQuery.value?.appointmentId === detail.id && debriefOfferVisible(debriefQuery.value)
  );

  /** The stored appointment as an upsert, so a save of one half keeps the
      other half as it is stored rather than as it is drafted. */
  const inputOf = (appointment: Record): AppointmentInput => ({
    id: appointment.id,
    epochDay: appointment.epochDay,
    referredEpochDay: appointment.referredEpochDay,
    procedureId: appointment.procedureId,
    kind: appointment.kind,
    place: appointment.place,
    note: appointment.note,
    time: appointment.time,
    providerId: appointment.providerId,
    cost: appointment.cost
  });

  /* The appointment's own facts, saved together by one button. The note is
     in the same draft so leaving asks once about anything unsaved, but each
     save writes and commits only its own half: an unsaved note stays
     unsaved across a details save, and the other way round. */
  const detailsWrite = writer();
  let canSaveDetails = $derived(costDraftOk(draft.cost));

  async function saveDetails() {
    const appointment = stored;
    if (!appointment || !costDraftOk(draft.cost)) return;
    const epochDay = epochDayFromDateInputValue(draft.date) ?? null;
    const kind = draft.kind.trim();
    const place = draft.place.trim();
    const next = {
      ...appointment,
      epochDay,
      referredEpochDay: epochDayFromDateInputValue(draft.referred) ?? null,
      kind: kind || null,
      place: place || null,
      // A wait has no time: clearing the day hides the field, and what it
      // held is not kept behind it.
      time: epochDay !== null && draft.time ? draft.time : null,
      providerId: draft.providerId,
      cost: costFromDraft(draft.cost)
    } as Record;
    if (!(await detailsWrite.run(() => journal.appointments.upsertAppointment(inputOf(next)), m.write_failed()))) return;
    detail.commit(next);
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* A save that moves the appointment into another state (a day set on a
     wait, a day moved into the past) rebuilds the log above the fields.
     The old log crossfades off under the new one (the `{#key}` below), and
     the page scrolls by however much the log grew or shrank so the fields
     and the Save button just pressed stay where they were - the procedure
     screen's own fix for a Save button thrown 1150px down and back in one
     frame. A ResizeObserver rather than a frame loop, because it runs after
     layout and before paint. */
  const stateIn = (node: Element) => crossfade(node, undefined, { direction: 'in' });
  let detailsEl = $state<HTMLElement>();
  let detailsTopBefore: number | null = null;
  $effect.pre(() => {
    void visitState;
    detailsTopBefore = detailsEl ? detailsEl.getBoundingClientRect().top : null;
  });
  $effect(() => {
    void visitState;
    const anchor = detailsEl;
    const top = detailsTopBefore;
    detailsTopBefore = null;
    if (!anchor || top === null) return;
    const scroller = anchor.closest('[data-app-scroll-region]');
    if (!scroller) return;
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

  const noteWrite = writer();
  async function saveNote() {
    const appointment = stored;
    const note = draft.note.trim();
    if (!appointment) return;
    const next = { ...appointment, note: note || null } as Record;
    if (await noteWrite.run(() => journal.appointments.upsertAppointment(inputOf(next)), m.write_failed())) {
      detail.commit(next);
      toast(m.appointment_note_saved(), { kind: 'record-saved' });
    }
  }

  /* A wait's updates are their own records, written as they are added
     rather than held in the draft: an update is a fact on the day it is
     typed, not part of an edit somebody might still discard. */
  let newUpdateText = $state('');
  let newUpdateDate = $state(dateInputValueFromEpochDay(currentDay()));
  const updateWrite = writer();
  async function addUpdate() {
    const status = newUpdateText.trim();
    const appointmentId = stored?.id;
    if (!status || !appointmentId) return;
    const epochDay = epochDayFromDateInputValue(newUpdateDate) ?? today;
    if (!(await updateWrite.run(() => journal.appointments.addStatusUpdate({ appointmentId, epochDay, status }), m.write_failed())))
      return;
    newUpdateText = '';
  }
  const updateDelete = rowWriter();
  /* One tap, no confirmation: the toast's Undo is the way back (functional
     audit ticket 46). */
  async function deleteUpdate(update: AppointmentStatusUpdate) {
    let deletion: UndoableDelete | undefined;
    const write = async () => {
      deletion = await undoable((j) => j.appointments.deleteStatusUpdate(update.id));
    };
    if (!(await updateDelete(update.id, write, m.write_failed()))) return;
    offerUndo(deletion!, m.record_deleted());
  }

  // Only for an appointment saved with a day; the handoff uses that day.
  let calendarSheet = $state(false);

  let providerSheet = $state<ProviderSheet>();

  let confirmingDelete = $state(false);
  const removing = deleter();
  async function deleteAppointment() {
    const id = stored?.id;
    if (!id) return;
    let deletion: UndoableDelete | undefined;
    if (!(await removing.run(async () => { deletion = await undoable((j) => j.appointments.deleteAppointment(id)); }))) return;
    confirmingDelete = false;
    offerUndo(deletion!, m.record_deleted());
    // Deleting answered the question an unsaved edit would have asked.
    detail.discard();
    await replaceRoute(LIST);
  }
</script>

{#snippet noteBlock()}
  <SectionHeading text={m.note_label()} />
  <Field label={m.note_label()} id="appointment-note" hidden>
    {#snippet children(id)}
      <textarea autocomplete={journalTextAutocomplete()}
        class="input"
        {id}
        name="appointment-note"
        rows="4"
        bind:value={draft.note}
      ></textarea>
    {/snippet}
  </Field>
  <button class="btn btn-soft press" data-save-appointment-note style="margin-bottom:var(--space-4)" disabled={noteWrite.busy} onclick={saveNote}>
    <span>{m.appointment_note_save()}</span>
  </button>
{/snippet}

{#snippet updatesBlock()}
  <SectionHeading text={m.appointments_updates_heading()} />
  {#if updates.length}
    <div style="margin-bottom:var(--space-3)" transition:collapse>
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.log)}>
        {#each updates as update (update.id)}
          <div transition:collapse>
            <ListRow
              key={`update-${update.id}`}
              data-status-update={update.id}
              static
              title={update.status}
              subtitle={dayLabel(update.epochDay)}
              action={{
                icon: 'trash',
                label: m.appointments_update_delete_aria({ status: update.status }),
                onclick: () => deleteUpdate(update),
                attrs: { 'data-delete-status-update': update.id }
              }}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {/if}
  <Field label={m.appointments_update_label()} id="appointment-update">
    {#snippet children(id)}
      <input autocomplete={journalTextAutocomplete()}
        class="input"
        {id}
        name="appointment-update"
        placeholder={m.appointments_update_placeholder()}
        bind:value={newUpdateText}
      />
    {/snippet}
  </Field>
  <Field label={m.appointments_update_day_label()} id="appointment-update-date">
    {#snippet children(id)}
      <DatePicker name="appointment-update-date" bind:value={newUpdateDate} {id} />
    {/snippet}
  </Field>
  <button
    class="btn btn-soft press"
    data-add-status-update
    style="margin-bottom:var(--space-4)"
    disabled={updateWrite.busy || !newUpdateText.trim()}
    onclick={addUpdate}
  >
    <span>{m.appointments_update_add()}</span>
  </button>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.appointment_screen_title()} back={LIST} />
  <SourceRecordHandoff id={detail.id} ready={!detail.loading && !detail.failed} found={!!stored} />

  {#if detail.failed}
    <Notice key="appointment-read" title={stored ? m.read_refresh_failed() : m.read_failed()}
      text={stored ? m.read_stale_body() : undefined}
      action={{ label: m.read_retry(), onclick: () => detail.retry() }} />
  {/if}
  {#if detail.loading && !detail.failed}
    <div out:crossfade><Skeleton variant="block" count={3} /></div>
  {:else if stored && visitState}
    <div class="appointment" data-appointment-screen={stored.id} data-state={visitState}>
      <!-- What it is, and when, under it. In the page rather than in the
           field: the field's title is fixed at "Appointment", because a
           title that arrives with the read after the navigation has started
           grew the field by a line or two in one frame at the end of the
           transition (the procedure screen measured 91px). A rename
           crossfades the words, and the wrapper travels the height when the
           new words wrap differently. -->
      <div use:resize>
        <SectionHeading text={titleOf(stored)} sub={whenLine(stored)} crossfade />
      </div>
      {#key visitState}
      <div class="state-log" data-state-log={visitState} in:stateIn out:crossfade>
      {#if visitState === 'upcoming'}
        <AppointmentPrep read={checklistQuery} />
        <div style="margin-top:var(--space-4)">
          {#if updates.length}{@render updatesBlock()}{/if}
          {@render noteBlock()}
        </div>

      {:else if visitState === 'past'}
        <!-- The debrief first, since it is what a visit behind you asks of
             you: the entry written for this visit, or on the most recent
             visit the offer to write one. Then the note, for an outcome in a
             line or two. -->
        {#if debriefEntryId !== null || showDebriefOffer}
          <div style="margin-bottom:var(--space-4)" transition:collapse>
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.log)}>
              {#if debriefEntryId !== null}
                <ListRow
                  key="debrief"
                  icon="book"
                  title={m.appointment_debrief_row()}
                  subtitle={dayShort(stored.epochDay!)}
                  href={`/entry/${debriefEntryId}`}
                />
              {:else}
                <ListRow
                  key="debrief-offer"
                  data-visit-debrief-offer=""
                  icon="book"
                  title={m.debrief_offer_title()}
                  subtitle={[dayShort(stored.epochDay!), m.debrief_offer_write()]}
                  href={`/entry/new/today?debriefFor=${stored.id}`}
                  action={{
                    icon: 'x',
                    label: m.dismiss(),
                    onclick: () => journal.checklists.setDebriefDismissed(stored!.id),
                    attrs: { 'data-dismiss-debrief': '' }
                  }}
                />
              {/if}
            </ListCard>
          </div>
        {/if}
        {@render noteBlock()}
        {#if updates.length}{@render updatesBlock()}{/if}

      {:else}
        {@render updatesBlock()}
        {@render noteBlock()}
      {/if}
      </div>
      {/key}

      <!-- A consult: the surgery journey it belongs to, one tap from here. -->
      {#if stored.procedureId && procedureName}
        <div transition:collapse>
          <SectionHeading text={m.appointment_journey_heading()} />
          <div class="screen-part">
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.appointment)}>
              <ListRow
                key="appointment-procedure"
                data-appointment-procedure={stored.procedureId}
                icon="clipboard"
                title={procedureName}
                href={`/health/surgery/${stored.procedureId}`}
              />
            </ListCard>
          </div>
        </div>
      {/if}

      <!-- The appointment's own facts, edited where they stand. Last,
           because they change least once the visit is booked; the log above
           is what gets written to around it. -->
      <div bind:this={detailsEl}>
        <SectionHeading text={m.details_title()} />
      </div>
      <fieldset class="appointment-details" disabled={detailsWrite.busy} aria-busy={detailsWrite.busy}>
        <AppointmentFields
          bind:kind={draft.kind}
          bind:providerId={draft.providerId}
          bind:place={draft.place}
          bind:cost={draft.cost}
          bind:date={draft.date}
          bind:time={draft.time}
          bind:referred={draft.referred}
          began={updates.length > 0}
          onNewProvider={() => providerSheet?.open(null, (id) => { draft.providerId = id; })}
        />
        <!-- One button to a line. Laid inline, the way a `.stack-3` of
             buttons lays out, the calendar button arriving beside Save when
             a wait was given a day dropped Save 12px in one frame. -->
        <div class="details-actions">
          <button class="btn btn-primary press" data-save-appointment disabled={!canSaveDetails} onclick={saveDetails}>
            <span>{m.save_changes()}</span>
          </button>
          <!-- The committed day, even while the fields hold another one
               (docs/ui-copy.md); a wait has nothing to hand to a calendar.
               It opens its own height when a save gives a wait its day, so
               Delete travels down rather than jumping. -->
          {#if stored.epochDay !== null}
            <div class="action-slot" transition:collapse>
              <button class="btn btn-soft press" data-add-to-calendar onclick={() => (calendarSheet = true)}>
                <span>{m.calendar_handoff_button()}</span>
              </button>
            </div>
          {/if}
          <div class="action-slot">
            <button class="btn btn-ghost press" data-delete-appointment onclick={() => (confirmingDelete = true)}>
              <span>{m.appointments_delete_sheet()}</span>
            </button>
          </div>
        </div>
      </fieldset>
    </div>

    {#if stored.epochDay !== null}
      <CalendarHandoffSheet
        open={calendarSheet}
        kind="appointment"
        epochDay={stored.epochDay}
        time={stored.time}
        onClose={() => (calendarSheet = false)}
      />
    {/if}

    <ConfirmDeleteSheet
      open={confirmingDelete}
      title={m.appointments_delete_sheet()}
      question={m.appointments_delete_q()}
      hint={stored.epochDay === null ? titleOf(stored) : dayLabel(stored.epochDay)}
      confirmLabel={m.delete()}
      cancelLabel={m.keep_it()}
      confirmAttrs={{ 'data-confirm-delete-appointment': '' }}
      onConfirm={deleteAppointment}
      onCancel={() => { confirmingDelete = false; removing.dismiss(); }}
      busy={removing.busy}
      failed={removing.failed}
    />
  {/if}

  <ProviderSheet bind:this={providerSheet} providers={providersQuery.rows} />
</div>

<DiscardSheet guard={detail.guard} />

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .details-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  /* The gap is inside each slot rather than between them, so a slot that
     opens or closes takes its gap with it. */
  .action-slot {
    padding-top: var(--space-3);
  }
</style>
