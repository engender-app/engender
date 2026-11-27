<script lang="ts">
  import type { TransitionConfig } from 'svelte/transition';
  /* Appointments use one record and shared fields for visits and waits (ADR-0066).
     Show the nearest visit first, then waits. Later visits sort soonest first and
     past visits newest first. Today stays upcoming through the day. Use gapTo on
     the visit and hub, and omit countdowns from calendar marks (ADR-0067).
     Waits lack a date and show time since referral. Prep is available without a
     visit. Debrief opens EntryEditor with lab and side-effect context. */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery, type LiveList } from '$lib/data/live/journal.svelte';
  import type {
    Appointment, AppointmentStatusUpdate, Provider, ProviderCompetence, WaitingAppointment
  } from '$lib/data/types';
  import { fmtDay, fmtDuration, fmtTime } from '$lib/data/dates';
  import { epochDayFromDateInputValue, dateInputValueFromEpochDay, timestampAtLocalTime } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { mostRecentPastAppointment, soonestFutureAppointment, waitingSince } from '$lib/data/journal/appointments';
  import { debriefOfferVisible } from '$lib/data/vocabulary/debriefOffer';
  import { gapTo } from '$lib/data/vocabulary/hubLabels';
  import AppointmentFields from '$lib/components/AppointmentFields.svelte';
  import AppointmentPrep from '$lib/components/AppointmentPrep.svelte';
  import ProviderSheet from '$lib/components/ProviderSheet.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { blankCostDraft, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import { costLine } from '$lib/data/vocabulary/costLabel';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { collapse, crossfade, resize } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const today = $derived(currentDay());
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const dayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

  /** How far off a day is, in the hub row's own grammar. A visit today says
      "today" rather than "in 0 days", the same split `milestoneStatus.ts`
      gives today its own case for. */
  const gapLabel = (epochDay: number) =>
    epochDay === today ? m.appointments_gap_today() : m.appointments_gap({ gap: gapTo(epochDay, today) });

  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let appointments = $derived(appointmentsQuery.rows);

  let waitingQuery = liveList((j) => j.appointments.getWaiting());
  let waiting = $derived(waitingQuery.rows);
  let statusQuery = liveList((j) => j.appointments.getStatusUpdates());
  /* Each appointment's updates, newest first: the row states the latest. */
  let statusesOf = $derived.by(() => {
    const byAppointment = new Map<string, AppointmentStatusUpdate[]>();
    for (const update of statusQuery.rows) {
      const found = byAppointment.get(update.appointmentId);
      if (found) found.unshift(update);
      else byAppointment.set(update.appointmentId, [update]);
    }
    return byAppointment;
  });

  /* The procedure names, so a consult can say which journey it belongs to
     without this screen holding a second idea of what a procedure is. */
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedureNames = $derived(new Map(proceduresQuery.rows.map((p) => [p.id, p.name])));

  /* The people this person sees, by name, and each one's name
     by id so a row can say who without a second read. */
  let providersQuery = liveList((j) => j.appointments.getProviders());
  let providerNames = $derived(new Map(providersQuery.rows.map((p) => [p.id, p.name])));
  const whoOf = (appointment: Appointment | WaitingAppointment) =>
    appointment.providerId ? providerNames.get(appointment.providerId) : undefined;

  const competenceLine: Record<ProviderCompetence, () => string> = {
    good: m.provider_competence_good_line,
    mixed: m.provider_competence_mixed_line,
    poor: m.provider_competence_poor_line
  };

  /** A day, and its time where the appointment keeps one, in the reader's
      own clock. */
  const withTime = (day: string, appointment: Appointment) =>
    appointment.time
      ? m.appointments_day_time({ day, time: fmtTime(timestampAtLocalTime(appointment.epochDay, appointment.time)) })
      : day;

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

  /* The visit summary above and the prep checklist below each gate on their
     own read (ReadGate), and the two don't always land in the same tick: on
     a cold load, whichever answers second grows its own block in a frame
     after the first one has already eased into its resting height - the
     block between them (its heading, its screen part, its list) rode the
     first read's settle up a few px, then the checklist's own growth shoved
     it and everything after it back down, a direction reversal. Neither ReadGate sees the other's read, so `gateTogether`
     holds each one at "loading" until both have answered - one combined
     resize instead of two, a frame apart. Latched like `visitsRevealed`
     further down: once both have answered once, a later refetch of
     either (stale, not loading) must not put either placeholder back. */
  let visitAndPrepAnswered = $state(false);
  $effect.pre(() => {
    if (!appointmentsQuery.loading && !waitingQuery.loading && !statusQuery.loading && !checklistQuery.loading)
      visitAndPrepAnswered = true;
  });
  /* `alsoEmpty` for the opening's gate, which also draws the waits: a
     journal holding only a wait is not an empty one. */
  function gateTogether<T>(list: LiveList<T>, alsoEmpty: () => boolean = () => true): LiveList<T> {
    return {
      get rows() {
        return list.rows;
      },
      get loading() {
        return !visitAndPrepAnswered || list.loading;
      },
      get empty() {
        return list.empty && alsoEmpty();
      },
      get failed() {
        return list.failed;
      },
      get stale() {
        return list.stale;
      },
      retry: () => list.retry()
    };
  }
  const gatedAppointmentsQuery = gateTogether(appointmentsQuery, () => waitingQuery.empty);
  const gatedChecklistQuery = gateTogether(checklistQuery);

  const screenOf = (appointment: Appointment | WaitingAppointment) => `/health/appointments/${appointment.id}`;

  const titleOf = (appointment: Appointment | WaitingAppointment) =>
    appointment.kind ??
    (appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined) ??
    m.appointments_untitled();

  /** The day always, then wherever it was, then which journey it belongs to
      where the kind has not already said. Nothing invented: each part is on
      the row or on the procedure it names. */
  function subtitleOf(appointment: Appointment): string[] {
    const journey = appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined;
    return [
      withTime(dayLabel(appointment.epochDay), appointment),
      appointment.place ?? undefined,
      whoOf(appointment),
      appointment.kind && journey ? journey : undefined,
      costLine(appointment.cost) ?? undefined
    ].filter((part): part is string => part !== undefined);
  }

  /** The day the opening block states: the weekday, and no year.

      The weekday is what somebody checks a booking against ("is that the
      Tuesday I am away?"). The year is the one part of the date this block
      does not need, because the line above it already says how far off the
      day is. The rows in the lists below keep the full date: nothing there
      states a gap, so nothing there can leave the year out. */
  const leadDay = (appointment: Appointment) =>
    withTime(fmtDay(appointment.epochDay, { weekday: 'long', day: 'numeric', month: 'long' }), appointment);

  /** The opening block's words cross when its visit changes: the new ones
      fade in where they rest, the old ones fade off out of flow behind them
      (`crossfade`), pinned to the top of their own line. Bidirectional, so
      Svelte asks with 'both' and is handed a function to ask again with the
      direction, the shape `crossfade` itself takes. */
  function leadLine(
    node: Element,
    params?: unknown,
    options?: { direction?: 'in' | 'out' | 'both' }
  ): TransitionConfig {
    if (options?.direction === 'both') {
      return ((each?: { direction: 'in' | 'out' }) => leadLine(node, params, each)) as unknown as TransitionConfig;
    }
    const transition = crossfade(node, params, options);
    if (options?.direction === 'out') {
      const style = (node as HTMLElement).style;
      style.top = '0';
      style.left = '0';
    }
    return transition;
  }

  /** Where the opening block's visit is, with the journey named where the
      kind has not already said it - or nothing, on a visit with neither.

      Its own line rather than joined to the day above it. At 390px the two
      together run four characters past the block and wrap, which leaves one
      word of the date alone on a second line; two lines by construction read
      as place then day rather than as an accident. */
  function leadWhere(appointment: Appointment): string {
    const journey = appointment.procedureId ? procedureNames.get(appointment.procedureId) : undefined;
    return [appointment.place ?? undefined, whoOf(appointment), appointment.kind && journey ? journey : undefined]
      .filter((part): part is string => part !== undefined)
      .join(' · ');
  }

  /** How long a wait has been, as a fact: the elapsed time, then the
      referred-on day it counts from, short so the line wraps once at most
      at 390px. Nothing when that day is not known. */
  function waitingLine(appointment: WaitingAppointment): string | undefined {
    const since = waitingSince(appointment.referredEpochDay, today);
    if (since === null || appointment.referredEpochDay === null) return undefined;
    return appointment.referredEpochDay === today
      ? m.appointments_waiting_since_today()
      : m.appointments_waiting_since({
          day: fmtDay(appointment.referredEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
          duration: fmtDuration(since)
        });
  }

  const updateLine = (update: AppointmentStatusUpdate) =>
    m.appointments_update_line({ day: dayShort(update.epochDay), status: update.status });

  function waitingSubtitle(appointment: WaitingAppointment): (string | undefined)[] {
    const latest = statusesOf.get(appointment.id)?.[0];
    return [
      waitingLine(appointment), appointment.place ?? undefined, whoOf(appointment), latest ? updateLine(latest) : undefined,
      costLine(appointment.cost) ?? undefined
    ];
  }

  type Draft = {
    id?: string;
    date: string;
    referred: string;
    kind: string;
    place: string;
    note: string;
    /** `HH:MM` or empty. */
    time: string;
    providerId: string | null;
    cost: CostDraft;
  };

  /* A new appointment only: editing one happens on its own screen. A new
     wait opens with no day and today as the referred-on day; the header's
     add keeps today as the day, which is what ui-copy.md asks of an
     appointment. `waitingDraft` is read by `blank` at the moment the sheet
     opens, and names the sheet: the title is fixed by how the sheet opened
     rather than by the day field, so clearing or setting the day mid-edit
     never swaps the heading's text in one frame. */
  let waitingDraft = false;

  const record = recordEditor<Appointment | WaitingAppointment, Draft>({
    blank: () => ({
      date: waitingDraft ? '' : dateInputValueFromEpochDay(today),
      referred: waitingDraft ? dateInputValueFromEpochDay(today) : '',
      kind: '',
      place: '',
      note: '',
      time: '',
      providerId: null,
      cost: blankCostDraft(deviceDefaultCurrency())
    }),
    async upsert(draft) {
      await journal.appointments.upsertAppointment({
        epochDay: epochDayFromDateInputValue(draft.date),
        referredEpochDay: epochDayFromDateInputValue(draft.referred),
        procedureId: null,
        kind: draft.kind,
        place: draft.place,
        note: draft.note,
        // A wait has no time: clearing the day hides the field, and what
        // it held is not kept behind it.
        time: draft.date ? draft.time : null,
        providerId: draft.providerId,
        cost: costFromDraft(draft.cost)
      });
    },
    findById: (id) =>
      appointments.find((appointment) => appointment.id === id) ?? waiting.find((appointment) => appointment.id === id)
  });

  function openNew(asWait: boolean) {
    waitingDraft = asWait;
    record.openEditor(null);
  }

  /* The provider's own sheet, opened from the list at the foot
     of the screen, or from "Someone new" in the new appointment's fields,
     which picks what is saved there. */
  let providerSheet = $state<ProviderSheet>();

  const providerSubtitle = (provider: Provider) =>
    [provider.competence ? competenceLine[provider.competence]() : undefined, provider.contact ?? undefined]
      .filter((part): part is string => part !== undefined);

  /* Latched: a reserve must not put its placeholder back. */
  let visitsRevealed = $state(false);
  $effect.pre(() => {
    if (!appointmentsQuery.loading) visitsRevealed = true;
  });
  const visitsEstimate = readReserve('appointments-visits');
  const visitsRemember = (px: number) => rememberReserve('appointments-visits', px);
</script>

<!-- One visit as a row of a list. `calendar` rather than the `check` the hub
     row wears: the hub's icon is fixed - it is the prep list's, kept through
     the rename (ADR-0066), and `calendar` is already spoken for there by
     cycle events - but a lit tick beside a visit three weeks out says that
     visit already happened. `calendar` is the app's own glyph for an
     appointment date. -->
{#snippet visitRow(appointment: Appointment)}
  <ListRow
    key={appointment.id}
    data-appointment={appointment.id}
    icon="appointment"
    title={titleOf(appointment)}
    subtitle={subtitleOf(appointment)}
    href={screenOf(appointment)}
  />
{/snippet}

<div class="screen">
  <ScreenHeader title={m.appointments_title()} back="/more">
    {#snippet actions()}
      <button
        class="icon-btn"
        data-add
        aria-label={m.add_an_appointment()}
        onclick={() => openNew(false)}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- The opening: what is true now, before any log.
       A block rather than a row, because the gap is the reading and a row
       would put it in a subtitle beside the address. It opens the visit's
       own screen, like every row under it. -->
  <ReadGate read={gatedAppointmentsQuery} variant="block" count={1}>
    {#snippet rows()}
      {#if nextVisit}
        <!-- `collapse` as well as the clip in the stylesheet, which is
             the pair `Tile` already runs: the clip is the block arriving
             as an object, and the height is what stops the sections under
             it being teleported down the screen when the block replaces
             the "Nothing booked" line (which collapses on its own, inside
             `Notice`). -->
        <a
          class="visit-lead"
          data-visit-lead
          data-appointment={nextVisit.id}
          href={screenOf(nextVisit)}
          transition:collapse
          {...roleAttrs(roleAt(activeFlag.roles, 0))}
        >
          <!-- Each line crosses when the visit under it changes - a wait
               given a day sooner than the booked one takes the block over
                - the new words fading in and the old ones off
               where they stood, rather than cutting. The lines' own box
               travels its height (`resize`) when the new words take more or
               fewer lines; its own box rather than the button's, which
               `collapse` already animates on arrival. The place line stays
               mounted when the new visit has none, so its old words fade
               like the rest instead of leaving with their line. -->
          <span class="visit-lead-lines" use:resize>
            <span class="visit-lead-kind">{#key titleOf(nextVisit)}<span transition:leadLine>{titleOf(nextVisit)}</span>{/key}</span>
            <span class="visit-lead-gap" data-visit-gap>{#key gapLabel(nextVisit.epochDay)}<span transition:leadLine>{gapLabel(nextVisit.epochDay)}</span>{/key}</span>
            <span class="visit-lead-when">{#key leadDay(nextVisit)}<span transition:leadLine>{leadDay(nextVisit)}</span>{/key}</span>
            <span class="visit-lead-where" class:none={!leadWhere(nextVisit)}>{#key leadWhere(nextVisit)}<span transition:leadLine>{leadWhere(nextVisit)}</span>{/key}</span>
          </span>
        </a>
      {:else}
        <!-- Nothing booked is an ordinary state, not an empty journal: the
             prep list under this is standing and is still worth reading,
             and the add control is in the header where it always is. -->
        <Notice
          icon="appointment"
          key="appointments-nothing-booked"
          role={roleAt(activeFlag.roles, 0)}
          title={m.appointments_nothing_booked()}
        />
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="appointment"
        key="appointments-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.empty_list_title()}
        action={{ label: m.add_an_appointment(), primary: true, onclick: () => openNew(false) }}
      />
    {/snippet}
  </ReadGate>

  <!-- What to raise: the standing list, on the visit it is being kept for. -->
  <AppointmentPrep read={gatedChecklistQuery} />

  <!-- The waits, under the prep list: what to raise belongs directly under
       the visit it is for. Outside the opening's gate, so the section opens
       and closes its own height when the first wait is added or the last one
       is given a day, and each row does the same inside it, so nothing under
       it is teleported. -->
  {#if waiting.length}
    <div data-waiting transition:collapse>
      <SectionHeading text={m.appointments_waiting_heading()}>
        {#snippet action()}
          <button class="icon-btn" data-add-waiting aria-label={m.appointments_waiting_add_aria()} onclick={() => openNew(true)}>
            <Icon name="plus" size={22} />
          </button>
        {/snippet}
      </SectionHeading>
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each waiting as appointment (appointment.id)}
            <div transition:collapse>
              <ListRow
                key={appointment.id}
                data-waiting-appointment={appointment.id}
                icon="clock"
                title={titleOf(appointment)}
                subtitle={waitingSubtitle(appointment)}
                href={screenOf(appointment)}
              />
            </div>
          {/each}
        </ListCard>
      </div>
    </div>
  {/if}

  <!-- The two verbs. Both are things done at the visit rather than records of
       it, which is why they are a section and not two more rows on a list. -->
  <SectionHeading text={m.appointments_verbs_heading()} />
  <div class="screen-part">
    <ListCard role={roleAt(activeFlag.roles, 2)}>
      <!-- Always, which is the merge of two gates that disagreed. The prep
           list drew this row only once a question existed and
           the appointments screen drew it only on the day of a visit; on one screen either gate hides a verb the other would have
           shown, and this ticket asks for two verbs rather than however many
           the state allows. The room owns the empty case itself - it opens
           on `in-the-room-empty`, whose action is the way back here. -->
      <ListRow
        key="in-the-room"
        icon="bookmark"
        title={m.in_the_room_title()}
        subtitle={m.in_the_room_row_sub()}
        href="/health/appointments/in-the-room"
      />
      <ListRow
        key="clinician-summary"
        icon="share"
        title={m.clinician_summary_title()}
        subtitle={m.clinician_summary_row_sub()}
        href="/health/clinician-summary"
      />
    </ListCard>
  </div>

  <!-- Held until the appointments have answered, then faded in: the later and past visits cut in at full opacity under
       the gate above when they did. -->
  <ReadReserve ready={visitsRevealed} estimate={visitsEstimate} onrest={visitsRemember}>
    <!-- Each section and each row opens and closes its own height: a wait
         given a day arrives in one of these lists, and a row
         that appeared where it lands would be a yank. -->
    {#if later.length}
      <div transition:collapse>
        <SectionHeading text={m.appointments_later_heading()} />
        <div class="screen-part" data-later>
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each later as appointment (appointment.id)}
              <div transition:collapse>{@render visitRow(appointment)}</div>
            {/each}
          </ListCard>
        </div>
      </div>
    {/if}

    {#if past.length}
      <div transition:collapse>
        <SectionHeading text={m.appointments_past_heading()} />
        <div class="screen-part" data-past>
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each past as appointment (appointment.id)}
              <div transition:collapse>{@render visitRow(appointment)}</div>
              <!-- The debrief belongs to the most recent visit and to no other:
                   one entry is linked at a time (checklists.ts), and back-filling
                   history is entering a record rather than living through a
                   visit. Under that visit's own row rather than in a notice of
                   its own, and carrying its day either way - adjacency alone
                   would read as the debrief of whichever visit the eye lands on
                   next, which is the reading ticket 58 already fixed once on the
                   completed row. It opens and closes its height, so the offer
                   arrives by moving.

                   Its own handle rather than Home's `data-debrief-offer`: Home
                   draws the same offer as a Notice with a Notice's controls, and
                   one selector over two shapes is a check that passes on the
                   wrong surface. -->
              {#if appointment.id === lastVisit?.id && showDebriefOffer}
                <div transition:collapse>
                  <ListRow
                    key="debrief-offer"
                    data-visit-debrief-offer=""
                    icon="book"
                    title={m.debrief_offer_title()}
                    subtitle={[dayShort(appointment.epochDay), m.debrief_offer_write()]}
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
      </div>
    {/if}
  </ReadReserve>

  <!-- Who you see: the person's own notes on each provider,
       last because they are reference rather than what is true now. Each
       row opens its notes; a row arrives and leaves by its own height. -->
  <SectionHeading text={m.provider_heading()}>
    {#snippet action()}
      <button class="icon-btn" data-add-provider aria-label={m.provider_add_aria()} onclick={() => providerSheet?.open(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </SectionHeading>
  <!-- Not a ReadGate (measured, ticket 27): the gate swaps its rows for its
       empty branch in one frame, so the last provider deleted vanished and
       the page under a bottom-of-screen scroll stepped 120px, and its
       wrapper's resize held the old height through a row's own collapse and
       then stepped the scroller 45px when it let go. Here the list and the
       notice each open and close their own height, so the one leaving and
       the one arriving overlap rather than cut. Nothing is drawn until the
       read has answered; this is the screen's last section, so nothing
       under it waits on it. -->
  <div class="screen-part">
    {#if providersQuery.rows.length}
      <div data-providers transition:collapse>
        <ListCard role={roleAt(activeFlag.roles, 2)}>
          {#each providersQuery.rows as provider (provider.id)}
            <div transition:collapse>
              <ListRow
                key={provider.id}
                data-provider={provider.id}
                icon="person"
                title={provider.name}
                subtitle={providerSubtitle(provider)}
                chevron={false}
                onclick={() => providerSheet?.open(provider)}
              />
            </div>
          {/each}
        </ListCard>
      </div>
    {:else if providersQuery.failed}
      <Notice key="providers-failed" title={m.read_failed()} action={{ label: m.read_retry(), onclick: () => providersQuery.retry() }} />
    {:else if !providersQuery.loading}
      <Notice
        icon="person"
        key="providers-empty"
        role={roleAt(activeFlag.roles, 2)}
        title={m.provider_empty_title()}
        text={m.provider_empty_body()}
      />
    {/if}
  </div>

  <RecordSheet
    {record}
    handle="appointment"
    canSave={(draft) => costDraftOk(draft.cost)}
    newTitle={() => (waitingDraft ? m.appointments_waiting_new_sheet() : m.appointments_new_sheet())}
    saveLabel={m.save()}
  >
    {#snippet fields(editor)}
      <AppointmentFields
        bind:kind={editor.kind}
        bind:providerId={editor.providerId}
        bind:place={editor.place}
        bind:note={editor.note}
        bind:cost={editor.cost}
        bind:date={editor.date}
        bind:time={editor.time}
        bind:referred={editor.referred}
        withNote
        onNewProvider={() => providerSheet?.open(null, (id) => { if (record.editor) record.editor.providerId = id; })}
      />
    {/snippet}
  </RecordSheet>

  <ProviderSheet bind:this={providerSheet} providers={providersQuery.rows} />
</div>

<style>
  /* The opening block: the area's own stripe at its real hex with the visit
     written on it, the same material a tile is. The
     gap is the reading and takes the display face; the kind names it above,
     and where and when sit under it in the quiet half of the block's ink.

     It is a whole block rather than a row, so it takes press.css's default
     scale the way a tile does - what a full-width list row cannot do without
     moving the card around it. No transform of its own here, which is what
     leaves that default reachable. */
  .visit-lead {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: var(--space-4);
    background: var(--role-draw);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    /* A button takes the browser's own face, not the body's, unless told
       to (last-audit UI 53). The face only: the lines keep the leading and
       weight they were laid out at, so the block grows no more than
       Nunito's own metrics make it. */
    font-family: inherit;
    text-align: left;
    text-decoration: none;
    /* A block arrives by clipping open from its own left edge. `kit-block-in` by name rather than a keyframe of this
       screen's own: it is the kit's movement for a block and this is a
       block, and a second copy of those two frames would be two things to
       keep in step. Svelte only rewrites the names it declares itself, so a
       reference to kit.css's reaches it. Filled both ways so the
       reduced-motion clamp ends it where it rests. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
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
  .visit-lead-when,
  .visit-lead-where {
    font-size: var(--text-sm);
  }

  .visit-lead-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  /* The anchor each line's leaving words are pinned to (leadLine). */
  .visit-lead-lines > span {
    position: relative;
  }

  /* A visit with no place: the line is empty and takes no height, and this
     hands back the gap in front of it. */
  .visit-lead-where.none {
    margin-top: calc(var(--space-1) * -1);
  }

</style>
