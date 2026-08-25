<script lang="ts">
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
    expectedSlots,
    isInjectionDose,
    isTopicalDose,
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
  import EmptyState from '$lib/components/EmptyState.svelte';
  import InjectionSiteMap from '$lib/components/InjectionSiteMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

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

  /** The last injection before `timestamp`, so the site map can mark what to
      rotate away from. Injections only: a patch site is not part of the
      rotation the map exists for. */
  function lastInjectionSite(before: number, exceptId?: string): string | null {
    for (let i = doses.length - 1; i >= 0; i--) {
      const dose = doses[i];
      if (dose.timestamp >= before || dose.id === exceptId) continue;
      if (isInjectionDose(dose)) return dose.injectionSite;
    }
    return null;
  }

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
         amount and unit in once a drug is chosen. */
      editor = {
        day: dateInputValueFromEpochDay(today),
        time: timeInputValue(now),
        route: 'oral',
        dose: activeEpisode ? String(activeEpisode.dose) : '',
        doseUnit: activeEpisode?.doseUnit ?? '',
        injectionSite: '',
        vehicle: 'oil',
        applicationSite: '',
        status: 'taken',
        scheduledDose: '',
        scheduledRoute: 'oral',
        scheduledTime: timeInputValue(now),
        drug: activeEpisode?.drug ?? ''
      };
      return;
    }

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

  /** Picking a drug in the disambiguation prompt also seeds the amount and
      unit from that episode, the same convenience a single active episode
      already gets for free. */
  function pickDrug(drug: string) {
    if (!editor) return;
    const match = activeEpisodes.find((e) => e.drug === drug);
    editor = { ...editor, drug, dose: match ? String(match.dose) : editor.dose, doseUnit: match ? match.doseUnit : editor.doseUnit };
  }

  let editorIsInjection = $derived(editor !== null && isInjectionDose(editor));
  let editorIsTopical = $derived(editor !== null && isTopicalDose(editor));
  /* An injection with no site picked yet cannot be saved: a rotation map
     nobody tapped would store an empty site and quietly break the rotation
     it exists for. Nor can a new dose while several episodes are active
     and none has been picked - that is exactly the ambiguity this ticket
     exists to stop from being drawn into the wrong drug's curve. */
  let editorCanSave = $derived(
    editor !== null &&
      !isNaN(parseFloat(editor.dose)) &&
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
  <ScreenHeader title={m.doses()} back="/settings/regimen" subtitle={m.doses_intro()}>
    {#snippet actions()}
      <button class="icon-btn" data-add aria-label={m.doses_add_aria()} onclick={() => openEditor(null)}>
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
  />

  {#if loading}
    <Skeleton variant="block" count={1} />
  {:else if view === 'log'}
    {#if doses.length}
      <p class="muted small" style="margin:var(--space-3) 0">{m.doses_window({ days: WINDOW_DAYS })}</p>
      <div class="list-group">
        {#each [...doses].reverse() as dose (dose.id)}
          {@const attribution = attributeDose(episodes, dose)}
          {@const site = siteOf(dose)}
          <button
            class="list-row"
            data-dose={dose.id}
            aria-label={m.doses_row_aria({ route: routeLabel(dose.route), when: whenOf(dose) })}
            onclick={() => openEditor(dose)}
          >
            <span class="row-text">
              <span class="row-title">
                {dose.dose} {dose.doseUnit} · {routeLabel(dose.route)}
                {#if dose.status !== 'taken'}
                  <span class="dose-status">{statusLabel(dose.status)}</span>
                {/if}
              </span>
              <span class="row-subtitle">
                {whenOf(dose)}
                {#if site}· {site}{/if}
                {#if isInjectionDose(dose) && dose.vehicle}· {vehicleLabel(dose.vehicle)}{/if}
              </span>
              <span class="row-subtitle">
                {#if attribution.episode}
                  {m.doses_under_episode({ drug: attribution.episode.drug })}
                {:else if attribution.ambiguous}
                  {m.doses_ambiguous_episode()}
                {:else}
                  {m.doses_no_episode()}
                {/if}
              </span>
              {#if dose.scheduled}
                <span class="row-subtitle">
                  {m.dose_scheduled_legend()}: {dose.scheduled.dose}
                  {dose.doseUnit} · {routeLabel(dose.scheduled.route)} · {fmtTime(dose.scheduled.timestamp)}
                </span>
              {/if}
            </span>
            <Icon name="pencil" size={18} />
          </button>
        {/each}
      </div>
    {:else}
      <EmptyState title={m.doses_empty_title()} text={m.doses_empty_body()}>
        {#snippet action()}
          <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.doses_empty_action()}</span></button>
        {/snippet}
      </EmptyState>
    {/if}
  {:else if activeEpisodes.length > 1}
    <p class="notice notice-info" style="margin-top:var(--space-4)">{m.adherence_multiple_episodes()}</p>
  {:else if !activeEpisode}
    <p class="notice notice-info" style="margin-top:var(--space-4)">{m.adherence_no_episode()}</p>
  {:else if !activeSchedule}
    <p class="notice notice-info" style="margin-top:var(--space-4)">
      {m.adherence_no_schedule({ drug: activeEpisode.drug })}
    </p>
  {:else if comparison}
    <p class="muted small" style="margin:var(--space-3) 0">
      {m.adherence_for_episode({ drug: activeEpisode.drug })}
    </p>
    <div class="list-group">
      {#each [...comparison.rows].reverse() as row (`${row.slot.epochDay}-${row.slot.indexInDay}`)}
        <div class="list-row" data-slot={`${row.slot.epochDay}-${row.slot.indexInDay}`}>
          <span class="row-text">
            <span class="row-title">{fmtDayLong(row.slot.epochDay)}</span>
            {#if activeSchedule.dosesPerDay > 1}
              <span class="row-subtitle">
                {m.adherence_slot_numbered({ index: row.slot.indexInDay + 1, count: activeSchedule.dosesPerDay })}
              </span>
            {/if}
            {#if row.slot.amount}
              <span class="row-subtitle">
                {m.adherence_slot_amount({ dose: row.slot.amount.dose, unit: row.slot.amount.doseUnit })}
              </span>
            {/if}
          </span>
          <span class="row-trailing">
            {#if row.dose}
              {row.dose.dose} {row.dose.doseUnit} · {statusLabel(row.dose.status)}
            {:else}
              {m.adherence_nothing_logged()}
            {/if}
          </span>
        </div>
      {/each}
    </div>

    {#if activePauses.length}
      <h2 class="section-title">{m.adherence_paused_heading()}</h2>
      <p class="muted small">{m.adherence_paused_note()}</p>
      <div class="list-group">
        {#each activePauses as pause (pause.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">
                {pause.endEpochDay === null
                  ? m.adherence_paused_open({ from: fmtDayLong(pause.startEpochDay) })
                  : m.adherence_paused_range({
                      from: fmtDayLong(pause.startEpochDay),
                      to: fmtDayLong(pause.endEpochDay)
                    })}
              </span>
              <span class="row-subtitle">{pauseReasonLabel(pause.reason)}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}

    {#if comparison.unmatched.length}
      <h2 class="section-title">{m.adherence_unmatched_heading()}</h2>
      <p class="muted small">{m.adherence_unmatched_note()}</p>
      <div class="list-group">
        {#each comparison.unmatched as dose (dose.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{dose.dose} {dose.doseUnit} · {routeLabel(dose.route)}</span>
              <span class="row-subtitle">{whenOf(dose)}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <Sheet
    open={editor !== null}
    title={editor?.id ? m.dose_edit_sheet() : m.dose_new_sheet()}
    onClose={() => (editor = null)}
  >
    {#if editor}
      <h3>{editor.id ? m.dose_edit_sheet() : m.dose_new_sheet()}</h3>

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
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-4)">{m.dose_time_hint()}</p>

      {#if editorNeedsDrugPick}
        <div class="field">
          <span class="field-label" id="dose-drug-label">{m.dose_drug_label()}</span>
          <p class="muted small">{m.dose_drug_hint()}</p>
          <div class="tag-row" role="group" aria-labelledby="dose-drug-label">
            {#each activeDrugChoices as drug (drug)}
              <button
                type="button"
                class="tag-chip"
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

      <div class="field">
        <span class="field-label" id="dose-route-label">{m.dose_route_label()}</span>
        <div class="tag-row" role="group" aria-labelledby="dose-route-label">
          {#each ROUTE_OPTIONS as option (option.value)}
            <button
              type="button"
              class="tag-chip"
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

      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="dose-amount">{m.dose_amount_label()}</label>
          <input
            class="input"
            type="number"
            id="dose-amount"
            name="dose-amount"
            inputmode="decimal"
            placeholder={m.dose_amount_placeholder()}
            bind:value={editor.dose}
          />
        </div>
        <div class="field">
          <label class="field-label" for="dose-unit">{m.dose_unit_label()}</label>
          <input
            class="input"
            id="dose-unit"
            name="dose-unit"
            placeholder={m.dose_unit_placeholder()}
            bind:value={editor.doseUnit}
          />
        </div>
      </div>

      {#if editorIsInjection}
        <div class="field">
          <span class="field-label">{m.dose_injection_site_label()}</span>
          <p class="muted small">{m.dose_injection_site_hint()}</p>
          <InjectionSiteMap
            value={editor.injectionSite}
            lastUsed={lastInjectionSite(timestampOf(editor.day, editor.time), editor.id)}
            recency={siteRecencyByKey}
            onChange={(site) => editor && (editor.injectionSite = site)}
          />
        </div>
        <div class="field">
          <span class="field-label" id="dose-vehicle-label">{m.dose_vehicle_label()}</span>
          <div class="tag-row" role="group" aria-labelledby="dose-vehicle-label">
            {#each ['oil', 'aqueous'] as const as vehicle (vehicle)}
              <button
                type="button"
                class="tag-chip"
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

      {#if editorIsTopical}
        <!-- A flat row of chips, not the rotation map: a patch or gel site is
             not rotated on an injection site's schedule. -->
        <div class="field">
          <span class="field-label" id="dose-app-site-label">{m.dose_app_site_label()}</span>
          <div class="tag-row" role="group" aria-labelledby="dose-app-site-label">
            {#each APPLICATION_SITES as site (site)}
              <button
                type="button"
                class="tag-chip"
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
                class="tag-chip"
                class:is-selected={editor.scheduledRoute === option.value}
                aria-pressed={editor.scheduledRoute === option.value}
                onclick={() => editor && (editor.scheduledRoute = option.value)}
              >
                {option.label}
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
  .dose-status {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
</style>
