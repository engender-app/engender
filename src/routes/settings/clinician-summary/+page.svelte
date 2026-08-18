<script lang="ts">
  /* The clinician visit summary (phase 4 ticket 12): a one-shot, printable
     assembly of everything tickets 01, 02, 03, 05 and 06 already read for a
     chosen range (journal.clinicianSummary.getSummary). Nothing here is
     computed beyond that read path's own range filter, and nothing this
     screen does writes anything back to the journal - picking a range and
     printing are the only two actions it offers. */
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    epochDayFromTimestamp,
    ongoingWindowRange,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { applicationSiteLabel, injectionSiteLabel, routeLabel, statusLabel, vehicleLabel } from '$lib/data/vocabulary/doseLabels';
  import { severityName } from '$lib/data/vocabulary/labels';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { isInjectionDose, isTopicalDose } from '$lib/data/doseSchedule';
  import type { DoseEvent, LabResult } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);
  const defaultRange = ongoingWindowRange(today, 90);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));

  let range = $derived(customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput)));

  let summaryQuery = liveQuery(['regimen', 'dose', 'lab', 'sideEffect'], (j) =>
    range ? j.clinicianSummary.getSummary(range.start, range.end) : Promise.resolve(null)
  );
  let summary = $derived(summaryQuery.value);

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const dayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });
  const whenOf = (dose: DoseEvent) => `${dayShort(epochDayFromTimestamp(dose.timestamp))}, ${fmtTime(dose.timestamp)}`;

  const episodeRangeLabel = (endEpochDay: number | null, startEpochDay: number) =>
    `${fmtDay(startEpochDay, { month: 'short', year: 'numeric' })} – ${
      endEpochDay === null ? m.regimen_ongoing() : fmtDay(endEpochDay, { month: 'short', year: 'numeric' })
    }`;

  const siteOf = (dose: DoseEvent): string | null => {
    if (isInjectionDose(dose)) return dose.injectionSite ? injectionSiteLabel(dose.injectionSite) : null;
    if (isTopicalDose(dose)) return dose.applicationSite ? applicationSiteLabel(dose.applicationSite) : null;
    return null;
  };

  const labContextLine = (r: LabResult) => [r.timing ? labTimingLabel(r.timing) : '', r.provider.trim()].filter(Boolean).join(' · ');

  function printSummary() {
    window.print();
  }
</script>

