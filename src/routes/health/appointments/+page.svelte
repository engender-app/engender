<script lang="ts">
  /* The visit (phase 8 features ticket 57, phase 11 all-four-doors ticket 12,
     ADR-0066): one screen for the next appointment, what you want to raise at
     it, and the ones already behind you.

     ONE RECORD, ONE SCREEN. ADR-0066 decided there is one appointment record
     and `hubRows.ts` said the rest in as many words - "prep, the record and
     the debrief were three descriptions of one thing, and the one that names
     it is the one that stays". The routes did not follow until this ticket:
     `/health/appointment-prep` was the visit's real index (it carried In the
     room, the debrief, the clinician summary and the next appointment's date)
     while the screen named after the record was four rows long. The prep list
     is a section here now and its address is a stub.

     THE PREP LIST IS STILL STANDING AND UNOWNED. It is a section of this
     screen rather than a property of the appointment on it: nothing ticks
     itself off when a visit ends, the list is readable on a day with nothing
     booked, and with no upcoming visit at all the screen opens on it under a
     line saying so. What changed is where it is drawn, not what owns it.

     THE GAP, AND WHERE A GAP MAY BE STATED. "in 12 days" beside the date is
     ADR-0067's amendment (Alicja, 16 September 2026): a gap may be stated on
     an area's own screen and on its hub or pinned row, and nowhere else that
     is new. 0067 still refuses one on a calendar mark, because a mark is a
     glance and a countdown is a demand; this screen is where somebody went to
     read about the appointment. The words are `hubLabels.ts`'s `gapTo`, the
     same arithmetic in the same units as the hub row above it, so the two
     surfaces cannot drift apart.

     TWO LISTS, ONE ORDER APIECE. What is still ahead reads soonest first,
     because the next one is the one being prepared for; what has been reads
     newest first, the way every other log on this app reads. Today's
     appointment counts as coming up until the day is over, which is the same
     line the debrief has always drawn (`appointments.ts`'s own selectors).

     The next visit is the screen's opening and is not repeated in a list
     under it - a second booking sits under "Later visits", which exists so
     that a visit in December is still something you can open and edit, not
     because the screen has two ideas of what is ahead.

     WHAT LEFT WITH THE MOVE. The prep screen's stock cards went in ticket 09
     (ADR-0084), "More than one regimen is running" is Care's sentence and is
     drawn on Care, and the regimen row went with it. Its two "since your last
     visit" readings - the labs and the side effects drawn between the last
     appointment and today - went too: the debrief this screen offers already
     opens pre-filled with both (`debriefNote.ts`, EntryEditor), which is
     where that reading does work rather than sitting as reference.

     The kind is a free text field with no list of its own. What sits under
     it is the kinds this journal has already used, as chips, because a
     suggestion the person wrote themselves is the only kind the app is
     entitled to make: a built-in endocrinologist/psychologist/surgeon list
     would be a picture of a medical path. On an empty journal there are no
     chips and the field is simply blank. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import type { Appointment, ChecklistItem } from '$lib/data/types';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { mostRecentPastAppointment, soonestFutureAppointment } from '$lib/data/journal/appointments';
  import { debriefOfferVisible } from '$lib/data/vocabulary/entryTemplates';
  import { gapTo } from '$lib/data/vocabulary/hubLabels';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import CalendarHandoffSheet from '$lib/components/CalendarHandoffSheet.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const today = todayEpochDay();
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const dayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

  /** How far off a day is, in the hub row's own grammar. A visit today says
      "today" rather than "in 0 days", the same split `milestoneStatus.ts`
      gives today its own case for. */
  const gapLabel = (epochDay: number) =>
    epochDay === today ? m.appointments_gap_today() : m.appointments_gap({ gap: gapTo(epochDay, today) });

  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let appointments = $derived(appointmentsQuery.rows);

  /* The procedure names, so a consult can say which journey it belongs to
     without this screen holding a second idea of what a procedure is. */
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedureNames = $derived(new Map(proceduresQuery.rows.map((p) => [p.id, p.name])));

  let kindsQuery = liveList((j) => j.appointments.getKinds());

  /* appointments.ts's own selectors rather than a read this screen invents:
     the visit that opens this screen, the room behind it and the debrief
     offer all have to mean the same appointment. `later` is what is left of
     the ahead half once the opening has taken the first of it. */
  let nextVisit = $derived(soonestFutureAppointment(appointments, today));
  let later = $derived(appointments.filter((a) => a.epochDay >= today && a.id !== nextVisit?.id));
  let past = $derived([...appointments].reverse().filter((a) => a.epochDay < today));
  let lastVisit = $derived(mostRecentPastAppointment(appointments, today));

  /* The debrief, scoped to the appointment it belongs to (checklists.ts,
     ticket 58): the offer where it is still open, the entry where one was
     written. One shape answers both, and `debriefOfferVisible` is the same
     pure predicate Home folds over the same read rather than a second
     statement of the rule. */
  let debriefStateQuery = liveQuery((j) => j.checklists.getDebriefState(lastVisit?.id ?? null));
  let debriefEntryId = $derived(debriefStateQuery.value?.debriefEntryId ?? null);
  let showDebriefOffer = $derived(!!debriefStateQuery.value && debriefOfferVisible(debriefStateQuery.value));

  let checklistQuery = liveList((j) => j.checklists.getStandaloneChecklist().then((c) => c?.items));
  let items = $derived(checklistQuery.rows);
  /* Only the way into the room reads this: the room takes the questions one
     per screen, so with none there is nothing for the row to open onto but
     its own empty state (ticket 71). */
  let hasQuestions = $derived(items.length > 0);

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

  /** What the opening block says under the kind: where it is and when, with
      the journey named where the kind has not already said it. The gap is a
      line of its own above this, so it is not repeated here. */
  function leadWhere(appointment: Appointment): string {
    const journey = appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined;
    return [
      appointment.place ?? undefined,
      appointment.kind && journey ? journey : undefined,
      dayLabel(appointment.epochDay)
    ]
      .filter((part): part is string => part !== undefined)
      .join(' · ');
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

  /* The prep item's own editor, for the one thing a prep row asks
     confirmation for. Separate from the appointment's above because they
     delete different records and carry different confirmations. */
  const item = recordEditor<ChecklistItem>({
    remove: (id) => journal.checklists.deleteItem(id),
    findById: (id) => items.find((each) => each.id === id)
  });

  let addSheet = $state(false);
  let newItemText = $state('');

  // Ticket 18: the date already sits in the editor's own draft, so the
  // handoff sheet reads it fresh rather than re-deriving it from the record.
  let calendarSheet = $state(false);

  function openAddSheet() {
    newItemText = '';
    addSheet = true;
  }

  async function addItem() {
    const content = newItemText.trim();
    if (!content) return;
    await journal.checklists.addToStandaloneChecklist(content);
    addSheet = false;
  }

  function toggleChecked(each: ChecklistItem) {
    journal.checklists.setItemChecked(each.id, !each.checked);
  }

  function toggleCarriedForward(each: ChecklistItem) {
    journal.checklists.setItemCarriedForward(each.id, !each.carriedForward);
  }
</script>

{#snippet list(rows: Appointment[])}
  <ListCard role={roleAt(activeFlag.roles, 0)}>
    {#each rows as appointment (appointment.id)}
      <!-- `calendar` rather than the `check` the hub row wears. The hub's
           icon is fixed - it is the prep list's, kept through the rename
           (ADR-0066), and `calendar` is already spoken for there by cycle
           events - but a lit tick beside a visit three weeks out says that
           visit already happened. `calendar` is the app's own glyph for an
           appointment date. -->
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
        class="icon-btn"
        data-add
        aria-label={m.appointments_add_aria()}
        onclick={() => record.openEditor(null)}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- The opening (DIRECTION.md rule 16): what is true now, before any log.
       A block rather than a row, because the gap is the reading and a row
       would put it in a subtitle beside the address. It opens the editor, so
       the one record on the screen is still the one you change. -->
  <ReadGate read={appointmentsQuery} variant="block" count={1}>
    {#snippet rows()}
      <div class="screen-part">
        {#if nextVisit}
          <button
            class="visit-lead"
            data-visit-lead
            data-appointment={nextVisit.id}
            onclick={() => record.openEditor(nextVisit!)}
            {...roleAttrs(roleAt(activeFlag.roles, 0))}
          >
            <span class="visit-lead-kind">{titleOf(nextVisit)}</span>
            <span class="visit-lead-gap" data-visit-gap>{gapLabel(nextVisit.epochDay)}</span>
            <span class="visit-lead-where">{leadWhere(nextVisit)}</span>
          </button>
        {:else}
          <!-- Nothing booked is an ordinary state, not an empty journal: the
               prep list under this is standing and is still worth reading,
               and the add control is in the header where it always is. -->
          <Notice
            icon="calendar"
            key="appointments-nothing-booked"
            role={roleAt(activeFlag.roles, 0)}
            title={m.appointments_nothing_booked()}
          />
        {/if}
      </div>
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

  <!-- What to raise: the standing list, on the visit it is being kept for. -->
  <SectionHeading text={m.appointments_prep_heading()}>
    {#snippet action()}
      <button class="icon-btn" data-add-prep aria-label={m.appointment_prep_add_aria()} onclick={openAddSheet}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </SectionHeading>

  <ReadGate read={checklistQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          <!-- Hand-rolled rather than ListRow (ticket 16): two trailing
               actions (carry-forward flag, delete) where `action` takes
               one, and a checkbox main that's role="checkbox" with its own
               .ap-box rather than ListRow's checked semantics.

               Each row opens and closes its own height (ADR-0078), so an
               item added from the sheet arrives by moving rather than
               appearing where it lands. -->
          {#each items as each (each.id)}
            <div class="kit-row is-split" data-appointment-item={each.id} transition:collapse>
              <button
                class="kit-row-main"
                role="checkbox"
                aria-checked={each.checked}
                aria-label={each.checked ? m.appointment_prep_uncheck_aria({ content: each.content }) : m.appointment_prep_check_aria({ content: each.content })}
                onclick={() => toggleChecked(each)}
              >
                <span class="ap-box" class:ap-ticked={each.checked}>
                  {#if each.checked}<Icon name="check" size={20} />{/if}
                </span>
                <span class="kit-row-text">
                  <span class="kit-row-title" class:ap-done={each.checked}>{each.content}</span>
                </span>
              </button>
              <button
                class="kit-row-act"
                class:ap-flagged={each.carriedForward}
                data-carry-forward={each.id}
                aria-pressed={each.carriedForward}
                aria-label={each.carriedForward ? m.appointment_prep_uncarry_aria({ content: each.content }) : m.appointment_prep_carry_aria({ content: each.content })}
                onclick={() => toggleCarriedForward(each)}
              >
                <Icon name="flag" size={18} />
              </button>
              <button
                class="kit-row-act"
                data-delete-appointment-item={each.id}
                aria-label={m.appointment_prep_delete_aria({ content: each.content })}
                onclick={() => item.askToDelete(each)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </ListCard>
        <!-- What the flag beside each row does. It was a bare icon with an
             aria-label, so the only people the app told were the ones using a
             screen reader (Alicja, 2026-08-26: "what does the flag do in
             appointment check list?"). Under the list rather than in the
             screen's own intro, because it is about a control that is only on
             screen once there is something to flag. -->
        <p class="muted small">{m.appointment_prep_flag_hint()}</p>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="check"
          key="appointment-prep-empty"
          role={roleAt(activeFlag.roles, 1)}
          title={m.appointment_prep_empty_title()}
          text={m.appointment_prep_empty_body()}
          action={{ label: m.appointment_prep_empty_action(), primary: true, onclick: openAddSheet }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <!-- The two verbs. Both are things done at the visit rather than records of
       it, which is why they are a section and not two more rows on a list. -->
  <SectionHeading text={m.appointments_verbs_heading()} />
  <div class="screen-part">
    <ListCard role={roleAt(activeFlag.roles, 2)}>
      {#if hasQuestions}
        <ListRow
          key="in-the-room"
          icon="bookmark"
          title={m.in_the_room_title()}
          subtitle={m.in_the_room_row_sub()}
          href="/health/appointments/in-the-room"
        />
      {/if}
      <ListRow
        key="clinician-summary"
        icon="share"
        title={m.clinician_summary_row()}
        subtitle={m.clinician_summary_row_sub()}
        href="/health/clinician-summary"
      />
    </ListCard>
  </div>

  {#if later.length}
    <SectionHeading text={m.appointments_later_heading()} />
    <div class="screen-part" data-later>{@render list(later)}</div>
  {/if}

  {#if past.length}
    <SectionHeading text={m.appointments_past_heading()} />
    <div class="screen-part" data-past>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each past as appointment (appointment.id)}
          <ListRow
            key={appointment.id}
            data-appointment={appointment.id}
            icon="calendar"
            title={titleOf(appointment)}
            subtitle={subtitleOf(appointment)}
            chevron={false}
            onclick={() => record.openEditor(appointment)}
          />
          <!-- The debrief belongs to the most recent visit and to no other:
               one entry is linked at a time (checklists.ts), and back-filling
               history is entering a record rather than living through a
               visit. It sits under that visit's own row rather than in a
               notice of its own, so it cannot read as the debrief of the row
               above or below it - and it opens and closes its height, so the
               offer arrives by moving (ADR-0078). -->
          {#if appointment.id === lastVisit?.id && showDebriefOffer}
            <div transition:collapse>
              <ListRow
                key="debrief-offer"
                data-debrief-offer=""
                icon="book"
                title={m.debrief_offer_title()}
                subtitle={m.debrief_offer_write()}
                href={`/entry/new/today?debriefFor=${appointment.id}`}
                action={{
                  icon: 'x',
                  label: m.dismiss(),
                  onclick: () => journal.checklists.setDebriefDismissed(appointment.id),
                  attrs: { 'data-dismiss-debrief': '' }
                }}
              />
            </div>
          {:else if appointment.id === lastVisit?.id && debriefEntryId !== null}
            <div transition:collapse>
              <ListRow
                key="debrief"
                icon="book"
                title={m.appointment_debrief_row()}
                subtitle={dayShort(appointment.epochDay)}
                href={`/entry/${debriefEntryId}`}
              />
            </div>
          {/if}
        {/each}
      </ListCard>
    </div>
  {/if}

  <Sheet open={addSheet} title={m.appointment_prep_new_sheet()} onClose={() => (addSheet = false)}>
    <h3>{m.appointment_prep_new_sheet()}</h3>
    <Field label={m.appointment_prep_new_sheet()} id="appointment-prep-input" hidden>
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="appointment-prep-input"
          placeholder={m.appointment_prep_placeholder()}
          bind:value={newItemText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-appointment-item onclick={addItem}><span>{m.appointment_prep_add()}</span></button>
  </Sheet>

  <RecordSheet
    record={item}
    handle="appointment-item"
    confirm={{
      title: m.appointment_prep_delete_sheet(),
      question: () => m.appointment_prep_delete_q(),
      hint: (each) => each.content,
      confirmLabel: m.appointment_prep_delete(),
      cancelLabel: m.keep_it()
    }}
  />

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
                class="tag-chip"
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
    {#snippet extraActions()}
      <button class="btn btn-soft" data-add-to-calendar onclick={() => (calendarSheet = true)}>
        <span>{m.calendar_handoff_button()}</span>
      </button>
    {/snippet}
  </RecordSheet>

  <CalendarHandoffSheet
    open={calendarSheet}
    kind="appointment"
    epochDay={epochDayFromDateInputValueOrToday(record.editor?.date ?? '')}
    onClose={() => (calendarSheet = false)}
  />
</div>

<style>
  /* The opening block: the area's own stripe at its real hex with the visit
     written on it, the same material a tile is (DIRECTION.md rule 3). The
     gap is the reading and takes the display face; the kind names it above,
     and where and when sit under it in the quiet half of the block's ink.

     It is a whole block rather than a row, so it takes press.css's default
     scale the way a tile does - what a full-width list row cannot do without
     moving the card around it. No transform of its own here, which is what
     leaves that default reachable. */
  .visit-lead {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-4);
    background: var(--role-draw);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    text-align: left;
    cursor: pointer;
    /* A block arrives by clipping open from its own left edge (rule 10,
       ADR-0078), the same movement `kit-block-in` gives a tile. Filled both
       ways so the reduced-motion clamp ends it where it rests, and outset by
       6px for the focus ring's sake. */
    animation: visit-lead-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes visit-lead-in {
    from { clip-path: inset(-6px 100% -6px -6px round var(--r-block)); }
    to { clip-path: inset(-6px round var(--r-block)); }
  }

  .visit-lead-kind {
    font-size: var(--text-block);
    font-weight: var(--weight-bold);
  }

  /* The one figure on the screen, at the display face and the size the kit
     gives a number written on a block: somebody opening this screen is
     asking how long they have. `balance` because the Polish reads "za 1 rok
     4 miesiące" where the English reads "in 12 days". */
  .visit-lead-gap {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-display);
    line-height: var(--leading-display);
    letter-spacing: var(--display-track);
    text-wrap: balance;
  }

  /* No opacity on it: text on a flag fill has an ink already
     (--role-fill-ink), and fading that ink is how a contrast floor gets
     lost on the palettes whose band is light. Size carries the hierarchy
     instead. */
  .visit-lead-where {
    font-size: var(--text-sm);
  }

  /* Same checkbox-square treatment roadmap's page uses for its ticks, and
     the same struck-through-when-done rule - a checked item is not hidden or
     removed, only marked handled. */
  .ap-box {
    border: 2px solid var(--outline);
    border-radius: var(--r-block);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    /* Tier 1, response: the square is not the control - the row is - so
       what answers the tap here is the tick landing rather than a press
       depth. The border and the colour cross on --dur-fast, and the
       reduced-motion path keeps both because a colour change is the
       feedback rather than the movement. */
    transition:
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .ap-ticked {
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  .ap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .ap-flagged {
    color: var(--role-mark);
  }

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
