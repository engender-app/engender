<script lang="ts">
  /* Overhauled Clinician Summary / Clinical Dossier Generator (phase 5 ticket 09).
     Synthesizes patient demographics, current regimen, dose history, cumulative
     exposure, lab timeline with post-dose context, side effects, cycle events,
     and appointment prep consultation questions.

     Provides toggle switches to selectively include or redact sections before
     printing or saving to PDF. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { mostRecentPastAppointment } from '$lib/data/journal/appointments';
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
    regimenDrugNames,
    type ClinicianDossierInclusion,
    type ClinicianDossierInclusionKey
  } from '$lib/data/export/clinicianSummaryData';
  import { clinicianDossierPartName } from '$lib/data/vocabulary/clinicianSummaryLabels';
  import ClinicianSummaryDossier from '$lib/components/ClinicianSummaryDossier.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
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

  /* Ticket 08: the range, the sections and the drugs are all still set on
     this same screen - the sheet below just holds the controls now instead
     of the screen's own scroll. Closed by default; the row above the
     preview is the only thing that opens it. */
  let controlsOpen = $state(false);

  /* "Since last appointment" (ticket 19): the most recent past appointment
     (appointments.ts's own pure selector, ticket 58), the same one the
     debrief offer is about. Absent rather than defaulted when none is on
     record - the button below does not render, instead of falling back to
     some other window (ticket 19's own line). */
  let appointmentsQuery = liveList((j) => j.appointments.getAppointments());
  let lastAppointment = $derived(mostRecentPastAppointment(appointmentsQuery.rows, today));
  let appointmentDate = $derived(lastAppointment?.epochDay ?? null);

  /* Every drug the person has ever logged a regimen episode for (ticket
     39), unbounded - not scoped to the range below, since the toggle is a
     device preference set once rather than a per-print control. */
  let regimenEpisodesQuery = liveQuery((j) => j.regimen.getEpisodes());
  let drugNames = $derived(regimenDrugNames(regimenEpisodesQuery.value ?? []));
  let excludedDrugs = $derived(
    new Set(drugNames.filter((drug) => prefs.clinicianSummaryDrugExcluded[drug]))
  );

  function toggleDrug(drug: string, included: boolean) {
    prefs.clinicianSummaryDrugExcluded = { ...prefs.clinicianSummaryDrugExcluded, [drug]: !included };
  }

  /* A shortcut for the two fields below, nothing else: it fills the same
     start/end inputs any other pair of dates fills, so it changes no read
     downstream. Two of clinicianSummary.ts's sections (procedures,
     appointmentPrepItems) are already unfiltered by design (ADR-0031) -
     this range does not change that, and does not special-case it either,
     which is the "written decision" ticket 19 asks for: applying it
     uniformly would change what those two sections mean, exactly what
     ADR-0031's own comment there already rules out. */
  function useSinceLastAppointment() {
    if (appointmentDate === null) return;
    startInput = dateInputValueFromEpochDay(appointmentDate);
    endInput = todayInput;
  }

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
          inclusion,
          excludedDrugs
        })
      : Promise.resolve(null)
  );
  let dossier = $derived(dossierQuery.value);

  const dayLong = (epochDay: number) =>
    fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The one row above the preview (ticket 08): what the sheet currently
     holds, read back rather than restated - the same counts and the same
     dates the dossier below is actually built from, so the row can never
     drift from what printing. "Included" rather than the fixed nine and
     however-many-drugs-exist: with every switch on by default the two
     numbers agree, and the row only starts saying something different from
     "everything" once a switch does. */
  let includedSectionCount = $derived(
    CLINICIAN_DOSSIER_INCLUSION_KEYS.filter((key) => inclusion[key]).length
  );
  let includedDrugCount = $derived(drugNames.length - excludedDrugs.size);
  let settingsRowText = $derived.by(() => {
    if (!range) return m.clinician_summary_range_required();
    const rangeText = m.clinician_summary_settings_range({
      start: dayLong(range.start),
      end: dayLong(range.end)
    });
    const sections = m.clinician_summary_settings_sections({ n: includedSectionCount });
    return drugNames.length > 0
      ? m.clinician_summary_settings_row({
          range: rangeText,
          sections,
          drugs: m.clinician_summary_settings_drugs({ n: includedDrugCount })
        })
      : m.clinician_summary_settings_row_no_drugs({ range: rangeText, sections });
  });

  function include(key: ClinicianDossierInclusionKey, value: boolean) {
    inclusion = { ...inclusion, [key]: value };
  }

  function printSummary() {
    void printCurrentPage(m.clinician_summary_title());
  }
</script>

