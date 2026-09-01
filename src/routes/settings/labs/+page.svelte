<script lang="ts">
  /* Your numbers, your trend, on the surface and chart kits (phase 5 UX
     ticket 25).

     The first thing on the screen was a card of unit preferences - a
     heading, an explanation and one select per analyte - so a screen about
     lab results opened on a settings form. It is a sheet off the header
     now, beside the import control, which is where every other feature
     screen keeps the thing it configures rather than the thing it shows.

     The charts are the kit's area chart. What that changes beyond the
     drawing is how an exact number is read: tapping a dot used to open a
     panel under the line that stayed until it was dismissed, and dragging
     across the plot now names each reading as the finger passes it. The
     draw's context - the timing figure and the lab - rides on the scrub's
     own label, so it is still the same three facts as before. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import type { LabSeries } from '$lib/data/journal/labs';
  import { paddedSeries } from '$lib/charts/geometry';
  import { annotationSpan, narrowAnnotations } from '$lib/charts/annotations';
  import { seriesComparability } from '$lib/data/labTiming';
  import { comparabilityLabels, labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { createOcrMachine, type OcrMachineState, type OcrSaver } from '$lib/data/labs/ocr-machine';
  import { ALLOWED_PREFERRED_UNITS, PREFERRED_UNIT_ANALYTES, preferredUnitForAnalyte, normalizeUnit, type PreferredUnitAnalyte } from '$lib/data/labs/units';
  import { defaultUnitForAnalyte, nextUnitAfterAnalyteChange } from '$lib/data/labs/preferred-units';
  import { platformImageSource, tesseractOcrRecognizer } from '$lib/data/labs/ocr-adapters';
  import { isAndroid } from '$lib/platform';
  import {
    parseLabNumeric,
    type OcrReviewRow
  } from '$lib/data/labs/ocr';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { LabResult } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Colour that carries a value takes role 0 (DIRECTION.md). The results
     list takes the stripe after it. */
  const SECTION_ROLE = { chart: 0, results: 1 };

  let unitsOpen = $state(false);

  /* No hormone assumed: the screen opens on whatever the journal actually
     has, and stays empty until getMostRecentAnalyte resolves (ticket 37). */
  let analyte = $state('');

  /* Two lists, two questions: the picker offers analytes with results behind
     them, because a trend needs data, while the editor offers those plus the
     presets. Both are queries now; neither is mirrored, since a lab result is
     entry-shaped data (ADR-0004). */
  let usedQuery = liveList((j) => j.labs.getUsedAnalytes());
  let analytes = $derived(usedQuery.rows);
  let offeredQuery = liveList((j) => j.labs.getAnalytes());
  /* Which analyte the screen opens on, or falls back to after the one on
     screen stops having results (ticket 37). Gated on both queries loading:
     deciding early off usedQuery alone would settle on analytes[0] before
     mostRecentQuery answers, and never revisit it once analyte is no longer
     "missing". */
  let mostRecentQuery = liveQuery((j) => j.labs.getMostRecentAnalyte());
  $effect(() => {
    if (usedQuery.loading || mostRecentQuery.loading) return;
    if (analytes.length && !analytes.includes(analyte)) analyte = mostRecentQuery.value ?? analytes[0];
  });

  /* The list is every result this analyte has, in order. The charts are those
     same results split by unit (ticket 02): a value in ng/dL and one in
     nmol/L differ by a factor of about 29, so a single line over both would
     draw a cliff where nothing happened.

     Two reads rather than one regrouped here, because they are two questions:
     the list's order is the query's, down to how two results on one day
     settle, and reconstructing that from the series would be re-implementing
     it. */
  let resultsQuery = liveList((j) => j.labs.getResults(analyte));
  let results = $derived(resultsQuery.rows);
  let seriesQuery = liveList((j) => j.labs.getSeries(analyte));
  let series = $derived(seriesQuery.rows);

  /* What was happening around these draws (ticket 23). One query across every
     series this analyte has, narrowed per chart below: a series exists per
     unit and each one covers however long that unit has been drawn in, so
     there is no single range to ask for - and asking once per chart would be
     one query per unit for the same six tables. */
  let drawnOn = $derived(series.flatMap((s) => s.results.map((r) => r.epochDay)));
  let span = $derived(annotationSpan(drawnOn, todayEpochDay()));
  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(span.from, span.to, todayEpochDay()));

  /* Ten as the flat-run floor rather than measurements' one: an analyte's
     values run in the hundreds, so a whole unit either side would still
     draw as a flat line. */
  const chartFor = (s: LabSeries) =>
    paddedSeries(
      s.results.map((r) => ({ x: r.epochDay, y: r.value })),
      10
    );

  /** What the scrub says above a reading: when it was drawn, and the
      context it was drawn in. The value itself is on the other half of the
      readout, which is why it is not repeated here - the same three facts
      the list rows carry, split the way the chart card splits them. */
  const scrubLine = (r: LabResult | undefined) => {
    if (!r) return '';
    const date = fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
    const context = contextLine(r);
    return context ? `${date} · ${context}` : date;
  };

  /** The context beside a value, wherever it appears: the timing figure and
      the lab, whichever of the two is known. Blank when neither is. */
  const contextLine = (r: LabResult) =>
    [r.timing ? labTimingLabel(r.timing) : '', r.provider.trim()].filter(Boolean).join(' · ');

  type LabDraft = {
    id?: string;
    date: string;
    time: string;
    analyte: string;
    customAnalyte: string;
    value: string;
    unit: string;
    note: string;
    provider: string;
    /** Read-only: the context is frozen when the result is saved, so the
        sheet shows what was recorded rather than offering to change it. */
    timing: LabResult['timing'];
  };

  const record = recordEditor<LabResult, LabDraft>({
    blank: () => ({
      date: dateInputValueFromEpochDay(todayEpochDay()),
      time: '',
      /* Whatever the screen is already showing - itself the most
         recently logged analyte, or none - rather than a hormone
         (ticket 37). Unit likewise: a set preferred unit wins, then the
         last unit this analyte was actually recorded in, the same
         fallback the measurements screen uses for its own unit. */
      analyte,
      customAnalyte: '',
      value: '',
      unit: defaultUnitForAnalyte(analyte, prefs.preferredLabUnits) || (results.at(-1)?.unit ?? ''),
      note: '',
      provider: '',
      timing: null
    }),
    fromRecord: (result) => ({
      id: result.id,
      date: dateInputValueFromEpochDay(result.epochDay),
      time: result.drawTime ?? '',
      analyte: result.analyte,
      customAnalyte: '',
      value: String(result.value),
      unit: result.unit,
      note: result.note,
      provider: result.provider,
      timing: result.timing
    }),
    async upsert(draft) {
      const value = parseFloat(draft.value);
      const resultAnalyte = draft.analyte === 'custom' ? draft.customAnalyte.trim() : draft.analyte;
      if (isNaN(value) || !resultAnalyte) return false;

      /* Which units this analyte already has, ignoring the result being edited,
         so that changing the unit on an analyte's only result does not announce
         a second trend that will not exist. */
      const unit = normalizeUnit(draft.unit);
      const otherUnits = new Set(
        (await journal.labs.getSeries(resultAnalyte))
          .filter((s) => s.results.some((r) => r.id !== draft.id))
          .map((s) => s.unit)
      );

      await journal.labs.upsertResult({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        analyte: resultAnalyte,
        value,
        unit: draft.unit,
        note: draft.note,
        /* An empty time input is "not recorded", not midnight. The journal
           derives the timing context from this; a blank one means no hours
           figure rather than a zero (labTiming.ts). */
        drawTime: draft.time || null,
        provider: draft.provider
      });
      analyte = resultAnalyte;

      /* Stated, not warned about: a new unit is a normal thing for a lab to
         report, and all that follows from it is a second line. */
      if (otherUnits.size && !otherUnits.has(unit)) {
        toast(unit ? m.labs_new_unit_toast({ unit, analyte: resultAnalyte }) : m.labs_no_unit_toast(), {
          kind: 'lab-new-unit'
        });
      }
    },
    remove: (id) => journal.labs.deleteResult(id),
    findById: (id) => results.find((result) => result.id === id)
  });

  // ---------------------------------------------------------------------------
  // OCR state machine
  // ---------------------------------------------------------------------------

  const ocrSaver: OcrSaver = {
    getExistingResults: (a) => journal.labs.getResults(a),
    getPreferredUnit: (a) => preferredUnitForAnalyte(a, prefs.preferredLabUnits),
    async saveResult(params) {
      await journal.labs.upsertResult(params);
      analyte = params.analyte;
    }
  };

  // The machine writes to its own closed-over object; it cannot write into a
  // $state proxy from inside its own methods. So the component owns the
  // reactive copy, and the machine notifies it on every transition.
  let ocrState = $state<OcrMachineState>({ tag: 'idle' });
  const ocr = createOcrMachine(
    platformImageSource(),
    tesseractOcrRecognizer(),
    ocrSaver,
    (next) => {
      ocrState = next;
    }
  );

  // After save succeeds, show a toast and return to idle.
  $effect(() => {
    if (ocrState.tag === 'saved') {
      toast(m.labs_ocr_saved_toast({ count: String(ocrState.count) }));
      ocr.close();
    }
  });

  // Derive error message string for the review sheet's notice.
  let ocrValidationError = $derived(
    ocrState.tag === 'save-validation-failed'
      ? ocrState.error === 'missing-analyte'
        ? m.labs_ocr_missing_analyte()
        : ocrState.error === 'invalid-value'
          ? m.labs_ocr_invalid_value()
          : ocrState.error === 'missing-date'
            ? m.labs_ocr_missing_date()
            : m.labs_ocr_invalid_date()
      : ocrState.tag === 'save-failed'
        ? m.labs_ocr_failed()
        : ''
  );

  // The review rows, available from review, save-validation-failed, and save-failed states.
  let ocrRows = $derived<OcrReviewRow[]>(
    ocrState.tag === 'review' ||
    ocrState.tag === 'save-validation-failed' ||
    ocrState.tag === 'save-failed'
      ? ocrState.rows
      : []
  );

  // Whether the OCR sheet should be open (any non-idle state).
  let ocrSheetOpen = $derived(ocrState.tag !== 'idle' && ocrState.tag !== 'saved');

  // Title for the sheet header.
  let ocrSheetTitle = $derived(
    ocrState.tag === 'review' || ocrState.tag === 'save-validation-failed' || ocrState.tag === 'saving' || ocrState.tag === 'save-failed'
      ? m.labs_ocr_review_sheet()
      : ocrState.tag === 'no-rows'
        ? m.labs_ocr_empty_sheet()
        : m.labs_ocr_pick_sheet()
  );

  /* What the scanner is about to spend, said before it spends it (phase 5
     performance ticket 01). The engine and its two language files are 21 MB
     over the wire and the shell no longer precaches them, so a person opening
     this on mobile data is about to pay for a feature they may have opened by
     accident. Not on Android, where every one of those files is already inside
     the APK and nothing is downloaded at all. */
  const ocrDownloads = !isAndroid();

  function openOcrImport() {
    ocr.open();
  }

  function closeOcrSheet() {
    ocr.close();
  }

  function handleOcrRowsChange(rows: OcrReviewRow[]) {
    ocr.updateRows(rows);
  }

  function setPreferredUnit(analyteName: PreferredUnitAnalyte, unit: string) {
    const next = { ...prefs.preferredLabUnits };
    if (unit) next[analyteName] = unit;
    else delete next[analyteName];
    prefs.preferredLabUnits = next;
  }

  /** What the analyte select is set to, spelled out: the custom option
      carries its name in a field of its own. */
  const analyteOf = (draft: LabDraft) => (draft.analyte === 'custom' ? draft.customAnalyte : draft.analyte);

  function changeEditorAnalyte(draft: LabDraft, next: string) {
    draft.unit = nextUnitAfterAnalyteChange({
      previousAnalyte: analyteOf(draft),
      nextAnalyte: next === 'custom' ? '' : next,
      currentUnit: draft.unit,
      preferredUnits: prefs.preferredLabUnits
    });
    draft.analyte = next;
  }

  /* Ticket 11's other entry point into the appointment prep list: a one-tap
     add, seeded from the analyte already on screen. */
  async function addToAppointmentPrep(draft: LabDraft) {
    const resultAnalyte = analyteOf(draft);
    if (!resultAnalyte) return;
    await journal.checklists.addToStandaloneChecklist(m.appointment_prep_from_lab_item({ analyte: resultAnalyte }));
    toast(m.appointment_prep_added_toast());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.lab_results()} back="/more" subtitle={m.labs_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-preferred-units aria-label={m.labs_preferred_units_title()} onclick={() => (unitsOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
      <button class="icon-btn press" data-import-lab aria-label={m.labs_ocr_import_aria()} onclick={openOcrImport}>
        <Icon name="camera" size={20} />
      </button>
      <button class="icon-btn press" data-add aria-label={m.labs_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={usedQuery} variant="block" count={1}>
    {#snippet rows()}
      <div class="screen-part">
        <Segmented
          name={m.labs_analyte_group()}
          options={analytes.map((a) => ({ value: a, label: a }))}
          value={analyte}
          onChange={(v) => (analyte = v)}
          key="labs-analyte"
        />

        {#each series as s (s.unit)}
          {@const chart = chartFor(s)}
          {@const mixed = comparabilityLabels(seriesComparability(s.results))}
          <div data-lab-series={s.unit}>
            <ChartCard heading={analyte} kind="labs-{s.unit}" role={roleAt(activeFlag.roles, SECTION_ROLE.chart)}>
              {#snippet control()}
                <!-- The unit on the heading's line, which is the one thing
                     about this chart that is not the analyte above it. A
                     series exists per unit precisely because a value in
                     ng/dL and one in nmol/L differ by a factor of about 29. -->
                <span class="muted small" data-series-unit>{s.unit || m.labs_no_unit()}</span>
              {/snippet}
              {#if chart}
                {@const ends = fmtRangeEnds(chart.from, chart.to)}
                <AreaChart
                  points={chart.points}
                  min={chart.min}
                  max={chart.max}
                  from={ends.from}
                  to={ends.to}
                  formatValue={(v) => `${Math.round(v * 100) / 100} ${s.unit || m.labs_no_unit()}`}
                  scrubLabel={(_point, index) => scrubLine(s.results[index])}
                  annotations={narrowAnnotations(annotationsQuery.rows, chart.from, chart.to)}
                  ariaLabel={m.values_title({ name: analyte })}
                />
              {:else}
                <ChartEmpty>{m.labs_too_little()}</ChartEmpty>
              {/if}
            </ChartCard>
            <!-- Stated, not warned about: the series is drawn whole, and this
                 says what it is made of (ticket 03). -->
            {#if mixed.length}
              <Notice
                icon="info"
                key="lab-mixed"
                data-lab-mixed={s.unit}
                title={m.labs_mixed_title()}
                text={m.labs_mixed_body()}
              />
              <ul class="lab-mixed-list">
                {#each mixed as reason (reason)}<li>{reason}</li>{/each}
              </ul>
            {/if}
          </div>
        {/each}

        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.results)}>
          <!-- Hand-rolled rather than ListRow (ticket 16): the value carries
               .lab-value (app.css) to opt back into text selection, and the
               context line carries .lab-context's own size and colour -
               both classes ListRow's plain title/subtitle strings have no
               room for. -->
          {#each [...results].reverse() as r (r.id)}
            <button
              class="kit-row"
              data-lab-result={r.id}
              aria-label={m.labs_result_aria({ analyte: r.analyte, date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
              onclick={() => record.openEditor(r)}
            >
              <span class="kit-row-ico"><Icon name="flask" size={22} /></span>
              <span class="kit-row-text">
                <span class="kit-row-title lab-value">{r.value} {r.unit}</span>
                <span class="kit-row-sub">
                  {fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{r.note ? ' · ' + r.note : ''}
                </span>
                <!-- The context on its own line, not appended to the date: it is
                     two more facts about the draw, and three of them run together
                     stop being readable at 390px. -->
                {#if contextLine(r)}
                  <span class="kit-row-sub lab-context">{contextLine(r)}</span>
                {/if}
              </span>
            </button>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="flask"
          key="labs-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.results)}
          title={m.labs_empty_title()}
          text={m.labs_empty_body()}
          action={{ label: m.labs_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <Sheet open={unitsOpen} title={m.labs_preferred_units_title()} onClose={() => (unitsOpen = false)}>
    <h3>{m.labs_preferred_units_title()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.labs_preferred_units_intro()}</p>
    {#each PREFERRED_UNIT_ANALYTES as analyteName (analyteName)}
      <Field label={analyteName} id={`preferred-unit-${analyteName}`}>
        {#snippet children(id)}
          <select
            class="input"
            {id}
            value={preferredUnitForAnalyte(analyteName, prefs.preferredLabUnits) ?? ''}
            onchange={(e) => setPreferredUnit(analyteName, (e.target as HTMLSelectElement).value)}
          >
            <option value="">{m.labs_preferred_units_source_default()}</option>
            {#each ALLOWED_PREFERRED_UNITS[analyteName] as unit (unit)}
              <option value={unit}>{unit}</option>
            {/each}
          </select>
        {/snippet}
      </Field>
    {/each}
  </Sheet>

  <RecordSheet
    {record}
    handle="lab"
    newTitle={m.labs_new_sheet()}
    editTitle={m.labs_edit_sheet()}
    saveLabel={m.labs_save()}
    deleteLabel={m.labs_delete()}
    confirm={{
      title: m.labs_delete_sheet(),
      question: (result) => m.labs_delete_q({ analyte: result.analyte }),
      hint: () => m.labs_delete_hint(),
      confirmLabel: m.labs_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <div class="cd-endpoints">
        <Field label={m.labs_date_label()} id="lab-date">
          {#snippet children(id)}
            <DatePicker name="lab-date" bind:value={editor.date} {id} />
          {/snippet}
        </Field>
        <!-- Optional, and the hours figure depends on it: a lab slip often
             carries no time, and day-of-interval does not need one. -->
        <Field label={m.labs_time_label()} id="lab-time">
          {#snippet children(id)}
            <input class="input" type="time" {id} name="lab-time" bind:value={editor.time} />
          {/snippet}
        </Field>
      </div>
      <Field label={m.labs_analyte_label()} id="lab-analyte">
        {#snippet children(id)}
          <select class="input" {id} value={editor.analyte} onchange={(e) => changeEditorAnalyte(editor, (e.target as HTMLSelectElement).value)}>
            {#if !editor.analyte}
              <option value="">{m.labs_analyte_choose()}</option>
            {/if}
            {#each offeredQuery.rows as a (a)}
              <option value={a}>{a}</option>
            {/each}
            <option value="custom">{m.labs_analyte_custom()}</option>
          </select>
        {/snippet}
      </Field>
      {#if editor.analyte === 'custom'}
        <div class="disclosed" transition:disclose>
          <Field label={m.labs_custom_label()} id="lab-custom-analyte">
            {#snippet children(id)}
              <input class="input" {id} name="lab-custom-analyte" placeholder={m.labs_custom_placeholder()} bind:value={editor.customAnalyte} />
            {/snippet}
          </Field>
        </div>
      {/if}
      <div class="cd-endpoints">
        <Field label={m.labs_value_label()} id="lab-value">
          {#snippet children(id)}
            <input class="input" type="number" {id} name="lab-value" placeholder={m.labs_value_placeholder()} inputmode="decimal" bind:value={editor.value} />
          {/snippet}
        </Field>
        <Field label={m.labs_unit_label()} id="lab-unit">
          {#snippet children(id)}
            <input class="input" {id} name="lab-unit" placeholder={m.labs_unit_placeholder()} bind:value={editor.unit} />
          {/snippet}
        </Field>
      </div>
      <Field label={m.labs_provider_label()} id="lab-provider">
        {#snippet children(id)}
          <input class="input" {id} name="lab-provider" placeholder={m.labs_provider_placeholder()} bind:value={editor.provider} />
        {/snippet}
      </Field>
      <Field label={m.labs_note_label()} id="lab-note">
        {#snippet children(id)}
          <input class="input" {id} name="lab-note" placeholder={m.labs_note_placeholder()} bind:value={editor.note} />
        {/snippet}
      </Field>

      <!-- The detail view's copy of the context. Read-only, because it was
           recorded when the result was saved and is not recomputed
           afterwards (ticket 03, box 6). A saved result with no hours figure
           says what would give it one, rather than staying blank. -->
      {#if editor.id}
        <div class="kit-panel editor-section" data-lab-context>
          <h4>{m.labs_context_title()}</h4>
          {#if editor.timing}
            <p class="lab-context">{labTimingLabel(editor.timing)}</p>
            <p class="muted small">{m.labs_context_frozen()}</p>
          {:else}
            <p class="muted small">{m.labs_context_none()}</p>
            {#if !editor.time}
              <p class="muted small">{m.labs_context_needs_time()}</p>
            {/if}
          {/if}
        </div>
      {/if}
    {/snippet}
    {#snippet extraActions(editor)}
      <button class="btn btn-soft" data-add-to-appointment-prep onclick={() => addToAppointmentPrep(editor)}>
        <span>{m.appointment_prep_add_button()}</span>
      </button>
    {/snippet}
  </RecordSheet>

  <Sheet
    open={ocrSheetOpen}
    title={ocrSheetTitle}
    onClose={closeOcrSheet}
  >
    <!-- The tag itself, not just its wording, so a walkthrough can grip the
         state directly (ADR-0029) rather than matching translated copy. -->
    <div data-ocr-state={ocrState.tag}>
    {#if ocrState.tag === 'picking'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.labs_ocr_pick_intro()}</p>
      {#if ocrDownloads}
        <Notice
          icon="info"
          key="labs-ocr-download"
          title={m.labs_ocr_download_title()}
          text={m.labs_ocr_download_body()}
        />
      {/if}
      <div class="stack-3">
        <button class="btn btn-soft" data-ocr-pick="gallery" onclick={() => ocr.pickSource('gallery')}>
          <span>{m.labs_ocr_pick_gallery()}</span>
        </button>
        <button class="btn btn-soft" data-ocr-pick="camera" onclick={() => ocr.pickSource('camera')}>
          <span>{m.labs_ocr_pick_camera()}</span>
        </button>
      </div>
    {:else if ocrState.tag === 'recognizing'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <p class="muted small">{m.labs_ocr_running()}</p>
    {:else if ocrState.tag === 'permission-denied'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <div class="notice notice-danger" role="alert" style="margin-bottom:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">{m.labs_ocr_permission_denied()}</div>
      </div>
      <button class="btn btn-soft" data-ocr-retry onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
    {:else if ocrState.tag === 'recognition-failed'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <div class="notice notice-danger" role="alert" style="margin-bottom:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">{m.labs_ocr_failed()}</div>
      </div>
      <button class="btn btn-soft" data-ocr-retry onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
    {:else if ocrState.tag === 'no-rows'}
      <h3>{m.labs_ocr_empty_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.labs_ocr_no_rows_body()}</p>
      <div class="stack-3">
        <button class="btn btn-primary" data-ocr-manual onclick={() => { ocr.close(); record.openEditor(null); }}><span>{m.labs_ocr_no_rows_manual()}</span></button>
        <button class="btn btn-soft" data-ocr-retry onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
      </div>
    {:else if ocrState.tag === 'review' || ocrState.tag === 'save-validation-failed' || ocrState.tag === 'saving' || ocrState.tag === 'save-failed'}
      <h3>{m.labs_ocr_review_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.labs_ocr_review_intro()}</p>
      {#if ocrValidationError}
        <div class="notice notice-danger" role="alert" style="margin-bottom:var(--space-3)">
          <Icon name="alert" size={20} />
          <div class="notice-body">{ocrValidationError}</div>
        </div>
      {/if}
      <div class="stack-3">
        {#each ocrRows as row, i (i)}
          <div class="kit-panel editor-section">
            <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:var(--space-2)">
              <input type="checkbox" checked={row.include} onchange={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, include: (e.target as HTMLInputElement).checked } : r); handleOcrRowsChange(updated); }} />
              <span>{m.labs_ocr_row_include()}</span>
              {#if row.duplicate}
                <span class="notice-warn" style="padding:2px 8px;border-radius:var(--radius-pill);font-size:var(--text-xs)">{m.labs_ocr_duplicate()}</span>
              {/if}
            </label>
            {#if row.lowConfidence}
              <p class="muted small" style="margin-bottom:var(--space-2)">{m.labs_ocr_low_confidence()}</p>
            {/if}
            <Field label={m.labs_analyte_label()} id={`ocr-analyte-${i}`}>
              {#snippet children(id)}
                <input class="input" {id} data-ocr-field="analyte" value={row.analyte} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, analyte: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
              {/snippet}
            </Field>
            <div class="cd-endpoints">
              <Field label={m.labs_value_label()} id={`ocr-value-${i}`}>
                {#snippet children(id)}
                  <input class="input" {id} data-ocr-field="value" inputmode="decimal" value={row.value} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, value: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
                {/snippet}
              </Field>
              <Field label={m.labs_unit_label()} id={`ocr-unit-${i}`}>
                {#snippet children(id)}
                  <input class="input" {id} data-ocr-field="unit" value={row.unit} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, unit: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
                {/snippet}
              </Field>
            </div>
            <Field label={m.labs_date_label()} id={`ocr-date-${i}`}>
              {#snippet children(id)}
                <DatePicker {id} data-ocr-field="date" value={row.date} onchange={(v) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, date: v } : r); handleOcrRowsChange(updated); }} />
              {/snippet}
            </Field>
            <Field label={m.labs_note_label()} id={`ocr-note-${i}`}>
              {#snippet children(id)}
                <input class="input" {id} value={row.note} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, note: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
              {/snippet}
            </Field>
          </div>
        {/each}
      </div>
      <button class="btn btn-primary" data-ocr-save disabled={ocrState.tag === 'saving'} onclick={() => ocr.save()}><span>{m.labs_ocr_save()}</span></button>
    {/if}
    </div>
  </Sheet>
</div>
