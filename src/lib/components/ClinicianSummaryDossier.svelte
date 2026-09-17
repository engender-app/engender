<script lang="ts">
  /* Structured, print-ready multi-page clinical dossier (phase 5 ticket 09).
     Renders patient demographics, current regimen and dose log, cumulative
     exposure, lab results with post-dose timing, side effects, cycle events,
     and appointment prep consultation questions.

     Every regimen and dose row links back to its own record across a hash
     (phase 8 features ticket 67, restoring what ticket 09's rewrite dropped
     when the flat, static rows here became a printed table) - `.dossier-
     row-link` in clinician-print.css keeps that plain text once actually
     printed, since a clinician reading the page on paper has nowhere to
     click it. */

  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { epochDayFromTimestamp, todayEpochDay } from '$lib/data/epochDay';
  import {
    applicationSiteLabel,
    episodeEndReasonLabel,
    injectionSiteLabel,
    routeLabel,
    statusLabel,
    vehicleLabel
  } from '$lib/data/vocabulary/doseLabels';
  import { cycleEventKindName, severityName } from '$lib/data/vocabulary/labels';
  import { areaGroupName } from '$lib/data/vocabulary/areaLabels';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { recoveryDay } from '$lib/data/recoveryDay';
  import { isInjectionDose, isTopicalDose } from '$lib/data/doseSchedule';
  import type { ClinicianDossier } from '$lib/data/export/clinicianSummaryData';
  import type { DoseEvent, RegimenEpisode } from '$lib/data/types';
  import '$lib/styles/clinician-print.css';

  interface Props {
    dossier: ClinicianDossier;
  }

  let { dossier }: Props = $props();

  /* Ticket 08: a section's table shows its first rows on screen and every
     row in print - the preview is the page, not a scrollable assembly of
     the whole range. Twelve was the ticket's own proposal and nothing in
     the dossier's data pushed it either way, so it stands as written. One
     floor for every table, applied independently, so the regimen table
     and the dose log each truncate on their own row count rather than
     sharing a budget - a range with three regimen episodes and ninety
     doses prints a full regimen table and a truncated dose log, not half
     of each. A row past the floor carries `dossier-row-overflow`
     (clinician-print.css); the note under a truncated table carries
     `data-dossier-truncate`, for a test to find either. */
  const PREVIEW_ROW_FLOOR = 12;

  /** The footnote marker for a dose a schedule wrote (phase 11 ticket 11).
      A dagger rather than an asterisk, which the printed page already spends
      on nothing else, and rather than a word in the cell: the table has six
      columns on paper and a seventh reading "from a schedule" on one row in
      twenty would push the rest of them narrower for the whole print. */
  const AUTO_LOGGED_MARK = '\u2020';
  const overflowCount = (rows: readonly unknown[]) =>
    rows.length > PREVIEW_ROW_FLOOR ? rows.length - PREVIEW_ROW_FLOOR : 0;

  const today = todayEpochDay();
  const dayShort = (epochDay: number) =>
    fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  const episodeSpan = (ep: RegimenEpisode) => {
    const range = `${dayShort(ep.startEpochDay)} – ${ep.endEpochDay === null ? m.regimen_ongoing() : dayShort(ep.endEpochDay)}`;
    // A reason is never set without an end day (ticket 43), so this only
    // ever fires on a row that already prints a real end date, not "ongoing".
    return ep.endReason
      ? m.clinician_summary_regimen_end_reason({ range, reason: episodeEndReasonLabel(ep.endReason) })
      : range;
  };

  const siteOf = (dose: DoseEvent): string | null => {
    if (isInjectionDose(dose)) return dose.injectionSite ? injectionSiteLabel(dose.injectionSite) : null;
    if (isTopicalDose(dose)) return dose.applicationSite ? applicationSiteLabel(dose.applicationSite) : null;
    return null;
  };

  const isDossierEmpty = $derived(
    !dossier.demographics &&
      !dossier.regimen &&
      !dossier.exposure &&
      !dossier.labs &&
      !dossier.sideEffects &&
      !dossier.cycleEvents &&
      !dossier.appointmentPrep &&
      !dossier.procedures &&
      !dossier.finishedAreas
  );
