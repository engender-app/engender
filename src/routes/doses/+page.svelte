<script lang="ts">
  /* Every dose, and how it sits against the schedule, on the surface kit
     (phase 5 UX ticket 25).

     The log row was four lines deep: the dose and its route, when and
     where, which regimen episode it falls under, and - where the dose came
     from a schedule - what that schedule had asked for. Two of those are
     about the dose and two are about the bookkeeping around it, so the
     bookkeeping moves to the end of the row where a reading goes, and the
     row is a dose again.

     The three states the schedule view can be in - several episodes
     running, none, or one with no schedule - were `.notice notice-info`
     paragraphs, which is the old world's notice. They are the kit's. */
  /* The dose log (phase 4 ticket 02, widened to concurrent episodes by
     phase 5 ticket 38). Two views: what was logged, and how it sits against
     what the active episode's schedule expected. The second one is a single
     question asked of the dose log area (phase 5 audit-deepening ticket 17).

     A dose usually stores no drug or regimen episode of its own - every
     row asks attributeDose with the dose's own timestamp, which is why
     correcting a date in the editor below moves the dose to a different
     episode with nothing else to update. `drug` only exists to break a
     tie when more than one episode is active at once for different drugs
     (regimenEpisode.ts). */
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt, attributeDose, nearestActiveEpisode } from '$lib/data/regimenEpisode';
  import {
    expectedAmountOn,
    isInjectionDose,
    isTopicalDose,
    lastInjectionBefore,
    matchDoseRoute,
    siteRecency,
    APPLICATION_SITES
  } from '$lib/data/doseSchedule';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import {
    dateInputValueFromEpochDay,
    epochDayFromDateInputValueOrToday,
    epochDayFromTimestamp,
    startOfDayTimestamp,
    todayEpochDay
  } from '$lib/data/epochDay';
  import {
    ROUTE_OPTIONS,
    STATUS_OPTIONS,
    applicationSiteLabel,
    injectionSiteLabel,
    pauseReasonLabel,
    routeLabel,
    statusLabel,
    vehicleLabel
  } from '$lib/data/vocabulary/doseLabels';
  import { stockRemainingLabel, stockRunOutLabel } from '$lib/data/vocabulary/stockLabel';
  import type { ApplicationSiteKey, InjectionSiteKey } from '$lib/data/doseSchedule';
  import type { DoseEvent, DoseRoute, DoseStatus, InjectionVehicle } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import InjectionSiteMap from '$lib/components/InjectionSiteMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { hashRowId, scrollToHash } from '$lib/navigation/scroll-region';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import BatchedList from '$lib/components/kit/BatchedList.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Three areas across the two views: the doses themselves, the schedule
     they are compared against, and what fell outside either. */
  const SECTION_ROLE = { doses: 0, schedule: 1, leftover: 2 };

  /** How far back the log and the comparison look. A window rather than the
      whole history because both reads are per-day and a journal years deep
      has no screen that shows all of it at once. */
  const WINDOW_DAYS = 90;
  /** How far nearestActiveEpisode may search either side of today for a
      schedule's nearest open slot (ticket 40) - a different question from
      WINDOW_DAYS above (how much history the log and comparison show), not
      the same number reused: it happens to share WINDOW_DAYS's value only
      because `doses` below is fetched for that window, and a wider search
      would find a "nearest" slot the page has no doses to check against. */
  const NEAREST_SLOT_RADIUS_DAYS = WINDOW_DAYS;
  const today = todayEpochDay();
  const from = today - WINDOW_DAYS;

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let dosesQuery = liveList((j) => j.doses.getDoses(from, today));
  /** Every drug with a stock entry, read where its doses are logged (phase
      5 deepening ticket 06) - the same getProjections /settings/stock reads,
      not a new query. A drug with no stock entry adds no row here. */
  let stockQuery = liveList((j) => j.stock.getProjections(today));
  let stockRows = $derived(stockQuery.rows);
  /** The whole schedule view in one question (phase 5 audit-deepening
      ticket 17): which episode is in effect, its schedule, its pauses, and
      the comparison over the doses attributed to it - or the reason there
      is nothing to compare. The six-step assembly that used to stand here
      is doses.ts's getComparison, which is also what the long-journal
      benchmark measures, so "the same way the screen does" is the same
      function rather than a comment. */
  let comparisonQuery = liveQuery((j) => j.doses.getComparison({ fromEpochDay: from, toEpochDay: today }));
  /** Read separately from the windowed `dosesQuery` above (ticket 10): a
      rotation site's last use routinely predates the log's 90-day window,
      and "never used" has to mean never, not merely not in that window. */
  let allInjectionDosesQuery = liveList((j) => j.doses.getDoses(0, today));
  /** Every schedule and pause, for the nearest-slot default below (ticket
      40) - the same two reads getComparison already makes, only across all
      episodes rather than the single active one it resolves to. */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());

  let episodes = $derived(episodesQuery.rows);
  let doses = $derived(dosesQuery.rows);
  let schedules = $derived(schedulesQuery.rows);
  let pauses = $derived(pausesQuery.rows);
  let scheduleView = $derived(comparisonQuery.value ?? null);
  let loading = $derived(episodesQuery.loading || dosesQuery.loading);

  /* Newest first, each row carrying the episode it was attributed to. Derived
     rather than resolved in the row: `attributeDose` was called per rendered
     row, which re-scanned the whole episode list on every render, and the
     reversed copy was rebuilt with it. */
  let logRows = $derived(
    [...doses].reverse().map((dose) => ({ dose, attribution: attributeDose(episodes, dose) }))
  );

  /* The clinician summary links a dose across a hash (phase 8 features
     ticket 67) - read once, the same "one visit to one screen" rule
     BatchedList's own `path` follows, since a hash arriving mid-visit would
     mean a fresh navigation had already replaced this component. Resolved to
     a position in `logRows` because that is what BatchedList's `focusIndex`
     wants: the same array the list slices from, not the id itself. */
  const deepLinkedDoseId = hashRowId();
  let deepLinkedDoseIndex = $derived(
    deepLinkedDoseId ? logRows.findIndex(({ dose }) => dose.id === deepLinkedDoseId) : -1
  );

  let view = $state<'log' | 'schedule'>('log');

  /* Every episode active right now (phase 5 ticket 38): usually one, but a
     concurrent second drug's episode makes it two. This is the editor's
     question - which regimen a new dose is being logged under - and the
     schedule view asks its own version of it through getComparison, over the
     range it is comparing rather than over this instant. */
  let activeEpisodes = $derived(activeEpisodesAt(episodes, Date.now()));
  /** The episode a new dose should default to (ticket 40): the sole active
      one, or - with more than one active - whichever schedule's slot sits
      nearest to now, when that is not a tie. Null leaves the picker below
      to ask, same as before this ticket for the tied and no-schedule
      cases. */
  let activeEpisode = $derived(
    nearestActiveEpisode(episodes, activeEpisodes, schedules, pauses, doses, today, NEAREST_SLOT_RADIUS_DAYS)
  );
  /** The drugs to choose between when logging a new dose while more than
      one episode is active - empty whenever activeEpisode already answers
      the question on its own. */
  let activeDrugChoices = $derived([...new Set(activeEpisodes.map((e) => e.drug))]);

  /* Null when the row has no site rather than when the route has none: a
     dose imported without one shows no site line instead of a blank bullet. */
  const siteOf = (dose: DoseEvent): string | null => {
    if (isInjectionDose(dose)) return dose.injectionSite ? injectionSiteLabel(dose.injectionSite) : null;
    if (isTopicalDose(dose)) return dose.applicationSite ? applicationSiteLabel(dose.applicationSite) : null;
    return null;
  };

  const fmtDayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });
  const whenOf = (dose: DoseEvent) => `${fmtDayShort(epochDayFromTimestamp(dose.timestamp))}, ${fmtTime(dose.timestamp)}`;

  /** `<input type="time">` value for a timestamp, and back again. Local
      wall-clock both ways: the field shows the time of day the user took the
      dose at, which is the thing being recorded. */
  function timeInputValue(timestamp: number): string {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function timestampOf(dayValue: string, timeValue: string): number {
    const epochDay = epochDayFromDateInputValueOrToday(dayValue);
    const [hours, minutes] = timeValue.split(':').map(Number);
    return startOfDayTimestamp(epochDay) + (hours || 0) * 3600000 + (minutes || 0) * 60000;
  }

  type Editor = {
    id?: string;
    day: string;
    time: string;
    route: DoseRoute;
    dose: string;
    doseUnit: string;
    /** `''` until the picker is tapped; the save guard below refuses that. */
    injectionSite: InjectionSiteKey | '';
    vehicle: InjectionVehicle;
    applicationSite: ApplicationSiteKey | '';
    status: DoseStatus;
    scheduledDose: string;
    scheduledRoute: DoseRoute;
    scheduledTime: string;
    /** Which drug this is, when it needs saying (phase 5 ticket 38). `''`
        on every dose logged while at most one episode was active - the
        common case, and the one this field must not add friction to. */
    drug: string;
  };

  let editor = $state<Editor | null>(null);
  /** True only for a *new* dose, while it is genuinely ambiguous which of
      several active episodes it is for (ticket 40: two schedules tied for
      nearest, or neither has a schedule to break the tie with) - not for
      editing an old dose, whose own drug (if any) is shown but never
      forced, and not merely for having more than one episode active, now
      that activeEpisode already resolves the common case on its own. */
  let editorNeedsDrugPick = $derived(
    editor !== null && !editor.id && activeDrugChoices.length > 1 && activeEpisode === null
  );

  /* Which of the record's three lines is open (phase 5 UX ticket 37).
     One at a time, which is `disclose`'s own cap: a second group open
     underneath the first is two heights animating over each other, and the
     line that closed still states its value, so nothing is lost by closing
     it. */
  type RecordGroup = 'what' | 'when' | 'status';
  let openGroup = $state<RecordGroup | null>(null);
  const toggleGroup = (group: RecordGroup) => (openGroup = openGroup === group ? null : group);

  /* Quick add's dose option (phase 5 ticket 18, spec 04): the log is the
     surface that records a dose, and it supports seeding, so arriving from
     the sheet opens the same editor its own add button opens rather than
     leaving the person to find it. The param is cleared as it is read, so
     going back or reloading never reopens the editor over an entry that was
     just saved - the same shape Home uses for its own one-shot params.

     Not a launch route: /doses is not in launch-routes.json (ADR-0028) and
     this is reached from inside the app only. */
  $effect(() => {
    if (page.url.searchParams.get('add') !== '1') return;
    openEditor(null);
    /* replaceState rather than goto: this only has to take the param off the
       URL, and a goto would start a second navigation on top of the one that
       just landed here, which aborts it and leaves the shell's transition
       promise rejecting for nothing. */
    replaceState('/doses', {});
  });

  /* Same story as the regimen screen's: the clinician summary links a dose
     across a hash, the browser's anchor scroll fires before the log's
     liveQuery answers, and this is the second chance that actually sees the
     row. `deepLinkedDoseIndex` above is what gets the row into the DOM at
     all once the log batches (ticket 67) - this only has to wait for the
     layout scrollToHash's own settle loop already handles. */
  $effect(() => {
    if (!loading && view === 'log') scrollToHash();
  });

  function openEditor(dose: DoseEvent | null) {
    const now = Date.now();
    if (!dose) {
      /* Seeded from the active episode: someone logging today's dose is
         almost always logging the regimen they are on, and retyping the
         amount and unit every time is the tax that stops people logging.
         With more than one episode active, there is no single "the
         active episode" to seed from - the drug picker below fills the
         amount and unit in once a drug is chosen.

         Three more seeds than that (phase 5 UX ticket 37), because the
         sheet's job is to state what the app already knows rather than to
         ask for it again:

         The route comes off the episode's own words. It is free text there
         and one of six keys here, so it needs reading rather than copying
         (matchDoseRoute), and where the words name no route or two the
         answer is oral - the same default as before, now only for the
         cases nothing better is available.
         The amount prefers what the schedule is still expecting today over
         the episode's single figure, which is the alternating 2mg/1mg
         regimen: seeding from the episode fills in the wrong number every
         other day.
         The vehicle comes off the last injection logged, whatever drug it
         was for. It is not on the episode at all, and asking on every
         injection for something that changes about once a prescription is
         the definition of asking twice. */
      const seededAmount = scheduleView?.reason === null ? expectedAmountOn(scheduleView.comparison, today) : null;
      const lastInjection = lastInjectionBefore(doses, now);
      /* Built as a local first, and the reason is load-bearing: quick add
         reaches this function from inside the `?add=1` effect below, and an
         effect that reads back a `$state` it has just written depends on it
         and so invalidates itself. Deciding `openGroup` from `editor.dose`
         rather than from `draft.dose` looped until Svelte's depth guard
         stopped it, which is what the walkthrough's page-error check caught
         (effect_update_depth_exceeded, on quick add's dose row only - every
         other way in calls this from an event handler, where nothing is
         being tracked). */
      const draft: Editor = {
        day: dateInputValueFromEpochDay(today),
        time: timeInputValue(now),
        route: (activeEpisode && matchDoseRoute(activeEpisode.route, ROUTE_OPTIONS)) || 'oral',
        dose: seededAmount ? String(seededAmount.dose) : activeEpisode ? String(activeEpisode.dose) : '',
        doseUnit: seededAmount?.doseUnit ?? activeEpisode?.doseUnit ?? '',
        injectionSite: '',
        vehicle: lastInjection?.vehicle ?? 'oil',
        applicationSite: '',
        status: 'taken',
        scheduledDose: '',
        scheduledRoute: 'oral',
        scheduledTime: timeInputValue(now),
        drug: activeEpisode?.drug ?? ''
      };
      /* A line whose fact the app does not know opens as the fields that
         make one. Those are the two cases that also block the save: an
         amount nothing seeded, and several active episodes tied with no
         drug picked yet (ticket 40 - activeEpisode already resolves the
         common case, seeding draft.dose above with it). Everything else
         opens stated and closed. */
      openGroup = draft.dose === '' || (activeDrugChoices.length > 1 && activeEpisode === null) ? 'what' : null;
      editor = draft;
      return;
    }

    openGroup = null;
    editor = {
      id: dose.id,
      day: dateInputValueFromEpochDay(epochDayFromTimestamp(dose.timestamp)),
      time: timeInputValue(dose.timestamp),
      route: dose.route,
      dose: String(dose.dose),
      doseUnit: dose.doseUnit,
      injectionSite: isInjectionDose(dose) ? ((dose.injectionSite ?? '') as InjectionSiteKey | '') : '',
      vehicle: (isInjectionDose(dose) ? dose.vehicle : null) ?? 'oil',
      applicationSite: isTopicalDose(dose) ? ((dose.applicationSite ?? '') as ApplicationSiteKey | '') : '',
      status: dose.status,
      scheduledDose: dose.scheduled ? String(dose.scheduled.dose) : String(dose.dose),
      scheduledRoute: dose.scheduled?.route ?? dose.route,
      scheduledTime: timeInputValue(dose.scheduled?.timestamp ?? dose.timestamp),
      drug: dose.drug ?? ''
    };
  }

  /** Picking a drug in the disambiguation prompt also seeds the amount, the
      unit and the route from that episode, the same convenience a single
      active episode already gets for free. */
  function pickDrug(drug: string) {
    if (!editor) return;
    const match = activeEpisodes.find((e) => e.drug === drug);
    if (!match) {
      editor = { ...editor, drug };
      return;
    }
    editor = {
      ...editor,
      drug,
      dose: String(match.dose),
      doseUnit: match.doseUnit,
      route: matchDoseRoute(match.route, ROUTE_OPTIONS) ?? editor.route
    };
  }

  /* What the record's three lines state, and the one rule they share: a
     line says the fact, never the question. The label of the field
     underneath stands in only where there is no fact yet - a new dose with
     nothing to seed an amount from - and the line marks itself unset so it
     does not read as a value.

     The drug is the episode covering the moment being logged, resolved the
     same way the log rows resolve it, so correcting a date in the editor
     moves the line onto the episode that really covered it. */
  let editorEpisode = $derived.by(() => {
    const draft = editor;
    if (!draft) return null;
    const at = activeEpisodesAt(episodes, timestampOf(draft.day, draft.time));
    if (draft.drug) return at.find((e) => e.drug === draft.drug) ?? null;
    return at.length === 1 ? at[0] : null;
  });

  let editorHasAmount = $derived(editor !== null && !isNaN(parseFloat(editor.dose)));
  let editorAmountText = $derived(
    editor && editorHasAmount ? `${editor.dose} ${editor.doseUnit}`.trim() : m.dose_amount_label()
  );
  let editorDrugText = $derived(editor?.drug.trim() || editorEpisode?.drug || '');
  let editorRouteText = $derived.by(() => {
    if (!editor) return '';
    /* The middot, not a comma: it is the separator the log's own rows use
       between a route and a vehicle, and it carries the capital letter each
       of those labels legitimately has where a comma would not. */
    if (isInjectionDose(editor)) return `${routeLabel(editor.route)} · ${vehicleLabel(editor.vehicle)}`;
    return routeLabel(editor.route);
  });
  let editorWhenText = $derived(
    editor
      ? `${fmtDayShort(epochDayFromDateInputValueOrToday(editor.day))}, ${fmtTime(timestampOf(editor.day, editor.time))}`
      : ''
  );

  let editorIsInjection = $derived(editor !== null && isInjectionDose(editor));

  /** The map's two history marks, both read at the moment of the dose being
      logged rather than one from then and one from today (ticket 13). The
      recency shades every dot and the last injection rings one of them, so
      a dose being edited a fortnight back would otherwise carry a fill
      measured from today under a ring measured from then. For a new dose,
      which is nearly every dose, the moment is now and this is the read it
      always was.

      Both leave out the dose being edited, the way lastInjectionBefore
      already does on its own: a dose is never its own predecessor. */
  let editorMoment = $derived(editor ? timestampOf(editor.day, editor.time) : null);
  let dosesBeforeEditor = $derived.by(() => {
    const moment = editorMoment;
    if (moment === null) return allInjectionDosesQuery.rows;
    const editing = editor?.id;
    return allInjectionDosesQuery.rows.filter((d) => d.timestamp < moment && d.id !== editing);
  });
  let siteRecencyByKey = $derived(
    siteRecency(
      dosesBeforeEditor,
      editorMoment === null ? today : epochDayFromTimestamp(editorMoment)
    )
  );
  /** Read off the whole log rather than the 90-day window the list shows: a
      rotation site's last use routinely predates that window, which is why
      allInjectionDosesQuery exists. */
  let lastUsedSite = $derived(
    editorMoment === null
      ? null
      : (lastInjectionBefore(dosesBeforeEditor, editorMoment)?.injectionSite ?? null)
  );
  let editorIsTopical = $derived(editor !== null && isTopicalDose(editor));
  /* An injection with no site picked yet cannot be saved: a rotation map
     nobody tapped would store an empty site and quietly break the rotation
     it exists for. Nor can a new dose while several episodes are active
     and none has been picked - that is exactly the ambiguity this ticket
     exists to stop from being drawn into the wrong drug's curve. */
  let editorCanSave = $derived(
    editor !== null &&
      editorHasAmount &&
      (!editorIsInjection || editor.injectionSite !== '') &&
      (!editorIsTopical || editor.applicationSite !== '') &&
      (!editorNeedsDrugPick || editor.drug !== '')
  );

  async function saveDose() {
    if (!editor || !editorCanSave) return;
    const timestamp = timestampOf(editor.day, editor.time);
    const dose = parseFloat(editor.dose);
    const doseUnit = editor.doseUnit.trim();
    const scheduled =
      editor.status === 'changed'
        ? {
            dose: parseFloat(editor.scheduledDose) || dose,
            route: editor.scheduledRoute,
            timestamp: timestampOf(editor.day, editor.scheduledTime)
          }
        : null;

    /* Split by route so each call carries exactly the fields its arm has,
       which is what stops an oral dose from arriving with a site (types.ts).
       Each branch refuses an untapped picker outright rather than falling
       through to the next, which would have written an injection as though
       it had no site to record. */
    const drug = editor.drug.trim() || null;

    if (isInjectionDose(editor)) {
      if (editor.injectionSite === '') return;
      await journal.doses.upsertDose({
        id: editor.id,
        timestamp,
        route: editor.route,
        dose,
        doseUnit,
        injectionSite: editor.injectionSite,
        vehicle: editor.vehicle,
        status: editor.status,
        scheduled,
        drug
      });
    } else if (isTopicalDose(editor)) {
      if (editor.applicationSite === '') return;
      await journal.doses.upsertDose({
        id: editor.id,
        timestamp,
        route: editor.route,
        dose,
        doseUnit,
        applicationSite: editor.applicationSite,
        status: editor.status,
        scheduled,
        drug
      });
    } else if (editor.route === 'oral' || editor.route === 'sublingual') {
      /* Spelled out rather than left as a bare `else`: the editor's draft is a
         plain record, not the union, so nothing subtracts the other four
         routes from it here. The three branches cover all six between them. */
      await journal.doses.upsertDose({
        id: editor.id,
        timestamp,
        route: editor.route,
        dose,
        doseUnit,
        status: editor.status,
        scheduled,
        drug
      });
    }
    editor = null;
  }

  async function deleteDose() {
    if (!editor?.id) return;
    await journal.doses.deleteDose(editor.id);
    editor = null;
  }
</script>

<div class="screen">
  <!-- The one screen of the twenty-six with two real ways in. It is a hub
       row (SCREENS.md's Health group), so the rule this ticket set - a
       feature screen goes back to /more, not to /settings - applies to it;
       it is also opened from inside regimen and from the hormone curve,
       and throwing someone from there to the hub is the NAV-005 complaint
       exactly. The header goes back where there is something to go back to
       and takes the hub where there is not, which is the answer for a
       screen with two doors rather than a third hardcoded one. -->
  <ScreenHeader title={m.doses()} back="/more" subtitle={m.doses_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.doses_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <Segmented
    name={m.doses()}
    value={view}
    options={[
      { value: 'log', label: m.doses_view_log() },
      { value: 'schedule', label: m.doses_view_schedule() }
    ]}
    onChange={(v) => (view = v as 'log' | 'schedule')}
    key="doses-view"
  />

  {#if loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if view === 'log'}
    {#if stockRows.length}
      <!-- What the log is spending (phase 5 deepening ticket 06): every
           drug with a stock entry, read and worded the same way
           /settings/stock does (vocabulary/stockLabel.ts, ADR-0046). A
           reading, not a control - editing a count still happens on
           /settings/stock, so this row is static. -->
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.doses)}>
          {#each stockRows as row (row.entry.id)}
            {@const runOut = stockRunOutLabel(row.projection, today)}
            <ListRow
              static
              data-stock={row.entry.id}
              title={row.entry.drug}
              subtitle={[stockRemainingLabel(row.projection.remaining, row.entry.unit), runOut.text]}
            >
              {#snippet leading()}
                <span class="kit-row-ico" class:is-warn={runOut.warn}>
                  <Icon name="package" size={22} />
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/if}
    {#if doses.length}
      <div class="screen-part">
        <p class="muted small" style="margin:var(--space-3) 0">{m.doses_window({ days: WINDOW_DAYS })}</p>
        <BatchedList
          items={logRows}
          key="doses"
          role={roleAt(activeFlag.roles, SECTION_ROLE.doses)}
          focusIndex={deepLinkedDoseIndex >= 0 ? deepLinkedDoseIndex : null}
        >
          {#snippet rows(shownRows)}
            {#each shownRows as { dose, attribution } (dose.id)}
              {@const site = siteOf(dose)}
              <ListRow
                key={dose.id}
                data-dose={dose.id}
                id={dose.id}
                icon="clock"
                title={`${dose.dose} ${dose.doseUnit} · ${routeLabel(dose.route)}`}
                subtitle={[
                  whenOf(dose),
                  site,
                  isInjectionDose(dose) && dose.vehicle ? vehicleLabel(dose.vehicle) : ''
                ]
                  .filter(Boolean)
                  .join(' · ')}
                chevron={false}
                onclick={() => openEditor(dose)}
              >
                {#snippet trailing()}
                  <!-- The bookkeeping, at the end of the row rather than as
                       two more lines under the dose: which episode the app
                       attributed it to, whether it was taken as logged, and
                       what a schedule had asked for. All three are about the
                       record rather than about the dose. -->
                  <span class="dose-trail">
                    {#if dose.status !== 'taken'}
                      <span class="dose-status">{statusLabel(dose.status)}</span>
                    {/if}
                    <span>
                      {#if attribution.episode}
                        {m.doses_under_episode({ drug: attribution.episode.drug })}
                      {:else if attribution.ambiguous}
                        {m.doses_ambiguous_episode()}
                      {:else}
                        {m.doses_no_episode()}
                      {/if}
                    </span>
                    {#if dose.scheduled}
                      <span>
                        {m.dose_scheduled_legend()}: {dose.scheduled.dose}
                        {dose.doseUnit} · {routeLabel(dose.scheduled.route)} · {fmtTime(dose.scheduled.timestamp)}
                      </span>
                    {/if}
                  </span>
                {/snippet}
              </ListRow>
            {/each}
          {/snippet}
        </BatchedList>
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="clock"
          key="doses-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.doses)}
          title={m.doses_empty_title()}
          text={m.doses_empty_body()}
          action={{ label: m.doses_empty_action(), primary: true, onclick: () => openEditor(null) }}
        />
      </div>
    {/if}
  {:else if comparisonQuery.loading}
    <!-- The comparison is one read, so the schedule view waits for it rather
         than deciding on half an answer: the old shape read four lists and
         showed "no schedule yet" for as long as the schedules were in
         flight. On `loading` alone, though, and not on "no value yet" - a
         read that failed reports itself done with nothing, and a placeholder
         held forever tells the reader less than a statement does
         (kit/readGate.ts). -->
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if !scheduleView || scheduleView.reason === 'noEpisode'}
    <!-- Either nothing is in effect to compare against, or the read did not
         work. readGate.ts's rule for a screen that passes no failed snippet
         is that the two share the empty state, and this is the schedule
         view's: there is nothing to compare. Telling them apart here would
         be a fourth notice and its own copy, which is a call for the ticket
         that wants it. -->
    <Notice icon="info" key="adherence-none" text={m.adherence_no_episode()} />
  {:else if scheduleView.reason === 'multipleEpisodes'}
    <Notice icon="info" key="adherence-multiple" text={m.adherence_multiple_episodes()} />
  {:else if scheduleView.reason === 'noSchedule'}
    <Notice
      icon="info"
      key="adherence-no-schedule"
      text={m.adherence_no_schedule({ drug: scheduleView.activeEpisode.drug })}
    />
  {:else}
    <!-- Every remaining reason is `null`, which is the one that means there is
         a comparison to show. Named rather than read through `scheduleView`
         so the branch below says `comparison.rows` where it means them; not
         `view`, which is the tab this screen is on. -->
    {@const comparison = scheduleView}
    <div class="screen-part">
      <p class="muted small" style="margin:var(--space-3) 0">
        {m.adherence_for_episode({ drug: comparison.activeEpisode.drug })}
      </p>
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}>
        {#each [...comparison.comparison.rows].reverse() as row (`${row.slot.epochDay}-${row.slot.indexInDay}`)}
          <ListRow
            static
            data-slot={`${row.slot.epochDay}-${row.slot.indexInDay}`}
            title={fmtDayLong(row.slot.epochDay)}
            subtitle={[
              comparison.schedule.dosesPerDay > 1 &&
                m.adherence_slot_numbered({ index: row.slot.indexInDay + 1, count: comparison.schedule.dosesPerDay }),
              row.slot.amount && m.adherence_slot_amount({ dose: row.slot.amount.dose, unit: row.slot.amount.doseUnit })
            ]}
          >
            {#snippet trailing()}
              {#if row.dose}
                {row.dose.dose} {row.dose.doseUnit} · {statusLabel(row.dose.status)}
              {:else}
                {m.adherence_nothing_logged()}
              {/if}
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>

      {#if comparison.pauses.length}
        <SectionHeading text={m.adherence_paused_heading()} />
        <p class="muted small">{m.adherence_paused_note()}</p>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.leftover)}>
          {#each comparison.pauses as pause (pause.id)}
            <ListRow
              static
              data-pause={pause.id}
              title={pause.endEpochDay === null
                ? m.adherence_paused_open({ from: fmtDayLong(pause.startEpochDay) })
                : m.adherence_paused_range({
                    from: fmtDayLong(pause.startEpochDay),
                    to: fmtDayLong(pause.endEpochDay)
                  })}
              subtitle={pauseReasonLabel(pause.reason)}
            />
          {/each}
        </ListCard>
      {/if}

      {#if comparison.comparison.unmatched.length}
        <SectionHeading text={m.adherence_unmatched_heading()} />
        <p class="muted small">{m.adherence_unmatched_note()}</p>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.leftover)}>
          {#each comparison.comparison.unmatched as dose (dose.id)}
            <ListRow
              static
              data-unmatched={dose.id}
              title={`${dose.dose} ${dose.doseUnit} · ${routeLabel(dose.route)}`}
              subtitle={whenOf(dose)}
            />
          {/each}
        </ListCard>
      {/if}
    </div>
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.dose_edit_sheet() : m.dose_new_sheet()}
    onClose={() => (editor = null)}
  >
    {#if editor}
      <!-- The record, and the whole of this redesign (phase 5 UX ticket 37).

           Alicja, 2026-08-26: "current setting in the popup are too many
           and too big". Six controls stood here for a dose logged as it was
           taken - a day, a time, a route, an amount, a unit and a status -
           and an active regimen already settles four of them. So they are
           not controls any more. Three lines state what is about to be
           recorded, each one opening the fields that made it if the
           statement is wrong, and what is left drawn as a control is the
           part that genuinely changes from dose to dose: where the needle
           went.

           There is no heading above them. Every other sheet in the app
           opens with one, and the argument for dropping it here is that
           this sheet opens on the thing itself - "4 mg estradiol" in the
           display face is a better answer to "what did I just tap" than
           the words "Log a dose" over the same information smaller. The
           sheet still carries the title as its accessible name (Sheet.svelte
           passes it to aria-label), so nothing is lost to a screen reader.

           Each line is a button whose name is the value it states, plus
           aria-expanded, which is what a disclosure owes: the values are
           the useful half of the name and "collapsed" is already spoken.
           A row the width of the screen answers a press by filling rather
           than by scaling (DIRECTION.md, tier 1), so no .press here. -->
      <div class="dose-record">
        <button
          type="button"
          class="dose-line"
          class:is-unset={!editorHasAmount}
          aria-expanded={openGroup === 'what'}
          data-dose-what
          onclick={() => toggleGroup('what')}
        >
          <span class="dose-line-text">
            <span class="dose-line-lead">
              <span class="dose-line-amount">{editorAmountText}</span>
              <!-- Where several regimens are running and none has been
                   picked, the line says what is missing rather than saying
                   nothing: the group opens itself on this state, but it can
                   be closed again, and a Save that will not fire needs a
                   reason on screen. -->
              {#if editorDrugText}
                <span class="dose-line-drug">{editorDrugText}</span>
              {:else if editorNeedsDrugPick}
                <span class="dose-line-drug">{m.dose_drug_label()}</span>
              {/if}
            </span>
            <span class="dose-line-sub">{editorRouteText}</span>
          </span>
          <span class="dose-chev"><Icon name="chevronDown" size={20} /></span>
        </button>

        {#if openGroup === 'what'}
          <div class="disclosed" transition:disclose|local>
            {#if editorNeedsDrugPick}
              <Field label={m.dose_drug_label()} legend>
                {#snippet children(id)}
                  <p class="muted small">{m.dose_drug_hint()}</p>
                  <div class="tag-row" role="group" aria-labelledby={id}>
                    {#each activeDrugChoices as drug (drug)}
                      <button
                        type="button"
                        class="tag-chip press"
                        class:is-selected={editor!.drug === drug}
                        aria-pressed={editor!.drug === drug}
                        data-dose-drug={drug}
                        onclick={() => pickDrug(drug)}
                      >
                        {drug}
                      </button>
                    {/each}
                  </div>
                {/snippet}
              </Field>
            {/if}

            <!-- One value, one control. The amount and its unit were two
                 full-width fields side by side for a figure nobody reads as
                 two things; the unit sits inside the box now, right after
                 the number, so the pair reads as "4 mg" rather than as two
                 answers to two questions.

                 No visible label, which is the one place this sheet drops
                 one. The line directly above the open group already states
                 this exact value, and where there is nothing to state it
                 states the word "Dose" instead - so a label here would be
                 the third time the same word appeared in four lines. Both
                 inputs carry it as an accessible name, which is what a
                 field without a visible label owes.

                 Left hand-written rather than moved onto Field.svelte
                 (ticket 10): Field is one label naming one control, and
                 this wrapper holds two, each already named its own way. -->
            <div class="field">
              <div class="dose-amount">
                <input
                  class="dose-amount-num"
                  type="number"
                  id="dose-amount"
                  name="dose-amount"
                  inputmode="decimal"
                  aria-label={m.dose_amount_label()}
                  placeholder={m.dose_amount_placeholder()}
                  bind:value={editor.dose}
                />
                <input
                  class="dose-amount-unit"
                  id="dose-unit"
                  name="dose-unit"
                  aria-label={m.dose_unit_label()}
                  placeholder={m.dose_unit_placeholder()}
                  bind:value={editor.doseUnit}
                />
              </div>
            </div>

            <Field label={m.dose_route_label()} legend>
              {#snippet children(id)}
                <div class="tag-row" role="group" aria-labelledby={id}>
                  {#each ROUTE_OPTIONS as option (option.value)}
                    <button
                      type="button"
                      class="tag-chip press"
                      class:is-selected={editor!.route === option.value}
                      aria-pressed={editor!.route === option.value}
                      data-route={option.value}
                      onclick={() => editor && (editor.route = option.value)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              {/snippet}
            </Field>

            <!-- The vehicle belongs to what the dose was, not to where it
                 went: the line above already reads "Intramuscular, oil". -->
            {#if editorIsInjection}
              <Field label={m.dose_vehicle_label()} legend>
                {#snippet children(id)}
                  <div class="tag-row" role="group" aria-labelledby={id}>
                    {#each ['oil', 'aqueous'] as const as vehicle (vehicle)}
                      <button
                        type="button"
                        class="tag-chip press"
                        class:is-selected={editor!.vehicle === vehicle}
                        aria-pressed={editor!.vehicle === vehicle}
                        data-vehicle={vehicle}
                        onclick={() => editor && (editor.vehicle = vehicle)}
                      >
                        {vehicleLabel(vehicle)}
                      </button>
                    {/each}
                  </div>
                {/snippet}
              </Field>
            {/if}
          </div>
        {/if}

        <button
          type="button"
          class="dose-line"
          aria-expanded={openGroup === 'when'}
          data-dose-when
          onclick={() => toggleGroup('when')}
        >
          <span class="dose-line-text">
            <span class="dose-line-value">{editorWhenText}</span>
          </span>
          <span class="dose-chev"><Icon name="chevronDown" size={20} /></span>
        </button>

        {#if openGroup === 'when'}
          <div class="disclosed" transition:disclose|local>
            <div class="cd-endpoints">
              <Field label={m.dose_day_label()} id="dose-day">
                {#snippet children(id)}
                  <DatePicker name="dose-day" bind:value={editor!.day} {id} />
                {/snippet}
              </Field>
              <Field label={m.dose_time_label()} id="dose-time">
                {#snippet children(id)}
                  <input class="input" type="time" {id} name="dose-time" bind:value={editor!.time} />
                {/snippet}
              </Field>
            </div>
            <p class="muted small">{m.dose_time_hint()}</p>
          </div>
        {/if}

        <!-- The correction job, folded away. Logging a dose that happened
             and recording that one did not happen as scheduled are two
             jobs, and the second was costing the first a full-width
             segmented control and three more fields under it. It is one
             quiet line stating the status, and everything the correction
             needs is behind it. -->
        <button
          type="button"
          class="dose-line is-quiet"
          aria-expanded={openGroup === 'status'}
          data-dose-status
          onclick={() => toggleGroup('status')}
        >
          <span class="dose-line-text">
            <span class="dose-line-value">{statusLabel(editor.status)}</span>
          </span>
          <span class="dose-chev"><Icon name="chevronDown" size={20} /></span>
        </button>

        {#if openGroup === 'status'}
          <div class="disclosed" transition:disclose|local>
            <Field label={m.dose_status_label()} legend>
              {#snippet children()}
                <Segmented
                  name={m.dose_status_label()}
                  value={editor!.status}
                  options={STATUS_OPTIONS}
                  onChange={(v) => editor && (editor.status = v as DoseStatus)}
                />
              {/snippet}
            </Field>

            {#if editor.status === 'changed'}
              <div class="disclosed" transition:disclose|local>
                <FieldGroupHeading legend={m.dose_scheduled_legend()} hint={m.dose_scheduled_hint()} />
                <div class="cd-endpoints">
                  <Field label={m.dose_scheduled_amount_label()} id="dose-scheduled-amount">
                    {#snippet children(id)}
                      <input
                        class="input"
                        type="number"
                        {id}
                        name="dose-scheduled-amount"
                        inputmode="decimal"
                        bind:value={editor!.scheduledDose}
                      />
                    {/snippet}
                  </Field>
                  <Field label={m.dose_scheduled_time_label()} id="dose-scheduled-time">
                    {#snippet children(id)}
                      <input
                        class="input"
                        type="time"
                        {id}
                        name="dose-scheduled-time"
                        bind:value={editor!.scheduledTime}
                      />
                    {/snippet}
                  </Field>
                </div>
                <Field label={m.dose_scheduled_route_label()} legend>
                  {#snippet children(id)}
                    <div class="tag-row" role="group" aria-labelledby={id}>
                      {#each ROUTE_OPTIONS as option (option.value)}
                        <button
                          type="button"
                          class="tag-chip press"
                          class:is-selected={editor!.scheduledRoute === option.value}
                          aria-pressed={editor!.scheduledRoute === option.value}
                          onclick={() => editor && (editor.scheduledRoute = option.value)}
                        >
                          {option.label}
                        </button>
                      {/each}
                    </div>
                  {/snippet}
                </Field>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- The one thing a regimen cannot know, so the one thing still drawn
           as a control: a rotation only works if every dose says where it
           went. Left outside the record and above the save, where it reads
           as the question the sheet is actually asking. -->
      {#if editorIsInjection}
        <!-- The transition lands on this wrapper rather than inside
             Field.svelte: a transition: directive attaches to the element
             it is written on, which a component boundary can't forward. -->
        <div transition:disclose|local>
          <Field label={m.dose_injection_site_label()} legend>
            {#snippet children()}
              <p class="muted small">{m.dose_injection_site_hint()}</p>
              <InjectionSiteMap
                value={editor!.injectionSite}
                lastUsed={lastUsedSite}
                recency={siteRecencyByKey}
                onChange={(site) => editor && (editor.injectionSite = site)}
              />
            {/snippet}
          </Field>
        </div>
      {/if}

      {#if editorIsTopical}
        <!-- A flat row of chips, not the rotation map: a patch or gel site is
             not rotated on an injection site's schedule. -->
        <Field label={m.dose_app_site_label()} legend>
          {#snippet children(id)}
            <div class="tag-row" role="group" aria-labelledby={id}>
              {#each APPLICATION_SITES as site (site)}
                <button
                  type="button"
                  class="tag-chip press"
                  class:is-selected={editor!.applicationSite === site}
                  aria-pressed={editor!.applicationSite === site}
                  data-app-site={site}
                  onclick={() => editor && (editor.applicationSite = site)}
                >
                  {applicationSiteLabel(site)}
                </button>
              {/each}
            </div>
          {/snippet}
        </Field>
      {/if}

      <div class="stack-3">
        <button class="btn btn-primary" data-save-dose disabled={!editorCanSave} onclick={saveDose}>
          <span>{m.dose_save()}</span>
        </button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-dose onclick={deleteDose}><span>{m.dose_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>

<style>
  /* The bookkeeping stacks at the end of the row rather than running along
     it: three facts on one line at 390px is an ellipsis, and the widest of
     them is a whole scheduled dose written out. Right-aligned, so the
     column of them reads down the edge of the card. */
  .dose-trail {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    text-align: right;
    max-width: 12rem;
    line-height: 1.25;
  }

  .dose-status {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  /* The warn signal, on the icon disc exactly as /settings/stock's own row -
     one presentation of the projection wherever it appears (ADR-0046). */
  .kit-row-ico.is-warn {
    background: var(--warn-soft);
    color: var(--on-warn-soft);
    border-color: transparent;
  }

  /* The record's three lines (phase 5 UX ticket 37). Uncontained: the sheet
     is already the app's second surface and a panel drawn inside it would be
     a card inside a card. What divides the lines is the hairline a list row
     uses, so the three read as one object rather than as three blocks. */
  .dose-line {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target);
    padding: var(--space-3) 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }

  /* Tier 1: a row the width of the screen fills rather than scales, because
     scaling one moves the sheet it sits in. The fill is neutral rather than
     a role wash - the kit's role tokens are keyed to its own surfaces, and
     an editor spends almost none of the flag (DIRECTION.md, ticket 22). */
  .dose-line:active {
    background: var(--surface-2);
  }

  .dose-line + .dose-line,
  .disclosed + .dose-line {
    border-top: 1px solid var(--hairline);
  }

  .dose-line-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* The amount and the drug sit on one line as one statement: the figure in
     the display face at the screen-title size, the drug beside it in body
     text. Baseline-aligned, so the two read as a phrase and not as a heading
     with a caption wedged next to it. */
  .dose-line-lead {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .dose-line-amount {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--display-track);
    line-height: var(--leading-display);
  }

  .dose-line-drug {
    font-size: var(--text-md);
    color: var(--text-2);
  }

  /* Nothing seeded an amount, so the line is showing the label of the field
     open underneath it rather than a value. Said in the secondary colour so
     it does not read as one. */
  .dose-line.is-unset .dose-line-amount {
    color: var(--text-2);
  }

  .dose-line-sub {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .dose-line-value {
    font-size: var(--text-md);
  }

  /* The status line. Quiet on purpose: "Taken" is the answer on almost every
     dose ever logged, and the line exists so the other two answers are one
     tap away rather than to be read every time. */
  .dose-line.is-quiet .dose-line-value {
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .dose-chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--text-2);
    transition: transform var(--dur-med) var(--ease-out);
  }

  /* The chevron says what happened, which is also what carries the state
     under reduced motion: the rotation lands instantly there (the 1ms clamp
     on --dur-med) instead of being dropped. */
  .dose-line[aria-expanded='true'] .dose-chev {
    transform: rotate(180deg);
  }

  /* One value, one box. The unit is a suffix inside the amount's own field
     rather than a second full-width field beside it, and the box is sized to
     what it holds rather than to the sheet, because an amount is three
     characters and a field the width of the screen says otherwise. */
  .dose-amount {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: fit-content;
    max-width: 14rem;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-4);
    min-height: var(--touch-target);
    transition: border-color var(--dur-fast) var(--ease-out);
  }

  .dose-amount:focus-within {
    border-color: var(--accent);
  }

  /* The floor stays on the inputs, not only on the box around them. The box
     is a plain div: it labels nothing and focuses nothing, so 48px of it
     with a 20px input centred inside is 28px of dead height that looks
     tappable and is not. PRODUCT.md's floor is Android's 48dp and this is
     the sheet's only text entry. */
  .dose-amount input {
    font: inherit;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
    min-width: 0;
    min-height: var(--touch-target);
  }

  .dose-amount input:focus {
    outline: none;
  }

  /* Both inputs size to what is in them, so "4" and "mg" sit next to each
     other instead of at opposite ends of a box. `field-sizing` is Chromium's
     and this app ships inside a Chromium WebView; where it is missing the
     two fall back to their intrinsic widths and the box hits the max-width
     above, which is a wider version of the same field rather than a broken
     one. The floors stop an empty field collapsing to nothing and keep both
     placeholders readable.

     The spinners come off. They are a mouse affordance on a control that
     declares inputmode="decimal", and inside this box they would land
     between the number and its unit. */
  .dose-amount-num {
    field-sizing: content;
    min-width: 5ch;
    max-width: 9ch;
    appearance: textfield;
  }

  .dose-amount-num::-webkit-outer-spin-button,
  .dose-amount-num::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }

  .dose-amount-unit {
    field-sizing: content;
    min-width: 6ch;
    max-width: 8ch;
    color: var(--text-2);
  }
</style>
