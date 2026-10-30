<script lang="ts">
  import { journalTextAutocomplete } from '$lib/platform';
  import { untrack } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
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
     chips and the field is simply blank.

     WAITING LISTS (functional-audit ticket 26). An appointment with no day is
     a wait: a referral to a clinic, an NFZ queue, a surgery list. The editor
     is the same one with the day left empty, plus the day it was referred
     on and, once saved, its dated updates. The waits sit right under the
     opening block, because how long somebody has been on a list is as much
     "what is true now" as the next visit is. Each says how long it has been,
     from the referred-on day to today, and nothing about how long is left:
     the app has nothing to predict a queue from (`waitingSince`).

     A TIME AND A WHO (functional-audit ticket 27). A visit with a day can
     keep its time, which then rides along on its rows and the opening and
     goes to the calendar hand-off without being asked for again. The "who"
     is the person's own record of somebody they see: picked from chips in
     the editor, or made there and attached in one go, and listed at the
     foot of the screen with a contact, how trans-competent they were and
     impressions. Nothing about a provider is shared or rated anywhere but
     here. */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery, type LiveList } from '$lib/data/live/journal.svelte';
  import type {
    Appointment, AppointmentStatusUpdate, ChecklistItem, Provider, ProviderCompetence, WaitingAppointment
  } from '$lib/data/types';
  import { fmtDay, fmtDuration, fmtTime, intlLocale } from '$lib/data/dates';
  import { epochDayFromDateInputValue, dateInputValueFromEpochDay, timestampAtLocalTime } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import {
    mostRecentPastAppointment, PROVIDER_COMPETENCES, soonestFutureAppointment, waitingSince
  } from '$lib/data/journal/appointments';
  import { debriefOfferVisible } from '$lib/data/vocabulary/entryTemplates';
  import { gapTo } from '$lib/data/vocabulary/hubLabels';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import CostField from '$lib/components/CostField.svelte';
  import { blankCostDraft, costDraftFrom, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import { costLine } from '$lib/data/vocabulary/costLabel';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import CalendarHandoffSheet from '$lib/components/CalendarHandoffSheet.svelte';
  import { collapse, crossfade, resize } from '$lib/motion/reveal';
  import { fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { flip } from 'svelte/animate';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { rowWriter, writer } from '$lib/stores/attempt.svelte';

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
  /* Each appointment's updates, newest first: the row states the latest,
     the editor lists them all in the order somebody reads a log. */
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

  let kindsQuery = liveList((j) => j.appointments.getKinds());

  /* The people this person sees (ticket 27), by name, and each one's name
     by id so a row can say who without a second read. */
  let providersQuery = liveList((j) => j.appointments.getProviders());
  let providerNames = $derived(new Map(providersQuery.rows.map((p) => [p.id, p.name])));
  const whoOf = (appointment: Appointment | WaitingAppointment) =>
    appointment.providerId ? providerNames.get(appointment.providerId) : undefined;

  const competenceLabel: Record<ProviderCompetence, () => string> = {
    good: m.provider_competence_good,
    mixed: m.provider_competence_mixed,
    poor: m.provider_competence_poor
  };
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
  let items = $derived(checklistQuery.rows);

  /* The visit summary above and the prep checklist below each gate on their
     own read (ReadGate), and the two don't always land in the same tick: on
     a cold load, whichever answers second grows its own block in a frame
     after the first one has already eased into its resting height - the
     block between them (its heading, its screen part, its list) rode the
     first read's settle up a few px, then the checklist's own growth shoved
     it and everything after it back down, a direction reversal (ux-carpet
     ticket 238). Neither ReadGate sees the other's read, so `gateTogether`
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
    procedureId: string | null;
    /** `HH:MM` or empty (ticket 27). */
    time: string;
    providerId: string | null;
    cost: CostDraft;
  };

  /* A new wait opens with no day and today as the referred-on day; the
     header's add keeps today as the day, which is what ui-copy.md asks of
     an appointment. `waitingDraft` is read by `blank` at the moment the
     sheet opens, and names the sheet: the title is fixed by how the sheet
     opened rather than by the day field, so clearing or setting the day
     mid-edit never swaps the heading's text in one frame. */
  let waitingDraft = false;

  const record = recordEditor<Appointment | WaitingAppointment, Draft>({
    blank: () => ({
      date: waitingDraft ? '' : dateInputValueFromEpochDay(today),
      referred: waitingDraft ? dateInputValueFromEpochDay(today) : '',
      kind: '',
      place: '',
      note: '',
      procedureId: null,
      time: '',
      providerId: null,
      cost: blankCostDraft(deviceDefaultCurrency())
    }),
    fromRecord: (appointment) => ({
      id: appointment.id,
      date: appointment.epochDay === null ? '' : dateInputValueFromEpochDay(appointment.epochDay),
      referred: appointment.referredEpochDay === null ? '' : dateInputValueFromEpochDay(appointment.referredEpochDay),
      kind: appointment.kind ?? '',
      place: appointment.place ?? '',
      note: appointment.note ?? '',
      // Carried through the editor untouched: this screen never sets a
      // procedure link and never drops one either, so editing a consult
      // here leaves it on its journey.
      procedureId: appointment.procedureId,
      time: appointment.time ?? '',
      providerId: appointment.providerId,
      cost: costDraftFrom(appointment.cost, deviceDefaultCurrency(), intlLocale())
    }),
    async upsert(draft) {
      await journal.appointments.upsertAppointment({
        id: draft.id,
        epochDay: epochDayFromDateInputValue(draft.date),
        referredEpochDay: epochDayFromDateInputValue(draft.referred),
        procedureId: draft.procedureId,
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
    remove: (id) => journal.appointments.deleteAppointment(id),
    findById: (id) =>
      appointments.find((appointment) => appointment.id === id) ?? waiting.find((appointment) => appointment.id === id)
  });

  function openNew(asWait: boolean) {
    waitingDraft = asWait;
    record.openEditor(null);
  }

  /* A wait's updates are their own records, written as they are added
     rather than held in the draft: an update is a fact on the day it is
     typed, not part of an edit somebody might still discard. They are
     offered once the appointment exists. */
  let newUpdateText = $state('');
  let newUpdateDate = $state('');
  const updateWrite = writer();
  async function addUpdate(appointmentId: string) {
    const status = newUpdateText.trim();
    if (!status) return;
    const epochDay = epochDayFromDateInputValue(newUpdateDate) ?? today;
    if (!(await updateWrite.run(() => journal.appointments.addStatusUpdate({ appointmentId, epochDay, status }), m.write_failed())))
      return;
    newUpdateText = '';
  }
  const updateDelete = rowWriter();
  function deleteUpdate(update: AppointmentStatusUpdate) {
    updateDelete(update.id, () => journal.appointments.deleteStatusUpdate(update.id), m.write_failed());
  }
  // A freshly opened editor starts its update field empty, dated today.
  let editingId = $derived(record.editor ? (record.editor.id ?? '') : null);
  $effect.pre(() => {
    if (editingId === null) return;
    newUpdateText = '';
    newUpdateDate = dateInputValueFromEpochDay(untrack(() => today));
  });

  /* The prep item's own editor, for the one thing a prep row asks
     confirmation for. Separate from the appointment's above because they
     delete different records and carry different confirmations. */
  const prepRecord = recordEditor<ChecklistItem>({
    remove: (id) => journal.checklists.deleteItem(id),
    findById: (id) => items.find((item) => item.id === id)
  });

  let addSheet = $state(false);
  let newItemText = $state('');

  // Calendar handoff snapshots the committed day and time. Unsaved edits stay in the editor.
  let calendarVisit = $state<Appointment | null>(null);

  /* The provider's own editor (ticket 27). Opened from the list at the
     foot of the screen, or from "Someone new" in the appointment editor -
     which is the one case that also attaches what was just made to the
     appointment still open underneath, so making somebody and picking them
     is one step rather than two. */
  type ProviderDraft = {
    id?: string;
    name: string;
    contact: string;
    competence: ProviderCompetence | null;
    impressions: string;
  };
  let attachNewProvider = false;
  const providerRecord = recordEditor<Provider, ProviderDraft>({
    blank: () => ({ name: '', contact: '', competence: null, impressions: '' }),
    fromRecord: (provider) => ({
      id: provider.id,
      name: provider.name,
      contact: provider.contact ?? '',
      competence: provider.competence,
      impressions: provider.impressions ?? ''
    }),
    async upsert(draft) {
      const id = await journal.appointments.upsertProvider({
        id: draft.id,
        name: draft.name,
        contact: draft.contact,
        competence: draft.competence,
        impressions: draft.impressions
      });
      if (attachNewProvider && !draft.id && record.editor) record.editor.providerId = id;
    },
    remove: (id) => journal.appointments.deleteProvider(id),
    findById: (id) => providersQuery.rows.find((provider) => provider.id === id)
  });

  function openProvider(provider: Provider | null, attach = false) {
    attachNewProvider = attach;
    providerRecord.openEditor(provider);
  }

  /* The Who chips with "Someone new" as the last of them, one keyed list,
     so a provider made from the editor fades in where it lands while the
     chips after it - "Someone new" itself at least - travel aside rather
     than jumping a chip's width (search's filter chips, functional audit
     10, are the same row). */
  let whoChips = $derived([
    ...providersQuery.rows.map((provider) => ({ key: provider.id, provider })),
    { key: 'new', provider: null }
  ]);
  const chipTravel = (_distance?: number) => (isReducedMotion() ? 0 : motionDuration('--dur-fast'));
  const chipIn = (_node: Element) => (isReducedMotion() ? { duration: 0 } : fadeOnly(motionDuration('--dur-fast')));

  const providerSubtitle = (provider: Provider) =>
    [provider.competence ? competenceLine[provider.competence]() : undefined, provider.contact ?? undefined]
      .filter((part): part is string => part !== undefined);

  function openAddSheet() {
    newItemText = '';
    addSheet = true;
  }

  /* One item per tap, and the sheet stays up with its text and a toast
     when the add fails (UI 17). Two adds of the same words a moment apart
     are still two questions; only the second tap of a double one is not. */
  const itemWrite = writer();
  async function addItem() {
    const content = newItemText.trim();
    if (!content) return;
    if (!(await itemWrite.run(() => journal.checklists.addToStandaloneChecklist(content), m.write_failed()))) return;
    addSheet = false;
  }

  /* A row's tick and flag each take one write at a time, read off the row
     as it stands, so a double tap flips once rather than writing the same
     value twice; a failure says so instead of failing silently (UI 17). */
  const checkWrite = rowWriter();
  const flagWrite = rowWriter();
  function toggleChecked(item: ChecklistItem) {
    checkWrite(item.id, () => journal.checklists.setItemChecked(item.id, !item.checked), m.write_failed());
  }

  function toggleCarriedForward(item: ChecklistItem) {
    flagWrite(item.id, () => journal.checklists.setItemCarriedForward(item.id, !item.carriedForward), m.write_failed());
  }

  /* Latched: a reserve must not put its placeholder back (ticket 211). */
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
    icon="calendar"
    title={titleOf(appointment)}
    subtitle={subtitleOf(appointment)}
    chevron={false}
    onclick={() => record.openEditor(appointment)}
  />
{/snippet}

<div class="screen">
  <ScreenHeader title={m.appointments_title()} back="/more" subtitle={m.appointments_intro()}>
    {#snippet actions()}
      <button
        class="icon-btn"
        data-add
        aria-label={m.appointments_add_aria()}
        onclick={() => openNew(false)}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- The opening (DIRECTION.md rule 16): what is true now, before any log.
       A block rather than a row, because the gap is the reading and a row
       would put it in a subtitle beside the address. It opens the editor, so
       the one record on the screen is still the one you change. -->
  <ReadGate read={gatedAppointmentsQuery} variant="block" count={1}>
    {#snippet rows()}
      {#if nextVisit}
        <!-- `collapse` as well as the clip in the stylesheet, which is
             the pair `Tile` already runs: the clip is the block arriving
             as an object, and the height is what stops the sections under
             it being teleported down the screen when the block replaces
             the "Nothing booked" line (which collapses on its own, inside
             `Notice`). -->
        <button
          class="visit-lead"
          data-visit-lead
          data-appointment={nextVisit.id}
          onclick={() => record.openEditor(nextVisit!)}
          transition:collapse
          {...roleAttrs(roleAt(activeFlag.roles, 0))}
        >
          <!-- Each line crosses when the visit under it changes - a wait
               given a day sooner than the booked one takes the block over
               (ticket 26) - the new words fading in and the old ones off
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
      <!-- The waits, inside the opening's gate so they land in the same
           resize as the block above rather than a frame after it. The
           section opens and closes its own height when the first wait is
           added or the last one is given a day, and each row does the same
           inside it, so nothing under it is teleported. -->
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
                    chevron={false}
                    onclick={() => record.openEditor(appointment)}
                  />
                </div>
              {/each}
            </ListCard>
          </div>
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="calendar"
        key="appointments-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.appointments_empty_title()}
        text={m.appointments_empty_body()}
        action={{ label: m.appointments_empty_action(), primary: true, onclick: () => openNew(false) }}
      />
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

  <ReadGate read={gatedChecklistQuery} variant="line" count={3}>
    {#snippet rows()}
      <ListCard role={roleAt(activeFlag.roles, 1)}>
        <!-- Hand-rolled rather than ListRow (ticket 16): two trailing
             actions (carry-forward flag, delete) where `action` takes
             one, and a checkbox main that's role="checkbox" with its own
             .ap-box rather than ListRow's checked semantics.

             Each row opens and closes its own height (ADR-0078), so an
             item added from the sheet arrives by moving rather than
             appearing where it lands. -->
        {#each items as item (item.id)}
          <div class="kit-row is-split" data-appointment-item={item.id} transition:collapse>
            <button
              class="kit-row-main"
              role="checkbox"
              aria-checked={item.checked}
              aria-label={item.checked ? m.appointment_prep_uncheck_aria({ content: item.content }) : m.appointment_prep_check_aria({ content: item.content })}
              onclick={() => toggleChecked(item)}
            >
              <!-- The tick is always in the markup and crosses in and out
                   on opacity and a scale rather than being added and
                   removed: a glyph that appears in one frame is a yank in
                   both directions, and the row's state is on the row's own
                   `aria-checked` rather than on whether this element
                   exists. Under reduced motion `--dur-fast` clamps to 1ms
                   and the tick simply cuts, which keeps the feedback. -->
              <span class="ap-box" class:ap-ticked={item.checked}>
                <span class="ap-tick" aria-hidden="true"><Icon name="check" size={20} /></span>
              </span>
              <span class="kit-row-text">
                <span class="kit-row-title" class:ap-done={item.checked}>{item.content}</span>
              </span>
            </button>
            <button
              class="kit-row-act"
              class:ap-flagged={item.carriedForward}
              data-carry-forward={item.id}
              aria-pressed={item.carriedForward}
              aria-label={item.carriedForward ? m.appointment_prep_uncarry_aria({ content: item.content }) : m.appointment_prep_carry_aria({ content: item.content })}
              onclick={() => toggleCarriedForward(item)}
            >
              <Icon name="flag" size={18} />
            </button>
            <button
              class="kit-row-act"
              data-delete-appointment-item={item.id}
              aria-label={m.appointment_prep_delete_aria({ content: item.content })}
              onclick={() => prepRecord.askToDelete(item)}
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
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="check"
        key="appointment-prep-empty"
        role={roleAt(activeFlag.roles, 1)}
        title={m.appointment_prep_empty_title()}
        text={m.appointment_prep_empty_body()}
        action={{ label: m.appointment_prep_empty_action(), primary: true, onclick: openAddSheet }}
      />
    {/snippet}
  </ReadGate>

  <!-- The two verbs. Both are things done at the visit rather than records of
       it, which is why they are a section and not two more rows on a list. -->
  <SectionHeading text={m.appointments_verbs_heading()} />
  <div class="screen-part">
    <ListCard role={roleAt(activeFlag.roles, 2)}>
      <!-- Always, which is the merge of two gates that disagreed. The prep
           list drew this row only once a question existed (ticket 71) and
           the appointments screen drew it only on the day of a visit (ticket
           60); on one screen either gate hides a verb the other would have
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
        title={m.clinician_summary_row()}
        subtitle={m.clinician_summary_row_sub()}
        href="/health/clinician-summary"
      />
    </ListCard>
  </div>

  <!-- Held until the appointments have answered, then faded in (ux-carpet
       ticket 211): the later and past visits cut in at full opacity under
       the gate above when they did. -->
  <ReadReserve ready={visitsRevealed} estimate={visitsEstimate} onrest={visitsRemember}>
    <!-- Each section and each row opens and closes its own height: a wait
         given a day arrives in one of these lists (ticket 26), and a row
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
                   arrives by moving (ADR-0078).

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

  <!-- Who you see (ticket 27): the person's own notes on each provider,
       last because they are reference rather than what is true now. Each
       row opens its notes; a row arrives and leaves by its own height. -->
  <SectionHeading text={m.provider_heading()}>
    {#snippet action()}
      <button class="icon-btn" data-add-provider aria-label={m.provider_add_aria()} onclick={() => openProvider(null)}>
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
                icon="note"
                title={provider.name}
                subtitle={providerSubtitle(provider)}
                chevron={false}
                onclick={() => openProvider(provider)}
              />
            </div>
          {/each}
        </ListCard>
      </div>
    {:else if providersQuery.failed}
      <Notice key="providers-failed" title={m.read_failed()} action={{ label: m.read_retry(), onclick: () => providersQuery.retry() }} />
    {:else if !providersQuery.loading}
      <Notice
        icon="note"
        key="providers-empty"
        role={roleAt(activeFlag.roles, 2)}
        title={m.provider_empty_title()}
        text={m.provider_empty_body()}
      />
    {/if}
  </div>

  <Sheet busy={itemWrite.busy} open={addSheet} title={m.appointment_prep_new_sheet()} onClose={() => (addSheet = false)}>
    <h3>{m.appointment_prep_new_sheet()}</h3>
    <Field label={m.appointment_prep_new_sheet()} id="appointment-prep-input" hidden>
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="appointment-prep-input"
          placeholder={m.appointment_prep_placeholder()}
          bind:value={newItemText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-appointment-item disabled={itemWrite.busy} onclick={addItem}><span>{m.appointment_prep_add()}</span></button>
  </Sheet>

  <RecordSheet
    record={prepRecord}
    handle="appointment-item"
    confirm={{
      title: m.appointment_prep_delete_sheet(),
      question: () => m.appointment_prep_delete_q(),
      hint: (item) => item.content,
      confirmLabel: m.appointment_prep_delete(),
      cancelLabel: m.keep_it()
    }}
  />

  <RecordSheet
    {record}
    handle="appointment"
    canSave={(draft) => costDraftOk(draft.cost)}
    newTitle={() => (waitingDraft ? m.appointments_waiting_new_sheet() : m.appointments_new_sheet())}
    editTitle={(draft) =>
      waiting.some((a) => a.id === draft.id) ? m.appointments_waiting_edit_sheet() : m.appointments_edit_sheet()}
    saveLabel={m.appointments_save()}
    deleteLabel={m.appointments_delete()}
    confirm={{
      title: m.appointments_delete_sheet(),
      question: () => m.appointments_delete_q(),
      hint: (appointment) => (appointment.epochDay === null ? titleOf(appointment) : dayLabel(appointment.epochDay)),
      confirmLabel: m.appointments_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.appointments_kind_label()} id="appointment-kind">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
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
             between Kind and Place. Suggestions appear only after the
             person has named a kind; nothing ships. -->
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
        </div>
      {/if}
      <!-- Who it is with (ticket 27): the person's own providers as chips,
           one picked at a time and a second tap on it unpicking, the way the
           kind chips above fill rather than lock. "Someone new" opens the
           provider's own sheet over this one and attaches what is saved
           there. -->
      <Field label={m.appointments_who_label()} legend id="appointment-who">
        {#snippet children(id)}
          <div class="tag-row ap-who" role="group" aria-labelledby={id} use:resize>
            {#each whoChips as chip (chip.key)}
              <button
                class="tag-chip"
                class:is-selected={!!chip.provider && editor.providerId === chip.provider.id}
                aria-pressed={chip.provider ? editor.providerId === chip.provider.id : undefined}
                data-who={chip.provider?.id}
                data-who-new={chip.provider ? undefined : ''}
                onclick={() => {
                  if (!chip.provider) return openProvider(null, true);
                  const id = chip.provider.id;
                  editor.providerId = editor.providerId === id ? null : id;
                }}
                animate:flip={{ duration: chipTravel }}
                in:chipIn
              >
                {#if chip.provider}
                  {chip.provider.name}
                {:else}
                  <Icon name="plus" size={16} />
                  {m.appointments_who_new()}
                {/if}
              </button>
            {/each}
          </div>
        {/snippet}
      </Field>
      <Field label={m.appointments_place_label()} id="appointment-place">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
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
          <textarea autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="appointment-note"
            rows="3"
            placeholder={m.appointments_note_placeholder()}
            bind:value={editor.note}
          ></textarea>
        {/snippet}
      </Field>
      <CostField id="appointment-cost" bind:draft={editor.cost} />
      <!-- Day and its time in one box of their own (flow-root), so the
           time arriving and a wait's fields leaving below it on the same
           tick (a day set on a wait) do not read each other's margins
           mid-travel: measured, the wait block's leave otherwise kept 16px
           under it and the buttons stepped up 16px the frame it was
           removed. -->
      <div class="ap-when">
        <Field label={m.appointments_day_label()} hint={m.appointments_day_hint()} id="appointment-date">
          {#snippet children(id, describedBy)}
            <DatePicker name="appointment-date" bind:value={editor.date} {id} {describedBy} />
          {/snippet}
        </Field>
        <!-- The time only goes with a day (ticket 27): clearing the day makes
             a wait, and a wait has no time to keep, so the field closes its
             height rather than standing there unsaved. -->
        {#if editor.date}
          <div transition:collapse>
            <Field label={m.appointments_time_label()} id="appointment-time">
              {#snippet children(id)}
                <TimePicker name="appointment-time" bind:value={editor.time} {id} />
              {/snippet}
            </Field>
          </div>
        {/if}
      </div>
      <!-- The wait's own fields, only on a wait: an appointment with no day,
           or one that began as a wait (it has a referred-on day or updates).
           An ordinary booking is the four fields above and nothing more, and
           clearing its day opens these by moving rather than appearing. -->
      {#if !editor.date || editor.referred || (editor.id && statusesOf.has(editor.id))}
        <div class="ap-wait" transition:collapse>
          <Field label={m.appointments_referred_label()} id="appointment-referred">
            {#snippet children(id)}
              <DatePicker name="appointment-referred" bind:value={editor.referred} {id} />
            {/snippet}
          </Field>
          {#if editor.id}
            {@const appointmentId = editor.id}
            {@const updates = statusesOf.get(appointmentId) ?? []}
            <FieldGroupHeading legend={m.appointments_updates_heading()} />
            {#if updates.length}
              <div transition:collapse>
                <ListCard>
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
              class="btn btn-soft"
              data-add-status-update
              disabled={updateWrite.busy || !newUpdateText.trim()}
              onclick={() => addUpdate(appointmentId)}
            >
              <span>{m.appointments_update_add()}</span>
            </button>
          {/if}
        </div>
      {/if}
    {/snippet}
    {#snippet extraActions(editor)}
      <!-- Only for an appointment saved with a day: a wait has nothing to
           put in a calendar yet, and the handoff uses the committed day. -->
      {#if appointments.some((a) => a.id === editor.id)}
      <button class="btn btn-soft" data-add-to-calendar onclick={() => (calendarVisit = appointments.find((a) => a.id === editor.id) ?? null)}>
        <span>{m.calendar_handoff_button()}</span>
      </button>
      {/if}
    {/snippet}
  </RecordSheet>

  <CalendarHandoffSheet
    open={calendarVisit !== null}
    kind="appointment"
    epochDay={calendarVisit?.epochDay ?? today}
    time={calendarVisit?.time ?? null}
    onClose={() => (calendarVisit = null)}
  />

  <RecordSheet
    record={providerRecord}
    handle="provider"
    newTitle={m.provider_new_sheet()}
    editTitle={m.provider_edit_sheet()}
    saveLabel={m.appointments_save()}
    deleteLabel={m.appointments_delete()}
    canSave={(draft) => draft.name.trim().length > 0}
    confirm={{
      title: m.provider_delete_sheet(),
      question: () => m.provider_delete_q(),
      hint: () => m.provider_delete_hint(),
      confirmLabel: m.appointments_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(draft)}
      <p class="muted small">{m.provider_private()}</p>
      <Field label={m.provider_name_label()} id="provider-name">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="provider-name"
            placeholder={m.provider_name_placeholder()}
            bind:value={draft.name}
          />
        {/snippet}
      </Field>
      <Field label={m.provider_contact_label()} id="provider-contact">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="provider-contact"
            placeholder={m.provider_contact_placeholder()}
            bind:value={draft.contact}
          />
        {/snippet}
      </Field>
      <!-- Three answers and none, as toggles: tapping the picked one again
           takes the answer back, so "not said" needs no fourth chip. -->
      <Field label={m.provider_competence_label()} legend id="provider-competence">
        {#snippet children(id)}
          <div class="tag-row" role="group" aria-labelledby={id}>
            {#each PROVIDER_COMPETENCES as competence (competence)}
              <button
                class="tag-chip"
                class:is-selected={draft.competence === competence}
                aria-pressed={draft.competence === competence}
                data-competence={competence}
                onclick={() => (draft.competence = draft.competence === competence ? null : competence)}
              >
                {competenceLabel[competence]()}
              </button>
            {/each}
          </div>
        {/snippet}
      </Field>
      <Field label={m.provider_impressions_label()} id="provider-impressions">
        {#snippet children(id)}
          <textarea autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="provider-impressions"
            rows="3"
            placeholder={m.provider_impressions_placeholder()}
            bind:value={draft.impressions}
          ></textarea>
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
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
    cursor: pointer;
    /* A block arrives by clipping open from its own left edge (rule 10,
       ADR-0078). `kit-block-in` by name rather than a keyframe of this
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

  /* Transform and opacity, the two properties the performance contract
     admits without a named material. It grows from the box's own centre
     rather than travelling, because the tick has nowhere to come from - it
     is the box filling in, not a thing arriving from off screen. */
  .ap-tick {
    display: flex;
    opacity: 0;
    transform: scale(0.4);
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .ap-ticked .ap-tick {
    opacity: 1;
    transform: scale(1);
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

  /* The "Someone new" chip carries its plus inline with its words. */
  .ap-who [data-who-new] {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* The wait's fields keep the sheet's own field rhythm (RecordSheet's
     fieldset spaces its direct children), one wrapper deeper. */
  .ap-when {
    display: flow-root;
  }

  .ap-when > :global(* + *) {
    margin-top: var(--space-4);
  }

  .ap-wait > :global(* + *) {
    margin-top: var(--space-4);
  }
</style>
