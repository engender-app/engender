<script lang="ts">
  /* Doses, lab results and side effects for a chosen range, ready to print,
     on the surface kit (phase 5 UX ticket 25).

     Every section's rows move onto the kit's list card, and every one of
     them is deliberately handed no role. This is the one screen in the app
     whose output is read by somebody else, on paper, and a flag stripe
     behind an icon disc is neither what that reader needs nor what the
     person handing it over chose to disclose. The screen keeps the app's
     two surfaces and none of its colour.

     Checked on paper as well as on screen: the print block in app.css sets
     --text to black and --surface to white, and the kit's outline and
     hairline are mixes of --text, so a card's edge resolves to grey on the
     page rather than to whatever the dark theme was showing. */
  /* The clinician visit summary (phase 4 ticket 12): a one-shot, printable
     assembly of everything the registered sections already read for a chosen
     range (journal.clinicianSummary.getSummary). Nothing here is computed
     beyond those read paths' own range filter, and nothing this screen does
     writes anything back to the journal - picking a range and printing are
     the only two actions it offers.

     Which sections print, and in what order, is the registry's answer
     (clinicianSummary.ts, ADR-0031): this screen iterates it for the order
     and looks each heading up by key, and holds one snippet per section for
     the rows themselves, which genuinely differ - a dose row and a lab row
     have nothing in common but their shape on the page. A section registered
     with no snippet here is a typecheck failure, not a heading over
     nothing. */
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
  import { clinicianSummarySectionTitle } from '$lib/data/vocabulary/clinicianSummaryLabels';
  import { recoveryDay } from '$lib/data/recoveryDay';
  import { printCurrentPage } from '$lib/print/print';
  import { isInjectionDose, isTopicalDose } from '$lib/data/doseSchedule';
  import { CLINICIAN_SUMMARY_SECTION_KEYS, type ClinicianSummary, type ClinicianSummarySectionKey } from '$lib/data/journal/clinicianSummary';
  import type { DoseEvent, LabResult } from '$lib/data/types';
  import type { Snippet } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);
  const defaultRange = ongoingWindowRange(today, 90);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));

  let range = $derived(customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput)));

  let summaryQuery = liveQuery(['regimen', 'dose', 'lab', 'sideEffect', 'checklist', 'procedure'], (j) =>
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

  /* The rows for each registered section, looked up by the same key the
     registry declares. Svelte makes a snippet declared at the top level of
     the markup visible in here, which is what lets the map live beside the
     rest of the screen's wiring rather than in the template. */
  const SECTION_ROWS: Record<ClinicianSummarySectionKey, Snippet<[ClinicianSummary]>> = {
    regimenEpisodes: regimenRows,
    doses: doseRows,
    labResults: labResultRows,
    exposure: exposureRows,
    sideEffects: sideEffectRows,
    procedures: procedureRows,
    appointmentPrepItems: appointmentPrepRows
  };

  /* Not window.print(): that one is a Chrome method the Android WebView
     silently ignores, so this button did nothing on the Android build from
     the day it was added until phase 5 ticket 17 gave both printing screens
     a platform-aware path. */
  function printSummary() {
    void printCurrentPage(m.clinician_summary_title());
  }
</script>

{#snippet regimenRows(s: ClinicianSummary)}
  {#if s.regimenEpisodes.length}
    <div class="section-block"><ListCard>
      {#each s.regimenEpisodes as episode (episode.id)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{episode.drug}</span>
            <span class="kit-row-sub">
              {episode.dose} {episode.doseUnit} · {episode.route} · {episode.interval} · {episodeRangeLabel(episode.endEpochDay, episode.startEpochDay)}
            </span>
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_regimen_episodes_empty()}</p>
  {/if}
{/snippet}

{#snippet doseRows(s: ClinicianSummary)}
  {#if s.doses.length}
    <div class="section-block"><ListCard>
      {#each s.doses as dose (dose.id)}
        {@const site = siteOf(dose)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">
              {dose.dose} {dose.doseUnit} · {routeLabel(dose.route)}
              {#if dose.status !== 'taken'}· {statusLabel(dose.status)}{/if}
            </span>
            <span class="kit-row-sub">
              {whenOf(dose)}
              {#if site}· {site}{/if}
              {#if isInjectionDose(dose) && dose.vehicle}· {vehicleLabel(dose.vehicle)}{/if}
            </span>
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_doses_empty()}</p>
  {/if}
{/snippet}

{#snippet labResultRows(s: ClinicianSummary)}
  {#if s.labResults.length}
    <div class="section-block"><ListCard>
      {#each s.labResults as result (result.id)}
        {@const context = labContextLine(result)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{result.analyte}: {result.value} <span class="muted small">{result.unit}</span></span>
            <span class="kit-row-sub">
              {dayLong(result.epochDay)}{result.note ? ' · ' + result.note : ''}
            </span>
            {#if context}<span class="kit-row-sub">{context}</span>{/if}
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_labs_empty()}</p>
  {/if}
{/snippet}

<!-- Three counters under one heading (phase 4 ticket 05), each with its own
     sub-heading: they are one section because they are one area's read. -->
{#snippet exposureRows(s: ClinicianSummary)}
  <p class="sub-heading">{m.exposure_dose_totals_title()}</p>
  {#if s.exposure.doseTotals.length}
    <div class="section-block"><ListCard>
      {#each s.exposure.doseTotals as t (`${t.drug}-${t.route}-${t.doseUnit}`)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{t.drug}</span>
            <span class="kit-row-sub">
              {m.exposure_dose_total_sub({ route: routeLabel(t.route), total: String(t.total), unit: t.doseUnit })}
            </span>
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.exposure_dose_totals_empty()}</p>
  {/if}

  <p class="sub-heading">{m.exposure_route_days_title()}</p>
  {#if s.exposure.routeDays.length}
    <div class="section-block"><ListCard>
      {#each s.exposure.routeDays as r (r.route)}
        <div class="kit-row is-static">
          <span class="kit-row-text"><span class="kit-row-title">{r.route}</span></span>
          <span class="kit-row-trail">{m.exposure_days_count({ days: String(r.days) })}</span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.exposure_route_days_empty()}</p>
  {/if}

  <p class="sub-heading">{m.exposure_regimen_days_title()}</p>
  {#if s.exposure.regimenDays.length}
    <div class="section-block"><ListCard>
      {#each s.exposure.regimenDays as rd (rd.episodeId)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{rd.drug}</span>
            <span class="kit-row-sub">{m.exposure_regimen_days_sub({ dose: String(rd.dose), unit: rd.doseUnit, route: rd.route })}</span>
          </span>
          <span class="kit-row-trail">{m.exposure_days_count({ days: String(rd.days) })}</span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.exposure_regimen_days_empty()}</p>
  {/if}
{/snippet}

{#snippet sideEffectRows(s: ClinicianSummary)}
  {#if s.sideEffects.length}
    <div class="section-block"><ListCard>
      {#each s.sideEffects as effect (effect.id)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{effect.name}</span>
            <span class="kit-row-sub">{dayLong(effect.epochDay)} · {severityName(effect.severity)}</span>
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_side_effects_empty()}</p>
  {/if}
{/snippet}

<!-- Every procedure, not filtered to the chosen range: a procedure is an
     ongoing journey rather than an event on a day, and one whose operation
     fell before the window is exactly what a post-op follow-up is about
     (ticket 07). The day counter is derived here, at the point of display,
     off the surgery date the section already carries - the summary itself
     computes nothing (ADR-0031). -->
{#snippet procedureRows(s: ClinicianSummary)}
  {#if s.procedures.length}
    <div class="section-block"><ListCard>
      {#each s.procedures as procedure (procedure.id)}
        {@const day = recoveryDay(procedure.surgeryEpochDay, today)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title">{procedure.name}</span>
            <span class="kit-row-sub">
              {procedure.surgeryEpochDay === null ? m.surgery_date_none() : dayLong(procedure.surgeryEpochDay)}
              {#if day.type === 'since'}· {m.surgery_day_since({ days: m.n_days({ n: day.days }) })}{/if}
              {#if day.type === 'upcoming'}· {m.surgery_day_upcoming({ days: m.n_days({ n: day.days }) })}{/if}
              {#if day.type === 'surgeryDay'}· {m.surgery_day_of()}{/if}
            </span>
            {#if procedure.consults.length}
              <span class="kit-row-sub">
                {m.surgery_consults_title()}: {procedure.consults.map((c) => dayShort(c.epochDay)).join(', ')}
              </span>
            {/if}
            {#if procedure.photoEpochDays.length}
              <span class="kit-row-sub">
                {m.surgery_photos_title()}: {procedure.photoEpochDays.map((epochDay) => dayShort(epochDay)).join(', ')}
              </span>
            {/if}
            {#if procedure.notes.trim()}<span class="kit-row-sub">{procedure.notes}</span>{/if}
            {#each procedure.checklistItems as item (item.id)}
              <span class="kit-row-sub" style={item.checked ? 'text-decoration:line-through' : ''}>
                {item.content}{item.carriedForward ? ' · ' + m.surgery_checklist_carried_badge() : ''}
              </span>
            {/each}
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_procedures_empty()}</p>
  {/if}
{/snippet}

<!-- Prints whatever the list currently holds - not filtered to the chosen
     range, since a question to ask has no date of its own (ticket 11). -->
{#snippet appointmentPrepRows(s: ClinicianSummary)}
  {#if s.appointmentPrepItems.length}
    <div class="section-block"><ListCard>
      {#each s.appointmentPrepItems as item (item.id)}
        <div class="kit-row is-static">
          <span class="kit-row-text">
            <span class="kit-row-title" style={item.checked ? 'text-decoration:line-through' : ''}>{item.content}</span>
            {#if item.carriedForward}<span class="kit-row-sub">{m.appointment_prep_carried_forward_badge()}</span>{/if}
          </span>
        </div>
      {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small section-block">{m.clinician_summary_appointment_prep_empty()}</p>
  {/if}
{/snippet}

<div class="screen">
  <ScreenHeader title={m.clinician_summary_title()} back="/more" class="no-print" subtitle={m.clinician_summary_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" aria-label={m.clinician_summary_print()} onclick={printSummary}>
        <Icon name="share" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- The range says what the page is showing rather than entering a
       value, so it is the kit's filter line and not a card of fields. It
       never prints: what the range was is written into the print heading
       below, where a reader on paper needs it. -->
  <div class="kit-filter cd-endpoints no-print">
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
    <p class="muted small no-print">{m.clinician_summary_range_required()}</p>
  {/if}

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
    <div out:crossfade><Skeleton variant="block" count={4} /></div>
  {:else}
    <div>
      {#each CLINICIAN_SUMMARY_SECTION_KEYS as key (key)}
        <SectionHeading text={clinicianSummarySectionTitle(key)} />
        {@render SECTION_ROWS[key](summary)}
      {/each}
    </div>

    <p class="muted small no-print" style="margin-top:var(--space-4)">{m.clinician_summary_disclaimer()}</p>
    <p class="disclaimer-print">{m.clinician_summary_disclaimer()}</p>
  {/if}
</div>

<style>
  /* The three exposure counters sit inside one section, so their own names
     are a label under the section's heading rather than three more headings
     at the screen-title size (DIRECTION.md 3c is about naming a screen's
     areas; these are one area's three reads). */
  .sub-heading {
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  /* Every section's rows are followed by the next section's heading, and
     which one comes last is the registry's business rather than this file's,
     so the gap is uniform instead of dropped on the final block. */
  .section-block {
    margin-bottom: var(--space-4);
  }

  /* .no-print and .print-heading are the shell's (app.css); this one is
     the summary's own, so it stays here. */
  .disclaimer-print {
    display: none;
  }

  @media print {
    .disclaimer-print {
      display: block;
      margin-top: var(--space-4);
      color: var(--text-2);
      font-size: var(--text-sm);
    }
  }
</style>
