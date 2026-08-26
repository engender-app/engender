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
     phase 5 ticket 38). Two views over the same three reads: what was
     logged, and how it sits against what the active episode's schedule
     expected.

     A dose usually stores no drug or regimen episode of its own - every
     row asks attributeDose with the dose's own timestamp, which is why
     correcting a date in the editor below moves the dose to a different
     episode with nothing else to update. `drug` only exists to break a
     tie when more than one episode is active at once for different drugs
     (regimenEpisode.ts). */
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt, attributeDose } from '$lib/data/regimenEpisode';
  import {
    adherence,
    expectedAmountOn,
    expectedSlots,
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
    epochDayFromDateInputValue,
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
  import type { ApplicationSiteKey, InjectionSiteKey } from '$lib/data/doseSchedule';
  import type { DoseEvent, DoseRoute, DoseStatus, InjectionVehicle } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import InjectionSiteMap from '$lib/components/InjectionSiteMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
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
  const today = todayEpochDay();
  const from = today - WINDOW_DAYS;

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let dosesQuery = liveQuery(['dose'], (j) => j.doses.getDoses(from, today));
  let schedulesQuery = liveQuery(['dose'], (j) => j.doses.getSchedules());
  let pausesQuery = liveQuery(['dose'], (j) => j.doses.getPauses());
  /** Read separately from the windowed `dosesQuery` above (ticket 10): a
      rotation site's last use routinely predates the log's 90-day window,
      and "never used" has to mean never, not merely not in that window. */
  let allInjectionDosesQuery = liveQuery(['dose'], (j) => j.doses.getDoses(0, today));

  let episodes = $derived(episodesQuery.value ?? []);
  let doses = $derived(dosesQuery.value ?? []);
  let schedules = $derived(schedulesQuery.value ?? []);
  let pauses = $derived(pausesQuery.value ?? []);
  let siteRecencyByKey = $derived(siteRecency(allInjectionDosesQuery.value ?? [], today));
  let loading = $derived(episodesQuery.loading || dosesQuery.loading);

  let view = $state<'log' | 'schedule'>('log');

  /* Every episode active right now (phase 5 ticket 38): usually one, but a
     concurrent second drug's episode makes it two. `activeEpisode` stays
     the single-episode question the schedule tab and the new-dose prefill
     both ask - null covers "none" and "more than one" alike, the same
     `m.adherence_no_episode()` fallback either way, so a single active
     episode still behaves exactly as before with no added friction. */
  let activeEpisodes = $derived(activeEpisodesAt(episodes, Date.now()));
  let activeEpisode = $derived(activeEpisodes.length === 1 ? activeEpisodes[0] : null);
  /** The drugs to choose between when logging a new dose while more than
      one episode is active - empty whenever activeEpisode already answers
      the question on its own. */
  let activeDrugChoices = $derived([...new Set(activeEpisodes.map((e) => e.drug))]);
  let activeSchedule = $derived(schedules.find((s) => s.episodeId === activeEpisode?.id) ?? null);
  let activePauses = $derived(pauses.filter((p) => p.episodeId === activeEpisode?.id));

  /* Only the doses this episode is responsible for. Comparing every dose in
     the window against one episode's slots put each earlier episode's doses
     in the unmatched list, where the wording says they were extras or fell in
     a pause - neither of which was true. Resolved rather than filtered by
     date so the split is the same one every other screen makes. */
  let episodeDoses = $derived(
    activeEpisode ? doses.filter((dose) => attributeDose(episodes, dose).episode?.id === activeEpisode.id) : []
  );

  /* The comparison runs from the episode's own start day, so a schedule's
     slots line up with the episode rather than with the window's edge. */
  let comparison = $derived.by(() => {
    if (!activeEpisode || !activeSchedule) return null;
    const slots = expectedSlots(activeSchedule, activeEpisode.startEpochDay, from, today);
    return adherence(slots, episodeDoses, activePauses);
  });

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
    const epochDay = epochDayFromDateInputValue(dayValue) ?? today;
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
      several active episodes it is for - not for editing an old dose,
      whose own drug (if any) is shown but never forced. */
  let editorNeedsDrugPick = $derived(editor !== null && !editor.id && activeDrugChoices.length > 1);

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
      const seededAmount = comparison ? expectedAmountOn(comparison, today) : null;
      const lastInjection = lastInjectionBefore(doses, now);
      editor = {
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
         amount nothing seeded, and several active episodes with no drug
         picked yet. Everything else opens stated and closed. */
      openGroup = editor.dose === '' || activeDrugChoices.length > 1 ? 'what' : null;
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
    if (isInjectionDose(editor)) return `${routeLabel(editor.route)}, ${vehicleLabel(editor.vehicle)}`;
    return routeLabel(editor.route);
  });
  let editorWhenText = $derived(
    editor
      ? `${fmtDayShort(epochDayFromDateInputValue(editor.day) ?? today)}, ${fmtTime(timestampOf(editor.day, editor.time))}`
      : ''
  );

  let editorIsInjection = $derived(editor !== null && isInjectionDose(editor));
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
       exactly. smartBack goes back where there is something to go back to
       and falls back to the hub where there is not, which is the answer
       for a screen with two doors rather than a third hardcoded one. -->
  <ScreenHeader title={m.doses()} back={() => smartBack('/more')} subtitle={m.doses_intro()}>
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
    {#if doses.length}
      <div class="screen-part">
        <p class="muted small" style="margin:var(--space-3) 0">{m.doses_window({ days: WINDOW_DAYS })}</p>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.doses)}>
          {#each [...doses].reverse() as dose (dose.id)}
            {@const attribution = attributeDose(episodes, dose)}
            {@const site = siteOf(dose)}
            <ListRow
              key={dose.id}
              data-dose={dose.id}
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
        </ListCard>
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
  {:else if activeEpisodes.length > 1}
    <Notice icon="info" key="adherence-multiple" text={m.adherence_multiple_episodes()} />
  {:else if !activeEpisode}
    <Notice icon="info" key="adherence-none" text={m.adherence_no_episode()} />
  {:else if !activeSchedule}
    <Notice icon="info" key="adherence-no-schedule" text={m.adherence_no_schedule({ drug: activeEpisode.drug })} />
  {:else if comparison}
    <div class="screen-part">
      <p class="muted small" style="margin:var(--space-3) 0">
        {m.adherence_for_episode({ drug: activeEpisode.drug })}
      </p>
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.schedule)}>
        {#each [...comparison.rows].reverse() as row (`${row.slot.epochDay}-${row.slot.indexInDay}`)}
          <div class="kit-row is-static" data-slot={`${row.slot.epochDay}-${row.slot.indexInDay}`}>
            <span class="kit-row-text">
              <span class="kit-row-title">{fmtDayLong(row.slot.epochDay)}</span>
              {#if activeSchedule.dosesPerDay > 1}
                <span class="kit-row-sub">
                  {m.adherence_slot_numbered({ index: row.slot.indexInDay + 1, count: activeSchedule.dosesPerDay })}
                </span>
              {/if}
              {#if row.slot.amount}
                <span class="kit-row-sub">
                  {m.adherence_slot_amount({ dose: row.slot.amount.dose, unit: row.slot.amount.doseUnit })}
                </span>
              {/if}
            </span>
            <span class="kit-row-trail">
              {#if row.dose}
                {row.dose.dose} {row.dose.doseUnit} · {statusLabel(row.dose.status)}
              {:else}
                {m.adherence_nothing_logged()}
              {/if}
            </span>
          </div>
        {/each}
      </ListCard>

      {#if activePauses.length}
        <SectionHeading text={m.adherence_paused_heading()} />
        <p class="muted small">{m.adherence_paused_note()}</p>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.leftover)}>
          {#each activePauses as pause (pause.id)}
            <div class="kit-row is-static" data-pause={pause.id}>
              <span class="kit-row-text">
                <span class="kit-row-title">
                  {pause.endEpochDay === null
                    ? m.adherence_paused_open({ from: fmtDayLong(pause.startEpochDay) })
                    : m.adherence_paused_range({
                        from: fmtDayLong(pause.startEpochDay),
                        to: fmtDayLong(pause.endEpochDay)
                      })}
                </span>
                <span class="kit-row-sub">{pauseReasonLabel(pause.reason)}</span>
              </span>
            </div>
          {/each}
        </ListCard>
      {/if}

      {#if comparison.unmatched.length}
        <SectionHeading text={m.adherence_unmatched_heading()} />
        <p class="muted small">{m.adherence_unmatched_note()}</p>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.leftover)}>
          {#each comparison.unmatched as dose (dose.id)}
            <div class="kit-row is-static" data-unmatched={dose.id}>
              <span class="kit-row-text">
                <span class="kit-row-title">{dose.dose} {dose.doseUnit} · {routeLabel(dose.route)}</span>
                <span class="kit-row-sub">{whenOf(dose)}</span>
              </span>
            </div>
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
              <span class="dose-amount-said">{editorAmountText}</span>
              {#if editorDrugText}<span class="dose-drug-said">{editorDrugText}</span>{/if}
            </span>
            <span class="dose-line-sub">{editorRouteText}</span>
          </span>
          <span class="dose-chev"><Icon name="chevronDown" size={20} /></span>
        </button>

        {#if openGroup === 'what'}
          <div class="disclosed" transition:disclose|local>
            {#if editorNeedsDrugPick}
              <div class="field">
                <span class="field-label" id="dose-drug-label">{m.dose_drug_label()}</span>
                <p class="muted small">{m.dose_drug_hint()}</p>
                <div class="tag-row" role="group" aria-labelledby="dose-drug-label">
                  {#each activeDrugChoices as drug (drug)}
                    <button
                      type="button"
                      class="tag-chip press"
                      class:is-selected={editor.drug === drug}
                      aria-pressed={editor.drug === drug}
                      data-dose-drug={drug}
                      onclick={() => pickDrug(drug)}
                    >
                      {drug}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- One value, one control. The amount and its unit were two
                 full-width fields side by side for a figure nobody reads as
                 two things; the unit sits inside the box now, after the
                 number, sized to the two or three characters a unit is. Its
                 label is on the field rather than above it, because a label
                 over a suffix is taller than the thing it names. -->
            <div class="field">
              <label class="field-label" for="dose-amount">{m.dose_amount_label()}</label>
              <div class="dose-amount">
                <input
                  class="dose-amount-num"
                  type="number"
                  id="dose-amount"
                  name="dose-amount"
                  inputmode="decimal"
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

            <div class="field">
              <span class="field-label" id="dose-route-label">{m.dose_route_label()}</span>
              <div class="tag-row" role="group" aria-labelledby="dose-route-label">
                {#each ROUTE_OPTIONS as option (option.value)}
                  <button
                    type="button"
                    class="tag-chip press"
                    class:is-selected={editor.route === option.value}
                    aria-pressed={editor.route === option.value}
                    data-route={option.value}
                    onclick={() => editor && (editor.route = option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>

            <!-- The vehicle belongs to what the dose was, not to where it
                 went: the line above already reads "Intramuscular, oil". -->
            {#if editorIsInjection}
              <div class="field">
                <span class="field-label" id="dose-vehicle-label">{m.dose_vehicle_label()}</span>
                <div class="tag-row" role="group" aria-labelledby="dose-vehicle-label">
                  {#each ['oil', 'aqueous'] as const as vehicle (vehicle)}
                    <button
                      type="button"
                      class="tag-chip press"
                      class:is-selected={editor.vehicle === vehicle}
                      aria-pressed={editor.vehicle === vehicle}
                      data-vehicle={vehicle}
                      onclick={() => editor && (editor.vehicle = vehicle)}
                    >
                      {vehicleLabel(vehicle)}
                    </button>
                  {/each}
                </div>
              </div>
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
              <div class="field">
                <label class="field-label" for="dose-day">{m.dose_day_label()}</label>
                <input class="input" type="date" id="dose-day" name="dose-day" bind:value={editor.day} />
              </div>
              <div class="field">
                <label class="field-label" for="dose-time">{m.dose_time_label()}</label>
                <input class="input" type="time" id="dose-time" name="dose-time" bind:value={editor.time} />
              </div>
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
            <div class="field">
              <span class="field-label">{m.dose_status_label()}</span>
              <Segmented
                name={m.dose_status_label()}
                value={editor.status}
                options={STATUS_OPTIONS}
                onChange={(v) => editor && (editor.status = v as DoseStatus)}
              />
            </div>

            {#if editor.status === 'changed'}
              <div class="disclosed" transition:disclose|local>
                <div class="field">
                  <span class="field-label">{m.dose_scheduled_legend()}</span>
                  <p class="muted small">{m.dose_scheduled_hint()}</p>
                </div>
                <div class="cd-endpoints">
                  <div class="field">
                    <label class="field-label" for="dose-scheduled-amount">{m.dose_scheduled_amount_label()}</label>
                    <input
                      class="input"
                      type="number"
                      id="dose-scheduled-amount"
                      name="dose-scheduled-amount"
                      inputmode="decimal"
                      bind:value={editor.scheduledDose}
                    />
                  </div>
                  <div class="field">
                    <label class="field-label" for="dose-scheduled-time">{m.dose_scheduled_time_label()}</label>
                    <input
                      class="input"
                      type="time"
                      id="dose-scheduled-time"
                      name="dose-scheduled-time"
                      bind:value={editor.scheduledTime}
                    />
                  </div>
                </div>
                <div class="field">
                  <span class="field-label" id="dose-scheduled-route-label">{m.dose_scheduled_route_label()}</span>
                  <div class="tag-row" role="group" aria-labelledby="dose-scheduled-route-label">
                    {#each ROUTE_OPTIONS as option (option.value)}
                      <button
                        type="button"
                        class="tag-chip press"
                        class:is-selected={editor.scheduledRoute === option.value}
                        aria-pressed={editor.scheduledRoute === option.value}
                        onclick={() => editor && (editor.scheduledRoute = option.value)}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                </div>
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
        <div class="field" transition:disclose|local>
          <span class="field-label">{m.dose_injection_site_label()}</span>
          <p class="muted small">{m.dose_injection_site_hint()}</p>
          <InjectionSiteMap
            value={editor.injectionSite}
            lastUsed={lastInjectionBefore(doses, timestampOf(editor.day, editor.time), editor.id)?.injectionSite ?? null}
            recency={siteRecencyByKey}
            onChange={(site) => editor && (editor.injectionSite = site)}
          />
        </div>
      {/if}

      {#if editorIsTopical}
        <!-- A flat row of chips, not the rotation map: a patch or gel site is
             not rotated on an injection site's schedule. -->
        <div class="field">
          <span class="field-label" id="dose-app-site-label">{m.dose_app_site_label()}</span>
          <div class="tag-row" role="group" aria-labelledby="dose-app-site-label">
            {#each APPLICATION_SITES as site (site)}
              <button
                type="button"
                class="tag-chip press"
                class:is-selected={editor.applicationSite === site}
                aria-pressed={editor.applicationSite === site}
                data-app-site={site}
                onclick={() => editor && (editor.applicationSite = site)}
              >
                {applicationSiteLabel(site)}
              </button>
            {/each}
          </div>
        </div>
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

  .dose-amount-said {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--display-track);
    line-height: var(--leading-display);
  }

  .dose-drug-said {
    font-size: var(--text-md);
    color: var(--text-2);
  }

  /* Nothing seeded an amount, so the line is showing the label of the field
     open underneath it rather than a value. Said in the secondary colour so
     it does not read as one. */
  .dose-line.is-unset .dose-amount-said {
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
     rather than a second full-width field beside it, and the pair is capped
     well short of the sheet's width because an amount is three characters
     and a field the width of the screen says otherwise.

     The spinners come off. They are a mouse affordance on a control that
     declares inputmode="decimal", and inside this box they would land
     between the number and its unit. */
  .dose-amount {
    display: flex;
    align-items: center;
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

  .dose-amount input {
    font: inherit;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
    min-width: 0;
  }

  .dose-amount input:focus {
    outline: none;
  }

  .dose-amount-num {
    flex: 1;
    appearance: textfield;
  }

  .dose-amount-num::-webkit-outer-spin-button,
  .dose-amount-num::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }

  .dose-amount-unit {
    width: 8ch;
    text-align: right;
    color: var(--text-2);
  }
</style>
