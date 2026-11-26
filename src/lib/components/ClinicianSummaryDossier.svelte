<script lang="ts">
  /* The clinician summary as the page it prints. One
     snippet per registered section (clinicianSummary.ts, ADR-0031), drawn
     in the registry's order by walking its keys; a section switched off
     arrives as null and draws nothing. `SECTION_SNIPPETS` is a full record
     over the keys, so registering a part with no rows to draw is a
     typecheck failure here, the way a part with no name is one in
     clinicianSummaryLabels.ts.

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
    regimenIntervalLabel,
    routeLabel,
    statusLabel,
    vehicleLabel
  } from '$lib/data/vocabulary/doseLabels';
  import { cycleEventKindName, personalEffectName, severityName } from '$lib/data/vocabulary/labels';
  import { areaGroupName } from '$lib/data/vocabulary/areaLabels';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { recoveryDay } from '$lib/data/recoveryDay';
  import { isInjectionDose, isTopicalDose } from '$lib/data/doseSchedule';
  import {
    CLINICIAN_SUMMARY_SECTION_KEYS,
    regimenEsterNote,
    type ClinicianSummary,
    type ClinicianSummarySectionKey,
    type ClinicianSummarySections
  } from '$lib/data/journal/clinicianSummary';
  import { clinicianSummarySectionName } from '$lib/data/vocabulary/clinicianSummaryLabels';
  import { disclose, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, EASE_OUT_SOFT_POINTS, fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { bezier } from '$lib/motion/blindSettle';
  import { travelOnChange } from '$lib/motion/reorder.svelte';
  import type { DoseEvent, DoseRoute, RegimenEpisode, SideEffect } from '$lib/data/types';
  import type { Snippet } from 'svelte';
  import '$lib/styles/clinician-print.css';

  interface Props {
    summary: ClinicianSummary;
  }

  let { summary }: Props = $props();

  /** What one section's snippet is handed: its part, never null. */
  type Section<Key extends ClinicianSummarySectionKey> = NonNullable<ClinicianSummarySections[Key]>;

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

  /** The footnote marker for a dose a schedule wrote.
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
    // A reason is never set without an end day, so this only
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
    () => [summary.sections.demographics?.pronouns?.trim(), summary.sections.demographics?.dob]
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

  /* A part switched on or off on the sheet
     travels its whole height, often several hundred pixels. disclose's
     own --ease-out leaves at four times its average speed, which put 119px
     of a 379px part into the first frame; a long travel setting off takes
     --ease-out-soft over --dur-slow instead, as base.css says, which keeps
     every frame under about 45px. The height, padding and margin it
     animates are still disclose's, and so is its reduced-motion cut. */
  const easeOutSoft = bezier(EASE_OUT_SOFT_POINTS);
  function partDisclose(node: Element) {
    const config = disclose(node);
    if (!config.duration) return config;
    return { ...config, duration: motionDuration('--dur-slow'), easing: easeOutSoft };
  }

  const SECTION_SNIPPETS: { [Key in ClinicianSummarySectionKey]: Snippet<[Section<Key>]> } = {
    demographics: demographicsSection,
    regimen: regimenSection,
    exposure: exposureSection,
    labs: labsSection,
    sideEffects: sideEffectsSection,
    personalEffects: personalEffectsSection,
    cycleEvents: cycleEventsSection,
    appointmentPrep: appointmentPrepSection,
    procedures: proceduresSection,
    finishedAreas: finishedAreasSection
  };

  /* Erased over the key at the one place the page walks every section,
     the same way the registry erases its sections' reads. */
  const sectionSnippet = (key: ClinicianSummarySectionKey) => SECTION_SNIPPETS[key] as Snippet<[unknown]>;

  const isSummaryEmpty = $derived(CLINICIAN_SUMMARY_SECTION_KEYS.every((key) => summary.sections[key] === null));
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