</script>

{#snippet truncateNote(hidden: number)}
  <p class="dossier-truncate-note no-print" data-dossier-truncate>
    {m.clinician_summary_section_truncated({ count: hidden })}
  </p>
{/snippet}

<div class="clinician-dossier" data-clinician-dossier>
  <!-- 1. Patient Demographics & Profile -->
  {#if dossier.demographics}
    <div class="dossier-profile-card" data-dossier-section="demographics">
      <div class="dossier-profile-grid">
        <div class="dossier-profile-item">
          <span class="dossier-profile-label">{m.clinician_summary_name_label()}</span>
          <span class="dossier-profile-value">
            {dossier.demographics.name.trim() || m.clinician_summary_not_set()}
          </span>
        </div>
        <div class="dossier-profile-item">
          <span class="dossier-profile-label">{m.clinician_summary_pronouns_label()}</span>
          <span class="dossier-profile-value">
            {dossier.demographics.pronouns?.trim() || m.clinician_summary_not_set()}
          </span>
        </div>
        {#if dossier.demographics.dob}
          <div class="dossier-profile-item">
            <span class="dossier-profile-label">{m.clinician_summary_dob_label()}</span>
            <span class="dossier-profile-value">{dossier.demographics.dob}</span>
          </div>
        {/if}
        <div class="dossier-profile-item">
          <span class="dossier-profile-label">{m.clinician_summary_period_label()}</span>
          <span class="dossier-profile-value num">
            {dayShort(dossier.fromEpochDay)} – {dayShort(dossier.toEpochDay)}
          </span>
        </div>
        <div class="dossier-profile-item">
          <span class="dossier-profile-label">{m.clinician_summary_generated_label()}</span>
          <span class="dossier-profile-value num">
            {dayShort(dossier.generatedAtEpochDay)}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <!-- 2. Regimen & Dosage History -->
  {#if dossier.regimen}
    <section class="dossier-section" data-dossier-section="regimen">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_regimen()}</h2>
      </div>

      <!-- Current Regimen -->
      <h3 class="sub-heading">{m.clinician_summary_current_regimen()}</h3>
      {#if dossier.regimen.current.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_drug_label()}</th>
                <th>{m.regimen_dose_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.regimen_interval_label()}</th>
                <th>{m.clinician_summary_dates_active()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.regimen.current as ep, i (ep.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td>
                    <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}><strong>{ep.drug}</strong></a>
                    {#if ep.ester}<span class="muted small">({ep.ester})</span>{/if}
                  </td>
                  <td class="num">{ep.dose} {ep.doseUnit}</td>
                  <td>{ep.route}</td>
                  <td>{ep.interval}</td>
                  <td class="num">{episodeSpan(ep)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.regimen.current) > 0}
          {@render truncateNote(overflowCount(dossier.regimen.current))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_regimen_episodes_empty()}</p>
      {/if}

      <!-- Past Regimen History (if any) -->
      {#if dossier.regimen.history.some((ep) => ep.endEpochDay !== null && ep.endEpochDay < dossier.toEpochDay)}
        {@const pastEpisodes = dossier.regimen.history.filter((ep) => ep.endEpochDay !== null && ep.endEpochDay < dossier.toEpochDay)}
        <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.clinician_summary_past_regimen()}</h3>
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_drug_label()}</th>
                <th>{m.regimen_dose_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.regimen_interval_label()}</th>
                <th>{m.clinician_summary_dates_active()}</th>
              </tr>
            </thead>
            <tbody>
              {#each pastEpisodes as ep, i (ep.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td>
                    <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}>{ep.drug}</a>{ep.ester
                      ? ` (${ep.ester})`
                      : ''}
                  </td>
                  <td class="num">{ep.dose} {ep.doseUnit}</td>
                  <td>{ep.route}</td>
                  <td>{ep.interval}</td>
                  <td class="num">{episodeSpan(ep)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(pastEpisodes) > 0}
          {@render truncateNote(overflowCount(pastEpisodes))}
        {/if}
      {/if}

      <!-- Dosage Log -->
      <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.clinician_summary_dose_history()}</h3>
      {#if dossier.regimen.doses.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.dose_day_label()}</th>
                <th>{m.dose_time_label()}</th>
                <th>{m.regimen_dose_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.dose_injection_site_label()}</th>
                <th>{m.clinician_summary_status_label()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.regimen.doses as dose, i (dose.id)}
                {@const doseDay = epochDayFromTimestamp(dose.timestamp)}
                {@const site = siteOf(dose)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td class="num">{dayShort(doseDay)}</td>
                  <td class="num">{fmtTime(dose.timestamp)}</td>
                  <td class="num">
                    <a class="dossier-row-link" href={`/care/doses#${dose.id}`}><strong>{dose.dose} {dose.doseUnit}</strong></a>
                    {#if dose.drug}<span class="muted small">· {dose.drug}</span>{/if}
                  </td>
                  <td>{routeLabel(dose.route)}</td>
                  <td>
                    {site ?? '—'}
                    {#if isInjectionDose(dose) && dose.vehicle}
                      <span class="muted small">({vehicleLabel(dose.vehicle)})</span>
                    {/if}
                  </td>
                  <td>
                    {dose.status !== 'taken' ? statusLabel(dose.status) : m.dose_status_taken()}
                    <!-- The footnote marker for a dose a schedule wrote
                         rather than the person (phase 11 ticket 11,
                         ADR-0086). In the status cell, because what it
                         qualifies is the status: "taken" on this row is the
                         schedule's word for it. aria-hidden, with the
                         legend under the table carrying the meaning in
                         words - a dagger read aloud is noise. -->
                    {#if dose.source === 'schedule'}<span
                        class="dossier-footnote-mark"
                        data-dose-auto-logged
                        aria-hidden="true">{AUTO_LOGGED_MARK}</span
                      >{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if dossier.regimen.doses.some((dose) => dose.source === 'schedule')}
          <p class="dossier-footnote" data-dossier-auto-logged-legend>
            {AUTO_LOGGED_MARK}
            {m.clinician_summary_auto_logged_legend()}
          </p>
        {/if}
        {#if overflowCount(dossier.regimen.doses) > 0}
          {@render truncateNote(overflowCount(dossier.regimen.doses))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_doses_empty()}</p>
      {/if}
    </section>
  {/if}

  <!-- 3. Cumulative Exposure -->
  {#if dossier.exposure}
    <section class="dossier-section" data-dossier-section="exposure">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_exposure()}</h2>
      </div>

      {#if dossier.exposure.doseTotals.length}
        <h3 class="sub-heading">{m.exposure_dose_totals_title()}</h3>
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_drug_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.exposure_dose_totals_title()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.exposure.doseTotals as dt, i (`${dt.drug}-${dt.route}-${dt.doseUnit}`)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td><strong>{dt.drug}</strong></td>
                  <td>{routeLabel(dt.route)}</td>
                  <td class="num">{dt.total} {dt.doseUnit}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.exposure.doseTotals) > 0}
          {@render truncateNote(overflowCount(dossier.exposure.doseTotals))}
        {/if}
      {/if}

      {#if dossier.exposure.routeDays.length}
        <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_route_days_title()}</h3>
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_route_label()}</th>
                <th>{m.exposure_route_days_title()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.exposure.routeDays as rd, i (rd.route)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td>{rd.route}</td>
                  <td class="num">{m.exposure_medication_days_count({ days: String(rd.days) })}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.exposure.routeDays) > 0}
          {@render truncateNote(overflowCount(dossier.exposure.routeDays))}
        {/if}
        <p class="dossier-footnote" data-dossier-route-days-note>
          {m.exposure_route_days_note()}
        </p>
      {/if}

      {#if dossier.exposure.regimenDays.length}
        <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_regimen_days_title()}</h3>
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_drug_label()}</th>
                <th>{m.regimen_dose_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.exposure_regimen_days_title()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.exposure.regimenDays as regd, i (regd.episodeId)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td><strong>{regd.drug}</strong></td>
                  <td class="num">{regd.dose} {regd.doseUnit}</td>
                  <td>{regd.route}</td>
                  <td class="num">{m.exposure_medication_days_count({ days: String(regd.days) })}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.exposure.regimenDays) > 0}
          {@render truncateNote(overflowCount(dossier.exposure.regimenDays))}
        {/if}
        <p class="dossier-footnote" data-dossier-regimen-days-note>
          {m.exposure_regimen_days_note()}
        </p>
      {/if}
    </section>
  {/if}

  <!-- 4. Lab Results & Post-Dose Timing Context -->
  {#if dossier.labs}
    <section class="dossier-section" data-dossier-section="labs">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_labs()}</h2>
      </div>

      {#if dossier.labs.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.labs_date_label()}</th>
                <th>{m.labs_analyte_label()}</th>
                <th>{m.labs_value_label()}</th>
                <th>{m.clinician_summary_timing_header()}</th>
                <th>{m.labs_provider_label()}</th>
                <th>{m.labs_note_label()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.labs as lab, i (lab.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td class="num">
                    {dayShort(lab.epochDay)}
                    {#if lab.drawTime}<span class="muted small">· {lab.drawTime}</span>{/if}
                  </td>
                  <td><strong>{lab.analyte}</strong></td>
                  <td class="num">
                    <strong>{lab.value}</strong> <span class="muted small">{lab.unit}</span>
                  </td>
                  <td>
                    {#if lab.timing}
                      <span class="dossier-timing-badge">{labTimingLabel(lab.timing)}</span>
                    {:else}
                      <span class="muted small">—</span>
                    {/if}
                  </td>
                  <td>{lab.provider.trim() || '—'}</td>
                  <td>{lab.note.trim() || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.labs) > 0}
          {@render truncateNote(overflowCount(dossier.labs))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_labs_empty()}</p>
      {/if}
    </section>
  {/if}

  <!-- 5. Active Side Effects & Symptoms -->
  {#if dossier.sideEffects}
    <section class="dossier-section" data-dossier-section="sideEffects">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_side_effects()}</h2>
      </div>

      {#if dossier.sideEffects.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.side_effect_date_label()}</th>
                <th>{m.side_effect_name_label()}</th>
                <th>{m.side_effect_severity_label()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.sideEffects as effect, i (effect.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td class="num">{dayShort(effect.epochDay)}</td>
                  <td><strong>{effect.name}</strong></td>
                  <td>
                    {#if effect.severity === null}
                      {m.clinician_summary_not_set()}
                    {:else}
                      {severityName(effect.severity)} ({effect.severity}/5)
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.sideEffects) > 0}
          {@render truncateNote(overflowCount(dossier.sideEffects))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_side_effects_empty()}</p>
      {/if}
    </section>
  {/if}

  <!-- 6. Cycle Events -->
  {#if dossier.cycleEvents}
    <section class="dossier-section" data-dossier-section="cycleEvents">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_cycle_events()}</h2>
      </div>

      {#if dossier.cycleEvents.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.cycle_event_date_label()}</th>
                <th>{m.cycle_event_kind_label()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.cycleEvents as event, i (event.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td class="num">{dayShort(event.epochDay)}</td>
                  <td><strong>{cycleEventKindName(event.kind)}</strong></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.cycleEvents) > 0}
          {@render truncateNote(overflowCount(dossier.cycleEvents))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_cycle_events_empty()}</p>
      {/if}
    </section>
  {/if}

  <!-- 7. Consultation Questions (Appointment Prep) -->
  {#if dossier.appointmentPrep}
    <section class="dossier-section" data-dossier-section="appointmentPrep">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_appointment_prep()}</h2>
      </div>

      {#if dossier.appointmentPrep.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.clinician_summary_status_label()}</th>
                <th>{m.appointment_prep_title()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.appointmentPrep as item, i (item.id)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td style="width: 130px;">
                    {#if item.checked}
                      <span class="dossier-timing-badge" style="text-decoration: line-through;">{m.clinician_summary_prep_done()}</span>
                    {:else}
                      <span class="dossier-timing-badge">{m.clinician_summary_prep_pending()}</span>
                    {/if}
                    {#if item.carriedForward}
                      <span class="muted small">· {m.appointment_prep_carried_forward_badge()}</span>
                    {/if}
                  </td>
                  <td style={item.checked ? 'text-decoration: line-through;' : ''}>
                    {item.content}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.appointmentPrep) > 0}
          {@render truncateNote(overflowCount(dossier.appointmentPrep))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_appointment_prep_empty()}</p>
      {/if}
    </section>
  {/if}

  <!-- 8. Procedures & Recovery (if present) -->
  {#if dossier.procedures && dossier.procedures.length}
    <section class="dossier-section" data-dossier-section="procedures">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_procedures()}</h2>
      </div>

      <div class="dossier-table-wrap">
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.surgery_name_label()}</th>
              <th>{m.surgery_date_label()}</th>
              <th>{m.surgery_consults_title()}</th>
              <th>{m.surgery_notes_title()}</th>
            </tr>
          </thead>
          <tbody>
            {#each dossier.procedures as proc, i (proc.id)}
              {@const day = recoveryDay(proc.surgeryEpochDay, today)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td><strong>{proc.name}</strong></td>
                <td>
                  {#if proc.surgeryEpochDay !== null}
                    <span class="num">{dayShort(proc.surgeryEpochDay)}</span>
                    {#if day.type === 'since'}
                      <span class="muted small">· {m.surgery_day_since({ days: m.n_days({ n: day.days }) })}</span>
                    {:else if day.type === 'upcoming'}
                      <span class="muted small">· {m.surgery_day_upcoming({ days: m.n_days({ n: day.days }) })}</span>
                    {:else if day.type === 'surgeryDay'}
                      <span class="muted small">· {m.surgery_day_of()}</span>
                    {/if}
                  {:else}
                    <span class="muted small">{m.surgery_date_none()}</span>
                  {/if}
                </td>
                <td>
                  {#if proc.consults.length}
                    {proc.consults.map((c) => dayShort(c.epochDay)).join(', ')}
                  {:else}
                    —
                  {/if}
                </td>
                <td>
                  {proc.notes.trim() || '—'}
                  {#if proc.checklistItems.length}
                    <div class="dossier-sub-list">
                      {#each proc.checklistItems as item (item.id)}
                        <span class="muted small" style={item.checked ? 'text-decoration: line-through;' : ''}>
                          • {item.content}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if overflowCount(dossier.procedures) > 0}
        {@render truncateNote(overflowCount(dossier.procedures))}
      {/if}
    </section>
  {/if}

  <!-- 9. Tracking that ended (phase 8 features ticket 04). A stopped stream
       reads as a decision with a date rather than as missing data, which is
       what the flat stretch on the charts above needs explaining with. -->
  {#if dossier.finishedAreas}
    <section class="dossier-section" data-dossier-section="finishedAreas">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{m.clinician_summary_section_finished_areas()}</h2>
      </div>

      {#if dossier.finishedAreas.length}
        <div class="dossier-table-wrap">
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.area_finish_table_area()}</th>
                <th>{m.area_finish_table_ended()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.finishedAreas as area, i (area.key)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td><strong>{areaGroupName(area.key)}</strong></td>
                  <td class="num">{dayShort(area.epochDay)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if overflowCount(dossier.finishedAreas) > 0}
          {@render truncateNote(overflowCount(dossier.finishedAreas))}
        {/if}
      {:else}
        <p class="dossier-empty-note">{m.clinician_summary_finished_areas_empty()}</p>
      {/if}
    </section>
  {/if}

  {#if isDossierEmpty}
    <p class="dossier-empty-note">{m.clinician_summary_empty_dossier()}</p>
  {/if}

  <!-- Clinical Disclaimer -->
  <p class="dossier-disclaimer">{m.clinician_summary_disclaimer()}</p>
</div>

<style>
  .sub-heading {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
