<script lang="ts">
  /* Appointments (phase 8 features ticket 57, ADR-0066): every visit this
     person has written down, the booked ones and the ones already behind
     them.

     TWO LISTS, ONE ORDER APIECE. What is coming up reads soonest first,
     because the next one is the one being prepared for; what has been reads
     newest first, the way every other log on this app reads. Today's
     appointment counts as coming up until the day is over, which is the same
     line the debrief has always drawn.

     One record type, both cases. A visit attached to a surgery journey is an
     appointment with the journey named on it, not a second kind of row - the
     surgery screen still calls those consults and still adds and removes
     them there (ADR-0066).

     The kind is a free text field with no list of its own. What sits under
     it is the kinds this journal has already used, as chips, because a
     suggestion the person wrote themselves is the only kind the app is
     entitled to make: a built-in endocrinologist/psychologist/surgeon list
     would be a picture of a medical path. On an empty journal there are no
     chips and the field is simply blank.

     The prep list is a row at the bottom rather than a section of this
     screen. It is a standing list that outlives any one appointment
     (ADR-0066), so it is not this screen's content; ticket 58 is what
     changes where its date comes from. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import type { Appointment } from '$lib/data/types';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { appointmentOnDay } from '$lib/data/journal/appointments';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const today = todayEpochDay();
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let appointments = $derived(appointmentsQuery.rows);

  /* The procedure names, so a consult can say which journey it belongs to
     without this screen holding a second idea of what a procedure is. */
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedureNames = $derived(new Map(proceduresQuery.rows.map((p) => [p.id, p.name])));

  let kindsQuery = liveList((j) => j.appointments.getKinds());

  let upcoming = $derived(appointments.filter((a) => a.epochDay >= today));
  let past = $derived([...appointments].reverse().filter((a) => a.epochDay < today));

  /* The visit today, if there is one - what the in-the-room row is for
     (ticket 60). appointments.ts's own selector rather than a read off
     `upcoming`, so this screen's row and the screen it leads to cannot
     disagree about which appointment they mean. */
  let todaysAppointment = $derived(appointmentOnDay(appointments, today));

  const titleOf = (appointment: Appointment) =>
    appointment.kind ??
    (appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined) ??
    m.appointments_untitled();

  /** The day always, then wherever it was, then which journey it belongs to
      where the kind has not already said. Nothing invented: each part is on
      the row or on the procedure it names. */
  function subtitleOf(appointment: Appointment): string[] {
    const journey = appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined;
    return [
      dayLabel(appointment.epochDay),
      appointment.place ?? undefined,
      appointment.kind && journey ? journey : undefined
    ].filter((part): part is string => part !== undefined);
  }

  type Draft = { id?: string; date: string; kind: string; place: string; note: string; procedureId: string | null };

  const record = recordEditor<Appointment, Draft>({
    blank: () => ({
      date: dateInputValueFromEpochDay(today),
      kind: '',
      place: '',
      note: '',
      procedureId: null
    }),
    fromRecord: (appointment) => ({
      id: appointment.id,
      date: dateInputValueFromEpochDay(appointment.epochDay),
      kind: appointment.kind ?? '',
      place: appointment.place ?? '',
      note: appointment.note ?? '',
      // Carried through the editor untouched: this screen never sets a
      // procedure link and never drops one either, so editing a consult
      // here leaves it on its journey.
      procedureId: appointment.procedureId
    }),
    async upsert(draft) {
      await journal.appointments.upsertAppointment({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        procedureId: draft.procedureId,
        kind: draft.kind,
        place: draft.place,
        note: draft.note
      });
    },
    remove: (id) => journal.appointments.deleteAppointment(id),
    findById: (id) => appointments.find((appointment) => appointment.id === id)
  });
</script>