<!-- 1. Patient Demographics & Profile -->
{#snippet demographicsSection(demographics: Section<'demographics'>)}
  <div class="dossier-profile-card" data-dossier-section="demographics" use:resize>
    <div class="dossier-profile-grid" bind:this={profileGrid}>
      <div class="dossier-profile-item" data-profile-item="name">
        <span class="dossier-profile-label">{m.clinician_summary_name_label()}</span>
        <span class="dossier-profile-value">
          {demographics.name.trim() || m.clinician_summary_not_set()}
        </span>
      </div>
      <!-- Drawn only when given, like the date of birth under it: both
           come from a field on this screen that is empty by default, and a
           row reading "Not specified" told the doctor something the
           person never said (after-release 22). -->
      {#if demographics.pronouns?.trim()}
        <div class="dossier-profile-item" data-profile-item="pronouns" in:profileArrive out:profileLeave>
          <span class="dossier-profile-label">{m.clinician_summary_pronouns_label()}</span>
          <span class="dossier-profile-value">{demographics.pronouns.trim()}</span>
        </div>
      {/if}
      {#if demographics.dob}
        <div class="dossier-profile-item" data-profile-item="dob" in:profileArrive out:profileLeave>
          <span class="dossier-profile-label">{m.clinician_summary_dob_label()}</span>
          <span class="dossier-profile-value">{demographics.dob}</span>
        </div>
      {/if}
      <div class="dossier-profile-item" data-profile-item="period">
        <span class="dossier-profile-label">{m.clinician_summary_period_label()}</span>
        <span class="dossier-profile-value num">
          {dayShort(summary.fromEpochDay)} – {dayShort(summary.toEpochDay)}
        </span>
      </div>
      <div class="dossier-profile-item" data-profile-item="generated">
        <span class="dossier-profile-label">{m.clinician_summary_generated_label()}</span>
        <span class="dossier-profile-value num">
          {dayShort(summary.generatedAtEpochDay)}
        </span>
      </div>
    </div>
  </div>
{/snippet}

<!-- 2. Regimen & Dosage History -->
{#snippet regimenSection(regimen: Section<'regimen'>)}
  <section class="dossier-section" data-dossier-section="regimen">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('regimen')}</h2>
    </div>

    <!-- Current Regimen -->
    <h3 class="sub-heading">{m.clinician_summary_current_regimen()}</h3>
    {#if regimen.current.length}
      <DossierTable label={m.clinician_summary_current_regimen()}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.drug_label()}</th>
              <th>{m.dose_label()}</th>
              <th>{m.route_label()}</th>
              <th>{m.regimen_interval_label()}</th>
              <th>{m.clinician_summary_dates_active()}</th>
            </tr>
          </thead>
          <tbody>
            {#each regimen.current as ep, i (ep.id)}
              {@const ester = regimenEsterNote(ep.drug, ep.ester)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.drug_label()}>
                  <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}><strong>{ep.drug}</strong></a>
                  {#if ester}<span class="muted small">({ester})</span>{/if}
                </td>
                <td data-label={m.dose_label()} class="num">{ep.dose} {ep.doseUnit}</td>
                <td data-label={m.route_label()}>{episodeRoute(ep.route)}</td>
                <td data-label={m.regimen_interval_label()}>{regimenIntervalLabel(ep.interval)}</td>
                <td data-label={m.clinician_summary_dates_active()} class="num dossier-cell-wide">{episodeSpan(ep)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(regimen.current) > 0}
        {@render truncateNote(overflowCount(regimen.current))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_regimen_episodes_empty()}</p>
    {/if}

    <!-- Past Regimen History (if any) -->
    {#if regimen.history.some((ep) => ep.endEpochDay !== null && ep.endEpochDay < summary.toEpochDay)}
      {@const pastEpisodes = regimen.history.filter((ep) => ep.endEpochDay !== null && ep.endEpochDay < summary.toEpochDay)}
      <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.clinician_summary_past_regimen()}</h3>
      <DossierTable label={m.clinician_summary_past_regimen()}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.drug_label()}</th>
              <th>{m.dose_label()}</th>
              <th>{m.route_label()}</th>
              <th>{m.regimen_interval_label()}</th>
              <th>{m.clinician_summary_dates_active()}</th>
            </tr>
          </thead>
          <tbody>
            {#each pastEpisodes as ep, i (ep.id)}
              {@const ester = regimenEsterNote(ep.drug, ep.ester)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.drug_label()}>
                  <a class="dossier-row-link" href={`/care/regimen#${ep.id}`}>{ep.drug}</a>{ester
                    ? ` (${ester})`
                    : ''}
                </td>
                <td data-label={m.dose_label()} class="num">{ep.dose} {ep.doseUnit}</td>
                <td data-label={m.route_label()}>{episodeRoute(ep.route)}</td>
                <td data-label={m.regimen_interval_label()}>{regimenIntervalLabel(ep.interval)}</td>
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
    <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.doses()}</h3>
    {#if regimen.doses.length}
      <DossierTable label={m.doses()}>
        <table class="dossier-table dossier-dose-table">
          <thead>
            <tr>
              <th>{m.date_label()}</th>
              <th>{m.time_label()}</th>
              <th>{m.dose_label()}</th>
              <th>{m.route_label()}</th>
              <th>{m.dose_injection_site_label()}</th>
              <th>{m.status_label()}</th>
            </tr>
          </thead>
          <tbody>
            {#each regimen.doses as dose, i (dose.id)}
              {@const doseDay = epochDayFromTimestamp(dose.timestamp)}
              {@const site = siteOf(dose)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.date_label()} class="num">{@render date(doseDay)}</td>
                <td data-label={m.time_label()} class="num"><span class="dossier-date">{fmtTime(dose.timestamp)}</span></td>
                <td data-label={m.dose_label()} class="num">
                  <a class="dossier-row-link" href={`/care/doses#${dose.id}`}><strong>{dose.dose} {dose.doseUnit}</strong></a>
                  {#if dose.drug}<span class="muted small">· {dose.drug}</span>{/if}
                </td>
                <td data-label={m.route_label()}>{routeLabel(dose.route)}</td>
                <td data-label={m.dose_injection_site_label()}>
                  {site ?? '—'}
                  {#if isInjectionDose(dose) && dose.vehicle}
                    <span class="muted small">({vehicleLabel(dose.vehicle)})</span>
                  {/if}
                </td>
                <td data-label={m.status_label()}>
                  {dose.status !== 'taken' ? statusLabel(dose.status) : m.dose_status_taken()}
                  <!-- The footnote marker for a dose a schedule wrote
                       rather than the person (ADR-0086). In the status cell, because what it
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
      {#if regimen.doses.some((dose) => dose.source === 'schedule')}
        <p class="dossier-footnote" data-dossier-auto-logged-legend>
          {AUTO_LOGGED_MARK}
          {m.clinician_summary_auto_logged_legend()}
        </p>
      {/if}
      {#if overflowCount(regimen.doses) > 0}
        {@render truncateNote(overflowCount(regimen.doses))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_doses_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 3. Cumulative Exposure -->
{#snippet exposureSection(exposure: Section<'exposure'>)}
  <section class="dossier-section" data-dossier-section="exposure">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('exposure')}</h2>
    </div>

    {#if exposure.doseTotals.length}
      <h3 class="sub-heading">{m.exposure_dose_totals_title()}</h3>
      <DossierTable label={m.exposure_dose_totals_title()}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.drug_label()}</th>
              <th>{m.route_label()}</th>
              <th>{m.exposure_dose_totals_title()}</th>
            </tr>
          </thead>
          <tbody>
            {#each exposure.doseTotals as dt, i (JSON.stringify([dt.drug, dt.route, dt.doseUnit]))}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.drug_label()}><strong>{dt.drug}</strong></td>
                <td data-label={m.route_label()}>{routeLabel(dt.route)}</td>
                <td data-label={m.exposure_dose_totals_title()} class="num">{dt.total} {dt.doseUnit}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(exposure.doseTotals) > 0}
        {@render truncateNote(overflowCount(exposure.doseTotals))}
      {/if}
    {/if}

    {#if exposure.routeDays.length}
      <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_route_days_title()}</h3>
      <DossierTable label={m.exposure_route_days_title()}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.route_label()}</th>
              <th>{m.exposure_route_days_title()}</th>
            </tr>
          </thead>
          <tbody>
            {#each exposure.routeDays as rd, i (rd.route)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.route_label()}>{episodeRoute(rd.route)}</td>
                <td data-label={m.exposure_route_days_title()} class="num">{m.exposure_medication_days_count({ days: rd.days })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(exposure.routeDays) > 0}
        {@render truncateNote(overflowCount(exposure.routeDays))}
      {/if}
      <p class="dossier-footnote" data-dossier-route-days-note>
        {m.exposure_route_days_note()}
      </p>
    {/if}

    {#if exposure.regimenDays.length}
      <h3 class="sub-heading" style="margin-top: var(--space-3);">{m.exposure_regimen_days_title()}</h3>
      <DossierTable label={m.exposure_regimen_days_title()}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.drug_label()}</th>
              <th>{m.dose_label()}</th>
              <th>{m.route_label()}</th>
              <th>{m.exposure_regimen_days_title()}</th>
            </tr>
          </thead>
          <tbody>
            {#each exposure.regimenDays as regd, i (regd.episodeId)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.drug_label()}><strong>{regd.drug}</strong></td>
                <td data-label={m.dose_label()} class="num">{regd.dose} {regd.doseUnit}</td>
                <td data-label={m.route_label()}>{episodeRoute(regd.route)}</td>
                <td data-label={m.exposure_regimen_days_title()} class="num">{m.exposure_medication_days_count({ days: regd.days })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(exposure.regimenDays) > 0}
        {@render truncateNote(overflowCount(exposure.regimenDays))}
      {/if}
      <p class="dossier-footnote" data-dossier-regimen-days-note>
        {m.exposure_regimen_days_note()}
      </p>
    {/if}
  </section>
{/snippet}

<!-- 4. Lab Results & Post-Dose Timing Context -->
{#snippet labsSection(labs: Section<'labs'>)}
  <section class="dossier-section" data-dossier-section="labs">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('labs')}</h2>
    </div>

    {#if labs.length}
      <DossierTable label={clinicianSummarySectionName('labs')}>
        <table class="dossier-table dossier-lab-table">
          <thead>
            <tr>
              <th>{m.date_label()}</th>
              <th>{m.labs_analyte_label()}</th>
              <th>{m.labs_value_label()}</th>
              <th>{m.clinician_summary_timing_header()}</th>
              <th>{m.labs_provider_label()}</th>
              <th>{m.labs_note_label()}</th>
            </tr>
          </thead>
          <tbody>
            {#each labs as lab, i (lab.id)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.date_label()} class="num">
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
      {#if overflowCount(labs) > 0}
        {@render truncateNote(overflowCount(labs))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_labs_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 5. Side effects, ongoing and resolved. Two tables under their own
     headings rather than one under "Active": the part reads every side
     effect active at some point in the range (clinicianSummary.ts), and
     one that resolved in it was not active when the page was printed
     (functional audit ticket 39, off ticket 23's resolved day). -->
{#snippet sideEffectRows(effects: SideEffect[], resolved: boolean)}
  <DossierTable label={resolved ? m.clinician_summary_side_effects_resolved() : m.clinician_summary_side_effects_ongoing()}>
    <table class="dossier-table">
      <thead>
        <tr>
          <th>{m.started_label()}</th>
          {#if resolved}<th>{m.side_effect_resolved_label()}</th>{/if}
          <th>{m.what_is_it_label()}</th>
          <th>{m.side_effect_severity_label()}</th>
        </tr>
      </thead>
      <tbody>
        {#each effects as effect, i (effect.id)}
          <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
            <td data-label={m.started_label()} class="num">{@render date(effect.epochDay)}</td>
            {#if resolved && effect.resolvedEpochDay !== null}
              <td data-label={m.side_effect_resolved_label()} class="num">{@render date(effect.resolvedEpochDay)}</td>
            {/if}
            <td data-label={m.what_is_it_label()}><strong>{effect.name}</strong></td>
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
  {#if overflowCount(effects) > 0}
    {@render truncateNote(overflowCount(effects))}
  {/if}
{/snippet}

{#snippet sideEffectsSection(sideEffects: Section<'sideEffects'>)}
  {@const ongoing = sideEffects.filter((effect) => effect.resolvedEpochDay === null)}
  {@const resolved = sideEffects.filter((effect) => effect.resolvedEpochDay !== null)}
  <section class="dossier-section" data-dossier-section="sideEffects">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('sideEffects')}</h2>
    </div>

    {#if ongoing.length}
      <h3 class="sub-heading" data-side-effects="ongoing">{m.clinician_summary_side_effects_ongoing()}</h3>
      {@render sideEffectRows(ongoing, false)}
    {/if}
    {#if resolved.length}
      <h3 class="sub-heading" data-side-effects="resolved">{m.clinician_summary_side_effects_resolved()}</h3>
      {@render sideEffectRows(resolved, true)}
    {/if}
    {#if !sideEffects.length}
      <p class="dossier-empty-note">{m.clinician_summary_side_effects_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 6. Changes noticed: each change the
     person marked, oldest first, with the day they first noticed it. A
     built-in change is named in the reader's language from its key; one
     the person added keeps the name they gave it. -->
{#snippet personalEffectsSection(changes: Section<'personalEffects'>)}
  <section class="dossier-section" data-dossier-section="personalEffects">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('personalEffects')}</h2>
    </div>

    {#if changes.length}
      <DossierTable label={clinicianSummarySectionName('personalEffects')}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.effect_first_noticed_label()}</th>
              <th>{m.clinician_summary_change_label()}</th>
            </tr>
          </thead>
          <tbody>
            {#each changes as change, i (change.effect)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.effect_first_noticed_label()} class="num">{@render date(change.firstNoticedEpochDay)}</td>
                <td data-label={m.clinician_summary_change_label()}>
                  <strong>{change.builtIn ? personalEffectName(change.effect) : change.name}</strong>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(changes) > 0}
        {@render truncateNote(overflowCount(changes))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_personal_effects_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 7. Cycle Events -->
{#snippet cycleEventsSection(cycleEvents: Section<'cycleEvents'>)}
  <section class="dossier-section" data-dossier-section="cycleEvents">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('cycleEvents')}</h2>
    </div>

    {#if cycleEvents.length}
      <DossierTable label={clinicianSummarySectionName('cycleEvents')}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.date_label()}</th>
              <th>{m.cycle_event_kind_label()}</th>
            </tr>
          </thead>
          <tbody>
            {#each cycleEvents as event, i (event.id)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.date_label()} class="num">{@render date(event.epochDay)}</td>
                <td data-label={m.cycle_event_kind_label()}><strong>{cycleEventKindName(event.kind)}</strong></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(cycleEvents) > 0}
        {@render truncateNote(overflowCount(cycleEvents))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_cycle_events_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 8. Consultation Questions (Appointment Prep) -->
{#snippet appointmentPrepSection(appointmentPrep: Section<'appointmentPrep'>)}
  <section class="dossier-section" data-dossier-section="appointmentPrep">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('appointmentPrep')}</h2>
    </div>

    {#if appointmentPrep.length}
      <DossierTable label={clinicianSummarySectionName('appointmentPrep')}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.status_label()}</th>
              <th>{m.appointment_prep_title()}</th>
            </tr>
          </thead>
          <tbody>
            {#each appointmentPrep as item, i (item.id)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.status_label()} style="width: 130px;">
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
      {#if overflowCount(appointmentPrep) > 0}
        {@render truncateNote(overflowCount(appointmentPrep))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_appointment_prep_empty()}</p>
    {/if}
  </section>
{/snippet}

<!-- 9. Procedures & Recovery (if present) -->
{#snippet proceduresSection(procedures: Section<'procedures'>)}
  {#if procedures.length}
    <section class="dossier-section" data-dossier-section="procedures">
      <div class="dossier-section-header">
        <h2 class="dossier-section-title">{clinicianSummarySectionName('procedures')}</h2>
      </div>

      <DossierTable label={clinicianSummarySectionName('procedures')}>
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
            {#each procedures as proc, i (proc.id)}
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
                      <span class="muted small">· {m.surgery_day()}</span>
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
      {#if overflowCount(procedures) > 0}
        {@render truncateNote(overflowCount(procedures))}
      {/if}
    </section>
  {/if}
{/snippet}

<!-- 10. Tracking that ended. A stopped stream
     reads as a decision with a date rather than as missing data, which is
     what the flat stretch on the charts above needs explaining with. -->
{#snippet finishedAreasSection(finishedAreas: Section<'finishedAreas'>)}
  <section class="dossier-section" data-dossier-section="finishedAreas">
    <div class="dossier-section-header">
      <h2 class="dossier-section-title">{clinicianSummarySectionName('finishedAreas')}</h2>
    </div>

    {#if finishedAreas.length}
      <DossierTable label={clinicianSummarySectionName('finishedAreas')}>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>{m.area_finish_table_area()}</th>
              <th>{m.area_finish_table_ended()}</th>
            </tr>
          </thead>
          <tbody>
            {#each finishedAreas as area, i (area.key)}
              <tr class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}>
                <td data-label={m.area_finish_table_area()}><strong>{areaGroupName(area.key)}</strong></td>
                <td data-label={m.area_finish_table_ended()} class="num">{@render date(area.epochDay)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </DossierTable>
      {#if overflowCount(finishedAreas) > 0}
        {@render truncateNote(overflowCount(finishedAreas))}
      {/if}
    {:else}
      <p class="dossier-empty-note">{m.clinician_summary_finished_areas_empty()}</p>
    {/if}
  </section>
{/snippet}

<div class="clinician-dossier" data-clinician-dossier>
  <!-- A part switched on or off on the sheet opens or closes its own
       height, so the parts under it travel rather than jump (functional
       audit ticket 39, which added the changes part and its switch). Local
       transitions, so the parts drawn with the page do not play them. -->
  {#each CLINICIAN_SUMMARY_SECTION_KEYS as key (key)}
    {@const content = summary.sections[key]}
    {#if content !== null}<div class="dossier-part" data-dossier-part={key} transition:partDisclose>{@render sectionSnippet(key)(content)}</div>{/if}
  {/each}

  {#if isSummaryEmpty}
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
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
    color: var(--text);
    break-after: avoid;
  }

  @media print {
    .sub-heading {
      margin: 10pt 0 5pt;
      font-size: 11pt;
    }
  }
</style>