<div class="screen">
  <header class="screen-header no-print">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.clinician_summary_title()}</h1>
    <div class="header-action">
      <button class="icon-btn" aria-label={m.clinician_summary_print()} onclick={printSummary}>
        <Icon name="share" size={22} />
      </button>
    </div>
  </header>
  <p class="muted small no-print" style="margin-bottom:var(--space-4)">{m.clinician_summary_intro()}</p>

  <div class="card no-print" style="margin-bottom:var(--space-4)">
    <div class="cd-endpoints">
      <div class="field">
        <label class="field-label" for="clinician-summary-start">{m.clinician_summary_range_start_label()}</label>
        <input class="input" id="clinician-summary-start" type="date" bind:value={startInput} max={endInput || todayInput} />
      </div>
      <div class="field">
        <label class="field-label" for="clinician-summary-end">{m.clinician_summary_range_end_label()}</label>
        <input class="input" id="clinician-summary-end" type="date" bind:value={endInput} min={startInput || undefined} max={todayInput} />
      </div>
    </div>
    {#if range === null}
      <p class="muted small" style="margin-top:var(--space-2)">{m.clinician_summary_range_required()}</p>
    {/if}
  </div>

  {#if range}
    <div class="print-heading">
      <h1>{m.clinician_summary_title()}</h1>
      <p>{dayLong(range.start)} – {dayLong(range.end)}</p>
      <p class="muted small">{m.clinician_summary_generated({ date: dayLong(today) })}</p>
    </div>
  {/if}

  {#if range === null}
    <!-- Nothing to assemble until both boundaries are picked; the hint above already says so. -->
  {:else if summaryQuery.loading || !summary}
    <Skeleton variant="block" count={4} />
  {:else}
    <SectionTitle text={m.regimen()} />
    {#if summary.regimenEpisodes.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.regimenEpisodes as episode (episode.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{episode.drug}</span>
              <span class="row-subtitle">
                {episode.dose} {episode.doseUnit} · {episode.route} · {episode.interval} · {episodeRangeLabel(episode.endEpochDay, episode.startEpochDay)}
              </span>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.clinician_summary_regimen_episodes_empty()}</p>
    {/if}

    <SectionTitle text={m.doses()} />
    {#if summary.doses.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.doses as dose (dose.id)}
          {@const site = siteOf(dose)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">
                {dose.dose} {dose.doseUnit} · {routeLabel(dose.route)}
                {#if dose.status !== 'taken'}· {statusLabel(dose.status)}{/if}
              </span>
              <span class="row-subtitle">
                {whenOf(dose)}
                {#if site}· {site}{/if}
                {#if isInjectionDose(dose) && dose.vehicle}· {vehicleLabel(dose.vehicle)}{/if}
              </span>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.clinician_summary_doses_empty()}</p>
    {/if}

    <SectionTitle text={m.lab_results()} />
    {#if summary.labResults.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.labResults as result (result.id)}
          {@const context = labContextLine(result)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{result.analyte}: {result.value} <span class="muted small">{result.unit}</span></span>
              <span class="row-subtitle">
                {dayLong(result.epochDay)}{result.note ? ' · ' + result.note : ''}
              </span>
              {#if context}<span class="row-subtitle">{context}</span>{/if}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.clinician_summary_labs_empty()}</p>
    {/if}

    <SectionTitle text={m.exposure_title()} />
    <SectionTitle text={m.exposure_dose_totals_title()} />
    {#if summary.exposure.doseTotals.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.exposure.doseTotals as t (`${t.drug}-${t.route}-${t.doseUnit}`)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{t.drug}</span>
              <span class="row-subtitle">
                {m.exposure_dose_total_sub({ route: routeLabel(t.route), total: String(t.total), unit: t.doseUnit })}
              </span>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_dose_totals_empty()}</p>
    {/if}

    <SectionTitle text={m.exposure_route_days_title()} />
    {#if summary.exposure.routeDays.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.exposure.routeDays as r (r.route)}
          <div class="list-row">
            <span class="row-text"><span class="row-title">{r.route}</span></span>
            <span class="muted small">{m.exposure_days_count({ days: String(r.days) })}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_route_days_empty()}</p>
    {/if}

    <SectionTitle text={m.exposure_regimen_days_title()} />
    {#if summary.exposure.regimenDays.length}
      <div class="list-group" style="margin-bottom:var(--space-4)">
        {#each summary.exposure.regimenDays as rd (rd.episodeId)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{rd.drug}</span>
              <span class="row-subtitle">{m.exposure_regimen_days_sub({ dose: String(rd.dose), unit: rd.doseUnit, route: rd.route })}</span>
            </span>
            <span class="muted small">{m.exposure_days_count({ days: String(rd.days) })}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_regimen_days_empty()}</p>
    {/if}

    <SectionTitle text={m.side_effects()} />
    {#if summary.sideEffects.length}
      <div class="list-group">
        {#each summary.sideEffects as effect (effect.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{effect.name}</span>
              <span class="row-subtitle">{dayLong(effect.epochDay)} · {severityName(effect.severity)}</span>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small">{m.clinician_summary_side_effects_empty()}</p>
    {/if}

    <p class="muted small no-print" style="margin-top:var(--space-4)">{m.clinician_summary_disclaimer()}</p>
    <p class="disclaimer-print">{m.clinician_summary_disclaimer()}</p>
  {/if}
</div>

<style>
  .print-heading {
    display: none;
  }
  .disclaimer-print {
    display: none;
  }

  @media print {
    .no-print {
      display: none !important;
    }
    .print-heading {
      display: block;
      margin-bottom: var(--space-4);
    }
    .disclaimer-print {
      display: block;
      margin-top: var(--space-4);
      color: var(--text-2);
      font-size: var(--text-sm);
    }
  }
</style>