{#snippet list(rows: Appointment[])}
  <ListCard role={roleAt(activeFlag.roles, 0)}>
    {#each rows as appointment (appointment.id)}
      <!-- `calendar` rather than the `check` the hub row wears. The hub's
           icon is fixed - it is the prep list's, kept through the rename
           (ADR-0066), and `calendar` is already spoken for there by cycle
           events - but a lit tick beside a visit three weeks out says that
           visit already happened. `calendar` is the app's own glyph for an
           appointment date: the prep list's "Last appointment" row has worn
           it since ticket 11. -->
      <ListRow
        key={appointment.id}
        data-appointment={appointment.id}
        icon="calendar"
        title={titleOf(appointment)}
        subtitle={subtitleOf(appointment)}
        chevron={false}
        onclick={() => record.openEditor(appointment)}
      />
    {/each}
  </ListCard>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.appointments_title()} back="/more" subtitle={m.appointments_intro()}>
    {#snippet actions()}
      <button
        class="icon-btn press"
        data-add
        aria-label={m.appointments_add_aria()}
        onclick={() => record.openEditor(null)}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={appointmentsQuery} variant="line" count={3}>
    {#snippet rows()}
      <!-- The way into the room, on the day (phase 8 features ticket 60).
           Above both lists rather than inside one: on the morning of a visit
           it is what this screen is for, and a row that only exists on one
           day of the month should not have to be found among the bookings.
           It names the appointment underneath it, so it is that appointment's
           way in rather than a second general link to the prep list. -->
      {#if todaysAppointment}
        <div class="screen-part">
          <ListCard role={roleAt(activeFlag.roles, 1)}>
            <ListRow
              key="in-the-room"
              icon="bookmark"
              title={m.in_the_room_title()}
              subtitle={titleOf(todaysAppointment)}
              href="/health/appointments/in-the-room"
            />
          </ListCard>
        </div>
      {/if}
      {#if upcoming.length}
        <SectionHeading text={m.appointments_upcoming_heading()} />
        <div class="screen-part" data-upcoming>{@render list(upcoming)}</div>
      {/if}
      {#if past.length}
        <SectionHeading text={m.appointments_past_heading()} />
        <div class="screen-part" data-past>{@render list(past)}</div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="calendar"
          key="appointments-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.appointments_empty_title()}
          text={m.appointments_empty_body()}
          action={{ label: m.appointments_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <!-- The standing list of what to ask, which belongs to no one appointment
       and so is a way out of this screen rather than a part of it. -->
  <div class="screen-part">
    <ListCard role={roleAt(activeFlag.roles, 1)}>
      <!-- `check` because that is the prep list's own icon, and this row is
           the way to it: the disc says where a row leads. -->
      <ListRow
        key="appointment-prep"
        icon="check"
        title={m.appointment_prep_title()}
        subtitle={m.appointments_prep_sub()}
        href="/health/appointment-prep"
      />
    </ListCard>
  </div>

  <RecordSheet
    {record}
    handle="appointment"
    newTitle={m.appointments_new_sheet()}
    editTitle={m.appointments_edit_sheet()}
    saveLabel={m.appointments_save()}
    deleteLabel={m.appointments_delete()}
    confirm={{
      title: m.appointments_delete_sheet(),
      question: () => m.appointments_delete_q(),
      hint: (appointment) => dayLabel(appointment.epochDay),
      confirmLabel: m.appointments_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.appointments_day_label()} id="appointment-date">
        {#snippet children(id)}
          <DatePicker name="appointment-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.appointments_kind_label()} id="appointment-kind">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="appointment-kind"
            placeholder={m.appointments_kind_placeholder()}
            bind:value={editor.kind}
          />
        {/snippet}
      </Field>
      {#if kindsQuery.rows.length}
        <!-- The person's own previous kinds, and nothing else ever
             (ADR-0066). A chip fills the field rather than toggling a
             value, so what is stored is still whatever is in the input.

             Pulled up under the field it belongs to rather than sitting at
             the sheet's own field rhythm, which read as a third control
             between Kind and Place. The line under them says what they are;
             it is here rather than in `Field`'s `hint`, which renders at
             label weight and would put two bold lines above an empty
             input. Neither exists on a journal that has never named a
             kind, because there is nothing to explain and nothing ships. -->
        <div class="ap-kinds">
          <div class="tag-row" role="group" aria-label={m.appointments_kind_label()}>
            {#each kindsQuery.rows as kind (kind)}
              <button
                class="tag-chip press"
                class:is-selected={editor.kind === kind}
                aria-pressed={editor.kind === kind}
                data-kind={kind}
                onclick={() => (editor.kind = kind)}
              >
                {kind}
              </button>
            {/each}
          </div>
          <p class="muted small">{m.appointments_kind_suggestions()}</p>
        </div>
      {/if}
      <Field label={m.appointments_place_label()} id="appointment-place">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="appointment-place"
            placeholder={m.appointments_place_placeholder()}
            bind:value={editor.place}
          />
        {/snippet}
      </Field>
      <Field label={m.appointments_note_label()} id="appointment-note">
        {#snippet children(id)}
          <textarea
            class="input"
            {id}
            name="appointment-note"
            rows="3"
            placeholder={m.appointments_note_placeholder()}
            bind:value={editor.note}
          ></textarea>
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>

<style>
  /* The chips answer the field above them, so they sit against it rather
     than at the gap between two fields. `--space-2` up, the sheet's own
     field gap below - the same "tight group, generous separation" the kit
     keeps everywhere else. */
  .ap-kinds {
    margin-top: calc(var(--space-2) * -1);
  }

  .ap-kinds .muted {
    margin-top: var(--space-2);
  }
</style>
