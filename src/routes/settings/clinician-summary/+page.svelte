<script lang="ts">
  /* Overhauled Clinician Summary / Clinical Dossier Generator (phase 5 ticket 09).
     Synthesizes patient demographics, current regimen, dose history, cumulative
     exposure, lab timeline with post-dose context, side effects, cycle events,
     and appointment prep consultation questions.

     Provides toggle switches to selectively include or redact sections before
     printing or saving to PDF. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    dayRangeEndMin,
    dayRangeStartMax,
    epochDayFromDateInputValue,
    ongoingWindowRange,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { printCurrentPage } from '$lib/print/print';
  import {
    assembleClinicianDossier,
    CLINICIAN_DOSSIER_INCLUSION_KEYS,
    DEFAULT_CLINICIAN_DOSSIER_INCLUSION,
    type ClinicianDossierInclusion,
    type ClinicianDossierInclusionKey
  } from '$lib/data/export/clinicianSummaryData';
  import { clinicianDossierPartName } from '$lib/data/vocabulary/clinicianSummaryLabels';
  import ClinicianSummaryDossier from '$lib/components/ClinicianSummaryDossier.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { crossfade } from '$lib/motion/reveal';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);
  const defaultRange = ongoingWindowRange(today, 90);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));
  let dobInput = $state('');
  let inclusion = $state<ClinicianDossierInclusion>({ ...DEFAULT_CLINICIAN_DOSSIER_INCLUSION });

  let range = $derived(
    customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput))
  );

  let dossierQuery = liveQuery((j) =>
    range
      ? assembleClinicianDossier(j, {
          fromEpochDay: range.start,
          toEpochDay: range.end,
          demographics: {
            name: prefs.name,
            dob: dobInput.trim() || null
          },
          inclusion
        })
      : Promise.resolve(null)
  );
  let dossier = $derived(dossierQuery.value);

  const dayLong = (epochDay: number) =>
    fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  function include(key: ClinicianDossierInclusionKey, value: boolean) {
    inclusion = { ...inclusion, [key]: value };
  }

  function printSummary() {
    void printCurrentPage(m.clinician_summary_title());
  }
</script>

<div class="screen clinician-summary">
  <ScreenHeader title={m.clinician_summary_title()} back="/more" class="no-print" subtitle={m.clinician_summary_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" aria-label={m.clinician_summary_print()} onclick={printSummary}>
        <Icon name="share" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- Controls: Date Range and Optional DOB -->
  <div class="kit-filter cd-endpoints no-print">
    <Field label={m.clinician_summary_range_start_label()} id="clinician-summary-start">
      {#snippet children(id)}
        <DatePicker max={dayRangeStartMax(endInput) ?? todayInput} bind:value={startInput} {id} />
      {/snippet}
    </Field>
    <Field label={m.clinician_summary_range_end_label()} id="clinician-summary-end">
      {#snippet children(id)}
        <DatePicker min={dayRangeEndMin(startInput)} max={todayInput} bind:value={endInput} {id} />
      {/snippet}
    </Field>
  </div>
  {#if range === null}
    <p class="muted small no-print">{m.clinician_summary_range_required()}</p>
  {/if}

  <div class="no-print" style="margin-bottom:var(--space-4)">
    <Field label={m.clinician_summary_dob_optional()} id="clinician-summary-dob">
      {#snippet children(id)}
        <input
          {id}
          type="text"
          class="input"
          placeholder={m.clinician_summary_dob_placeholder()}
          bind:value={dobInput}
        />
      {/snippet}
    </Field>
  </div>

  <!-- Section Inclusion / Redaction Toggles -->
  <div class="no-print" style="margin-bottom:var(--space-4)">
    <SectionHeading text={m.clinician_summary_include_title()} />
    <p class="muted small" style="margin-bottom:var(--space-2)">{m.clinician_summary_include_note()}</p>
    <ListCard>
      <div class="inclusion-container" data-dossier-inclusion>
        {#each CLINICIAN_DOSSIER_INCLUSION_KEYS as key (key)}
          <div class="spread inclusion-row" data-inclusion={key}>
            <span>{clinicianDossierPartName(key)}</span>
            <Switch
              checked={inclusion[key]}
              label={clinicianDossierPartName(key)}
              onChange={(v) => include(key, v)}
            />
          </div>
        {/each}
      </div>
    </ListCard>
  </div>

  {#if range}
    <div class="print-heading" class:has-demographics={Boolean(dossier?.demographics)}>
      <h1>{m.clinician_summary_title()}</h1>
      <p>{dayLong(range.start)} – {dayLong(range.end)}</p>
      <p class="muted small">{m.clinician_summary_generated({ date: dayLong(today) })}</p>
    </div>
  {/if}

  <!-- Generated Dossier -->
  {#if range === null}
    <!-- Nothing to assemble until boundaries are picked -->
  {:else if dossierQuery.loading || !dossier}
    <div out:crossfade><Skeleton variant="block" count={4} /></div>
  {:else}
    <div class="dossier-output">
      <ClinicianSummaryDossier {dossier} />
    </div>
  {/if}
</div>

<style>
  .inclusion-container {
    padding: var(--space-2) var(--space-3);
  }

  .inclusion-row {
    padding: var(--space-2) 0;
  }

  .inclusion-row + .inclusion-row {
    border-top: 1px solid var(--border);
  }

  .dossier-output {
    margin-top: var(--space-2);
  }

  @media print {
    .dossier-output {
      margin-top: 0;
    }

    .print-heading.has-demographics {
      display: none;
    }
  }
</style>
