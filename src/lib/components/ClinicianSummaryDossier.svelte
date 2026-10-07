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

  import DossierTable from './DossierTable.svelte';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { epochDayFromTimestamp } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
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
  import { regimenEsterNote, type ClinicianDossier } from '$lib/data/export/clinicianSummaryData';
  import { resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { travelOnChange } from '$lib/motion/reorder.svelte';
  import type { DoseEvent, DoseRoute, RegimenEpisode } from '$lib/data/types';
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

  const today = $derived(currentDay());
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

  /* A regimen episode's route is free text (types.ts), a dose's is the
     closed set; the label falls back to the text itself for a route the
     set does not know. */
  const episodeRoute = (route: string) => routeLabel(route as DoseRoute);

  const siteOf = (dose: DoseEvent): string | null => {
    if (isInjectionDose(dose)) return dose.injectionSite ? injectionSiteLabel(dose.injectionSite) : null;
    if (isTopicalDose(dose)) return dose.applicationSite ? applicationSiteLabel(dose.applicationSite) : null;
    return null;
  };

  /* The profile card's motion (after-release 22). Pronouns and a date of
     birth come and go as the person types them in the controls sheet, so
     a row arrives in, or leaves, the middle of a grid that reflows around
     it - sideways too, once the card is wide enough for columns. The card
     is the surface, and it only moves: its height follows through
     `resize`, and the rows it displaces travel from where they were
     painted (reorder.svelte.ts's FLIP, in both axes). The row that came or
     went is content on that surface, so it crossfades rather than sliding
     or clipping (ADR-0078's object rule binds the surface; a clip on a
     grid cell would cut the label and value apart mid-reveal). A leaving
     row is lifted out of the flow at its own place for its fade, so the
     rest can travel at once rather than after it has gone. */
  let profileGrid = $state<HTMLElement>();
  travelOnChange(
    () => (profileGrid ? [...profileGrid.querySelectorAll<HTMLElement>('[data-profile-item]')] : []),
    (el) => el.dataset.profileItem ?? '',
    () => [dossier.demographics?.pronouns?.trim(), dossier.demographics?.dob]
  );

  /* The arriving row waits for half the travel before it fades in, so its
     text lands in the gap the displaced rows have opened rather than over
     them as they pass (the first flipbook had "they/them" printed across
     "Reporting period" for six frames). A leaving row keeps the full
     crossfade: at half of it, the ease-out took 79% of its opacity in one
     frame, which reads as the row vanishing. */
  function profileArrive(_node: Element) {
    return { ...fadeOnly(crossfadeDuration()), delay: motionDuration('--dur-med') / 2 };
  }

  function profileLeave(node: HTMLElement) {
    const { offsetTop, offsetLeft, offsetWidth } = node;
    Object.assign(node.style, {
      position: 'absolute',
      top: `${offsetTop}px`,
      left: `${offsetLeft}px`,
      width: `${offsetWidth}px`
    });
    return fadeOnly(crossfadeDuration());
  }

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

<!-- A date in a table cell never breaks between its words on screen ("11 /
     Jul / 2026" stacked one word a line at 390, after-release 22). Print
     keeps its own wrapping: clinician-print.css scopes the rule to screen.
     `after` keeps a list's comma on its date's line. -->
{#snippet date(epochDay: number, after = '')}<span class="dossier-date">{dayShort(epochDay)}{after}</span>{/snippet}

{#snippet truncateNote(hidden: number)}
  <p class="dossier-truncate-note no-print" data-dossier-truncate>
    {m.clinician_summary_section_truncated({ count: hidden })}
  </p>
{/snippet}

<div class="clinician-dossier" data-clinician-dossier>
  <!-- 1. Patient Demographics & Profile -->
  {#if dossier.demographics}
    <div class="dossier-profile-card" data-dossier-section="demographics" use:resize>
      <div class="dossier-profile-grid" bind:this={profileGrid}>
        <div class="dossier-profile-item" data-profile-item="name">
          <span class="dossier-profile-label">{m.clinician_summary_name_label()}</span>
          <span class="dossier-profile-value">
            {dossier.demographics.name.trim() || m.clinician_summary_not_set()}
          </span>
        </div>
        <!-- Drawn only when given, like the date of birth under it: both
             come from a field on this screen that is empty by default, and a
             row reading "Not specified" told the doctor something the
             person never said (after-release 22). -->
        {#if dossier.demographics.pronouns?.trim()}
          <div class="dossier-profile-item" data-profile-item="pronouns" in:profileArrive out:profileLeave>
            <span class="dossier-profile-label">{m.clinician_summary_pronouns_label()}</span>
            <span class="dossier-profile-value">{dossier.demographics.pronouns.trim()}</span>
          </div>
        {/if}
        {#if dossier.demographics.dob}
          <div class="dossier-profile-item" data-profile-item="dob" in:profileArrive out:profileLeave>
            <span class="dossier-profile-label">{m.clinician_summary_dob_label()}</span>
            <span class="dossier-profile-value">{dossier.demographics.dob}</span>
          </div>
        {/if}
        <div class="dossier-profile-item" data-profile-item="period">
          <span class="dossier-profile-label">{m.clinician_summary_period_label()}</span>
          <span class="dossier-profile-value num">
            {dayShort(dossier.fromEpochDay)} – {dayShort(dossier.toEpochDay)}
          </span>
        </div>
        <div class="dossier-profile-item" data-profile-item="generated">
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
        <DossierTable label={m.clinician_summary_current_regimen()}>
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
                {@const ester = regimenEsterNote(ep.drug, ep.ester)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td data-label={m.regimen_drug_label()}>
                    <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}><strong>{ep.drug}</strong></a>
                    {#if ester}<span class="muted small">({ester})</span>{/if}
                  </td>
                  <td data-label={m.regimen_dose_label()} class="num">{ep.dose} {ep.doseUnit}</td>
                  <td data-label={m.regimen_route_label()}>{episodeRoute(ep.route)}</td>
                  <td data-label={m.regimen_interval_label()}>{ep.interval}</td>
                  <td data-label={m.clinician_summary_dates_active()} class="num dossier-cell-wide">{episodeSpan(ep)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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
        <DossierTable label={m.clinician_summary_past_regimen()}>
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
                {@const ester = regimenEsterNote(ep.drug, ep.ester)}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td data-label={m.regimen_drug_label()}>
                    <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}>{ep.drug}</a>{ester
                      ? ` (${ester})`
                      : ''}
                  </td>
                  <td data-label={m.regimen_dose_label()} class="num">{ep.dose} {ep.doseUnit}</td>
                  <td data-label={m.regimen_route_label()}>{episodeRoute(ep.route)}</td>
                  <td data-label={m.regimen_interval_label()}>{ep.interval}</td>
                  <td data-label={m.clinician_summary_dates_active()} class="num dossier-cell-wide">{episodeSpan(ep)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
        {#if overflowCount(pastEpisodes) > 0}
          {@render truncateNote(overflowCount(pastEpisodes))}
        {/if}
      {/if}

      <!-- Dosage Log -->
      <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.clinician_summary_dose_history()}</h3>
      {#if dossier.regimen.doses.length}
        <DossierTable label={m.clinician_summary_dose_history()}>
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
                  <td data-label={m.dose_day_label()} class="num">{@render date(doseDay)}</td>
                  <td data-label={m.dose_time_label()} class="num"><span class="dossier-date">{fmtTime(dose.timestamp)}</span></td>
                  <td data-label={m.regimen_dose_label()} class="num">
                    <a class="dossier-row-link" href={`/care/doses#${dose.id}`}><strong>{dose.dose} {dose.doseUnit}</strong></a>
                    {#if dose.drug}<span class="muted small">· {dose.drug}</span>{/if}
                  </td>
                  <td data-label={m.regimen_route_label()}>{routeLabel(dose.route)}</td>
                  <td data-label={m.dose_injection_site_label()}>
                    {site ?? '—'}
                    {#if isInjectionDose(dose) && dose.vehicle}
                      <span class="muted small">({vehicleLabel(dose.vehicle)})</span>
                    {/if}
                  </td>
                  <td data-label={m.clinician_summary_status_label()}>
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
        </DossierTable>
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
        <DossierTable label={m.exposure_dose_totals_title()}>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>{m.regimen_drug_label()}</th>
                <th>{m.regimen_route_label()}</th>
                <th>{m.exposure_dose_totals_title()}</th>
              </tr>
            </thead>
            <tbody>
              {#each dossier.exposure.doseTotals as dt, i (JSON.stringify([dt.drug, dt.route, dt.doseUnit]))}
                <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                  <td data-label={m.regimen_drug_label()}><strong>{dt.drug}</strong></td>
                  <td data-label={m.regimen_route_label()}>{routeLabel(dt.route)}</td>
                  <td data-label={m.exposure_dose_totals_title()} class="num">{dt.total} {dt.doseUnit}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
        {#if overflowCount(dossier.exposure.doseTotals) > 0}
          {@render truncateNote(overflowCount(dossier.exposure.doseTotals))}
        {/if}
      {/if}

      {#if dossier.exposure.routeDays.length}
        <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_route_days_title()}</h3>
        <DossierTable label={m.exposure_route_days_title()}>
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
                  <td data-label={m.regimen_route_label()}>{episodeRoute(rd.route)}</td>
                  <td data-label={m.exposure_route_days_title()} class="num">{m.exposure_medication_days_count({ days: rd.days })}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
        {#if overflowCount(dossier.exposure.routeDays) > 0}
          {@render truncateNote(overflowCount(dossier.exposure.routeDays))}
        {/if}
        <p class="dossier-footnote" data-dossier-route-days-note>
          {m.exposure_route_days_note()}
        </p>
      {/if}

      {#if dossier.exposure.regimenDays.length}
        <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_regimen_days_title()}</h3>
        <DossierTable label={m.exposure_regimen_days_title()}>
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
                  <td data-label={m.regimen_drug_label()}><strong>{regd.drug}</strong></td>
                  <td data-label={m.regimen_dose_label()} class="num">{regd.dose} {regd.doseUnit}</td>
                  <td data-label={m.regimen_route_label()}>{episodeRoute(regd.route)}</td>
                  <td data-label={m.exposure_regimen_days_title()} class="num">{m.exposure_medication_days_count({ days: regd.days })}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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
        <DossierTable label={m.clinician_summary_section_labs()}>
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
                  <td data-label={m.labs_date_label()} class="num">
                    {@render date(lab.epochDay)}
                    {#if lab.drawTime}<span class="muted small dossier-date">· {lab.drawTime}</span>{/if}
                  </td>
                  <td data-label={m.labs_analyte_label()}><strong>{lab.analyte}</strong></td>
                  <td data-label={m.labs_value_label()} class="num">
                    <strong>{lab.value}</strong> <span class="muted small">{lab.unit}</span>
                  </td>
                  <td data-label={m.clinician_summary_timing_header()}>
                    {#if lab.timing}
                      <span class="dossier-timing-badge">{labTimingLabel(lab.timing)}</span>
                    {:else}
                      <span class="muted small">—</span>
                    {/if}
                  </td>
                  <td data-label={m.labs_provider_label()}>{lab.provider.trim() || '—'}</td>
                  <td data-label={m.labs_note_label()} class="dossier-cell-wide">{lab.note.trim() || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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
        <DossierTable label={m.clinician_summary_section_side_effects()}>
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
                  <td data-label={m.side_effect_date_label()} class="num">{@render date(effect.epochDay)}</td>
                  <td data-label={m.side_effect_name_label()}><strong>{effect.name}</strong></td>
                  <td data-label={m.side_effect_severity_label()}>
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
        </DossierTable>
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
        <DossierTable label={m.clinician_summary_section_cycle_events()}>
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
                  <td data-label={m.cycle_event_date_label()} class="num">{@render date(event.epochDay)}</td>
                  <td data-label={m.cycle_event_kind_label()}><strong>{cycleEventKindName(event.kind)}</strong></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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
        <DossierTable label={m.clinician_summary_section_appointment_prep()}>
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
                  <td data-label={m.clinician_summary_status_label()} style="width: 130px;">
                    {#if item.checked}
                      <span class="dossier-timing-badge" style="text-decoration: line-through;">{m.clinician_summary_prep_done()}</span>
                    {:else}
                      <span class="dossier-timing-badge">{m.clinician_summary_prep_pending()}</span>
                    {/if}
                    {#if item.carriedForward}
                      <span class="muted small">· {m.appointment_prep_carried_forward_badge()}</span>
                    {/if}
                  </td>
                  <td data-label={m.appointment_prep_title()} style={item.checked ? 'text-decoration: line-through;' : ''}>
                    {item.content}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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

      <DossierTable label={m.clinician_summary_section_procedures()}>
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
                <td data-label={m.surgery_name_label()}><strong>{proc.name}</strong></td>
                <td data-label={m.surgery_date_label()}>
                  {#if proc.surgeryEpochDay !== null}
                    <span class="num">{@render date(proc.surgeryEpochDay)}</span>
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
                <td data-label={m.surgery_consults_title()}>
                  {#if proc.consults.length}
                    {#each proc.consults as consult, k (consult)}{k > 0 ? ' ' : ''}{@render date(consult.epochDay, k < proc.consults.length - 1 ? ',' : '')}{/each}
                  {:else}
                    —
                  {/if}
                </td>
                <td data-label={m.surgery_notes_title()} class="dossier-cell-wide">
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
      </DossierTable>
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
        <DossierTable label={m.clinician_summary_section_finished_areas()}>
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
                  <td data-label={m.area_finish_table_area()}><strong>{areaGroupName(area.key)}</strong></td>
                  <td data-label={m.area_finish_table_ended()} class="num">{@render date(area.epochDay)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </DossierTable>
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
  @media screen {
    .dossier-profile-grid {
      position: relative;
    }

    .dossier-profile-item {
      transition: translate var(--dur-med) var(--ease-out);
    }
  }

  .sub-heading {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