<div class="screen clinician-summary">
  <ScreenHeader title={m.clinician_summary_title()} back="/more" class="no-print" />

  <!-- Ticket 08: the row is the door to every control the old form held,
       stated rather than left for the reader to open the sheet and find
       out (rule 16 - a screen opens on what is true now). It reads the
       range, the section count and the drug count straight off the same
       state the preview below renders from, so it can't say something the
       page underneath it doesn't. Unopenable state (no valid range) reads
       as the same prompt the old inline paragraph gave, in the one place
       left to give it. -->
  <div class="no-print settings-row-wrap">
    <ListRow
      title={settingsRowText}
      key="clinician-summary-settings"
      data-settings-row
      onclick={() => (controlsOpen = true)}
    />
  </div>

  <!-- Generated dossier, shown as the page it will become rather than as
       more screen (ticket 59, and ticket 08's own point: the preview is
       the screen). The sheet under it stays flush (rule 4), with one
       hairline at its foot marking where the dossier ends and the action
       begins - that edge had nothing else beside it to be confused with,
       and read clearly. Not `.card` (components.css): that is the box rule
       4 is carpeting out screen by screen, and a document freshly
       redesigned is not the place to add its fourteenth instance. -->
  {#if range}
    <SectionHeading text={m.clinician_summary_preview_title()} />
    <!-- The heading above stays whether or not the dossier below has
         loaded yet, and so does the print-only heading inside the page:
         the page is the name plus the frame plus what's on it, and either
         one arriving after the other would read as the page turning up
         twice. -->
    <div class="summary-page" data-summary-page>
      <div class="print-heading" class:has-demographics={Boolean(dossier?.demographics)}>
        <h1>{m.clinician_summary_title()}</h1>
        <p>{dayLong(range.start)} – {dayLong(range.end)}</p>
        <p class="muted small">{m.clinician_summary_generated({ date: dayLong(today) })}</p>
      </div>
      {#if dossierQuery.loading || !dossier}
        <div out:crossfade><Skeleton variant="block" count={4} /></div>
      {:else}
        <div class="dossier-output">
          <ClinicianSummaryDossier {dossier} />
        </div>
      {/if}
    </div>
    {#if dossier}
      <!-- Under the page, not inside it and not floating over it: the
           page is the thing being sent, the button is the act of sending
           it. The only verb this screen has (ticket 08) - the header
           carried a second print control before this ticket, sitting
           beside a control that opened nothing but the same action. -->
      <button class="btn btn-primary btn-block summary-print no-print" data-summary-print onclick={printSummary}>
        <Icon name="share" size={18} />
        <span>{m.clinician_summary_print()}</span>
      </button>
    {/if}
  {/if}
</div>

<!-- The controls sheet (ticket 08): every field the form on this screen
     used to hold, unchanged in what it reads and what it defaults to -
     only where it lives moved. The intro paragraph comes with it, since
     the choices it explains are what's in here now, not what's on the
     screen. -->
<Sheet bind:open={controlsOpen} title={m.clinician_summary_settings_title()}>
<!-- Screen-only in one wrap rather than a `no-print` on every field
     inside: `window.print()` renders the live DOM regardless of app state
     (`$lib/print/print.ts`), and a keyboard-triggered print while this
     sheet happens to be open is a real path even though the one print
     button lives outside it, behind the scrim. -->
<div class="no-print">
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.clinician_summary_intro()}</p>

  <div class="kit-filter cd-endpoints">
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
  {#if appointmentDate !== null}
    <div class="cd-since-appointment">
      <button class="btn btn-soft" data-since-last-appointment onclick={useSinceLastAppointment}>
        <span>{m.clinician_summary_since_appointment()}</span>
      </button>
    </div>
  {/if}
  {#if range === null}
    <p class="muted small">{m.clinician_summary_range_required()}</p>
  {/if}

  <div style="margin-bottom:var(--space-4)">
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
  <div style="margin-bottom:var(--space-4)">
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

  {#if drugNames.length > 0}
    <div style="margin-bottom:var(--space-4)">
      <SectionHeading text={m.clinician_summary_drugs_title()} />
      <p class="muted small" style="margin-bottom:var(--space-2)">{m.clinician_summary_drugs_note()}</p>
      <ListCard>
        <div class="inclusion-container" data-dossier-drugs>
          {#each drugNames as drug (drug)}
            <div class="spread inclusion-row" data-drug={drug}>
              <span>{drug}</span>
              <Switch
                checked={!excludedDrugs.has(drug)}
                label={drug}
                onChange={(v) => toggleDrug(drug, v)}
              />
            </div>
          {/each}
        </div>
      </ListCard>
    </div>
  {/if}
</div>
</Sheet>

<style>
  /* Named so the settings-row test below can find it without depending on
     ListRow's own class names, and so the gap to the Preview heading below
     is this screen's call rather than a bare margin on a shared kit row. */
  .settings-row-wrap {
    margin-bottom: var(--space-2);
  }

  .cd-since-appointment {
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
  }

  .inclusion-container {
    padding: var(--space-2) var(--space-3);
  }

  .inclusion-row {
    padding: var(--space-2) 0;
  }

  .inclusion-row + .inclusion-row {
    border-top: 1px solid var(--hairline);
  }

  .dossier-output {
    margin-top: var(--space-2);
  }

  /* Flush (DIRECTION.md rule 4): no `--surface` ground and no `--r-block`
     corner - those are `.card`'s (components.css), the box rule 4 spends
     its own carpet tickets retiring screen by screen. Just the foot gets a
     hairline, marking where the dossier ends and the print action begins;
     the top is named instead, by the SectionHeading above, which is what
     actually reads (see the comment on the markup). */
  .summary-page {
    padding-top: var(--space-2);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--hairline);
  }

  /* Under the page, not inside it and not floating over it (Mobbin's own
     pattern for a document about to be handed over): the page is the
     thing being sent, the button is the act of sending it. */
  .summary-print {
    margin-top: var(--space-4);
  }

  @media print {
    .dossier-output {
      margin-top: 0;
    }

    .print-heading.has-demographics {
      display: none;
    }

    /* The hairline is a screen affordance for a document not yet handed
       over; on paper it is the paper, and printing it would draw a rule
       the reader never asked for across a page @page already bounds. */
    .summary-page {
      padding-top: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
  }
</style>
