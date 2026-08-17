<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { normalizeUnit, type LabSeries } from '$lib/data/journal/labs';
  import { seriesComparability } from '$lib/data/labTiming';
  import { comparabilityLabels, labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { createOcrMachine, type OcrSaver } from '$lib/data/labs/ocr-machine';
  import { ALLOWED_PREFERRED_UNITS, PREFERRED_UNIT_ANALYTES, preferredUnitForAnalyte, type PreferredUnitAnalyte } from '$lib/data/labs/units';
  import { defaultUnitForAnalyte, nextUnitAfterAnalyteChange } from '$lib/data/labs/preferred-units';
  import { platformImageSource, tesseractOcrRecognizer } from '$lib/data/labs/ocr-adapters';
  import {
    parseLabNumeric,
    type OcrReviewRow
  } from '$lib/data/labs/ocr';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { LabResult } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  let analyte = $state('estradiol');

  /* Two lists, two questions: the picker offers analytes with results behind
     them, because a trend needs data, while the editor offers those plus the
     presets. Both are queries now; neither is mirrored, since a lab result is
     entry-shaped data (ADR-0004). */
  let usedQuery = liveQuery(['lab'], (j) => j.labs.getUsedAnalytes());
  let analytes = $derived(usedQuery.value ?? []);
  let offeredQuery = liveQuery(['lab'], (j) => j.labs.getAnalytes());
  $effect(() => {
    if (analytes.length && !analytes.includes(analyte)) analyte = analytes[0];
  });

  /* The list is every result this analyte has, in order. The charts are those
     same results split by unit (ticket 02): a value in ng/dL and one in
     nmol/L differ by a factor of about 29, so a single line over both would
     draw a cliff where nothing happened.

     Two reads rather than one regrouped here, because they are two questions:
     the list's order is the query's, down to how two results on one day
     settle, and reconstructing that from the series would be re-implementing
     it. */
  let resultsQuery = liveQuery(['lab'], (j) => j.labs.getResults(analyte));
  let results = $derived(resultsQuery.value ?? []);
  let seriesQuery = liveQuery(['lab'], (j) => j.labs.getSeries(analyte));
  let series = $derived(seriesQuery.value ?? []);

  function chartFor(s: LabSeries) {
    if (s.results.length < 2) return null;
    const values = s.results.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || 10;
    return { points: s.results.map((r) => ({ day: r.epochDay, value: r.value })), min: min - pad, max: max + pad };
  }

  /* Which point is picked out on which chart, keyed by the series unit, so
     each line keeps its own selection instead of the charts fighting over one
     index they number differently. */
  let picked = $state<Record<string, number>>({});

  function pickPoint(unit: string, index: number) {
    picked = picked[unit] === index ? { ...picked, [unit]: -1 } : { ...picked, [unit]: index };
  }

  /** What a point's readout says: the value, when it was drawn, and the
      context it was drawn in. The same three facts the list rows carry. */
  const pointAria = (r: LabResult) =>
    m.labs_point_aria({
      value: String(r.value),
      unit: r.unit || m.labs_no_unit(),
      date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
    });

  /** The context beside a value, wherever it appears: the timing figure and
      the lab, whichever of the two is known. Blank when neither is. */
  const contextLine = (r: LabResult) =>
    [r.timing ? labTimingLabel(r.timing) : '', r.provider.trim()].filter(Boolean).join(' · ');

  let editor = $state<{
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
  } | null>(null);
  let deleteTarget = $state<LabResult | null>(null);

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

  const ocrMachineBase = createOcrMachine(
    platformImageSource(),
    tesseractOcrRecognizer(),
    ocrSaver
  );
  // Wrap in $state so Svelte tracks reads on .state
  let ocr = $state(ocrMachineBase);

  // After save succeeds, show a toast and return to idle.
  $effect(() => {
    if (ocr.state.tag === 'saved') {
      toast(m.labs_ocr_saved_toast({ count: String(ocr.state.count) }));
      ocr.close();
    }
  });

  // Derive error message string for the review sheet's notice.
  let ocrValidationError = $derived(
    ocr.state.tag === 'save-validation-failed'
      ? ocr.state.error === 'missing-analyte'
        ? m.labs_ocr_missing_analyte()
        : ocr.state.error === 'invalid-value'
          ? m.labs_ocr_invalid_value()
          : ocr.state.error === 'missing-date'
            ? m.labs_ocr_missing_date()
            : m.labs_ocr_invalid_date()
      : ocr.state.tag === 'save-failed'
        ? m.labs_ocr_failed()
        : ''
  );

  // The review rows, available from review, save-validation-failed, and save-failed states.
  let ocrRows = $derived<OcrReviewRow[]>(
    ocr.state.tag === 'review' ||
    ocr.state.tag === 'save-validation-failed' ||
    ocr.state.tag === 'save-failed'
      ? ocr.state.rows
      : []
  );

  // Whether the OCR sheet should be open (any non-idle state).
  let ocrSheetOpen = $derived(ocr.state.tag !== 'idle' && ocr.state.tag !== 'saved');

  // Title for the sheet header.
  let ocrSheetTitle = $derived(
    ocr.state.tag === 'review' || ocr.state.tag === 'save-validation-failed' || ocr.state.tag === 'saving' || ocr.state.tag === 'save-failed'
      ? m.labs_ocr_review_sheet()
      : ocr.state.tag === 'no-rows'
        ? m.labs_ocr_empty_sheet()
        : m.labs_ocr_pick_sheet()
  );

  function openOcrImport() {
    ocr.open();
  }

  function closeOcrSheet() {
    ocr.close();
  }

  function handleOcrRowsChange(rows: OcrReviewRow[]) {
    ocr.updateRows(rows);
  }

  function openEditor(result: LabResult | null) {
    editor = result
      ? {
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
        }
      : {
          date: dateInputValueFromEpochDay(todayEpochDay()),
          time: '',
          analyte: 'estradiol',
          customAnalyte: '',
          value: '',
          unit: defaultUnitForAnalyte('estradiol', prefs.preferredLabUnits),
          note: '',
          provider: '',
          timing: null
        };
  }

  function setPreferredUnit(analyteName: PreferredUnitAnalyte, unit: string) {
    const next = { ...prefs.preferredLabUnits };
    if (unit) next[analyteName] = unit;
    else delete next[analyteName];
    prefs.preferredLabUnits = next;
  }

  function changeEditorAnalyte(next: string) {
    if (!editor) return;
    const previousAnalyte = editor.analyte === 'custom' ? editor.customAnalyte : editor.analyte;
    const nextAnalyte = next === 'custom' ? '' : next;
    editor.unit = nextUnitAfterAnalyteChange({
      previousAnalyte,
      nextAnalyte,
      currentUnit: editor.unit,
      preferredUnits: prefs.preferredLabUnits
    });
    editor.analyte = next;
  }

  async function saveResult() {
    if (!editor) return;
    const draft = { ...editor };
    const value = parseFloat(draft.value);
    const resultAnalyte = draft.analyte === 'custom' ? draft.customAnalyte.trim() : draft.analyte;
    if (isNaN(value) || !resultAnalyte) return;

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
      epochDay: epochDayFromDateInputValue(draft.date) ?? todayEpochDay(),
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
    editor = null;

    /* Stated, not warned about: a new unit is a normal thing for a lab to
       report, and all that follows from it is a second line. */
    if (otherUnits.size && !otherUnits.has(unit)) {
      toast(unit ? m.labs_new_unit_toast({ unit, analyte: resultAnalyte }) : m.labs_no_unit_toast());
    }
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = results.find((result) => result.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteResult() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.labs.deleteResult(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.lab_results()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-import-lab aria-label={m.labs_ocr_import_aria()} onclick={openOcrImport}>
        <Icon name="camera" size={20} />
      </button>
      <button class="icon-btn" data-add aria-label={m.labs_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  <div class="card" style="margin-bottom:var(--space-4)">
    <h3>{m.labs_preferred_units_title()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.labs_preferred_units_intro()}</p>
    <div class="stack-3">
      {#each PREFERRED_UNIT_ANALYTES as analyteName (analyteName)}
        <div class="field">
          <label class="field-label" for={`preferred-unit-${analyteName}`}>{analyteName}</label>
          <select
            class="input"
            id={`preferred-unit-${analyteName}`}
            value={preferredUnitForAnalyte(analyteName, prefs.preferredLabUnits) ?? ''}
            onchange={(e) => setPreferredUnit(analyteName, (e.target as HTMLSelectElement).value)}
          >
            <option value="">{m.labs_preferred_units_source_default()}</option>
            {#each ALLOWED_PREFERRED_UNITS[analyteName] as unit (unit)}
              <option value={unit}>{unit}</option>
            {/each}
          </select>
        </div>
      {/each}
    </div>
  </div>

  {#if usedQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if analytes.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.labs_intro()}</p>
    <Segmented name={m.labs_analyte_group()} options={analytes.map((a) => ({ value: a, label: a }))} value={analyte} onChange={(v) => (analyte = v)} />

    {#each series as s (s.unit)}
      {@const chart = chartFor(s)}
      {@const mixed = comparabilityLabels(seriesComparability(s.results))}
      {@const point = s.results[picked[s.unit] ?? -1]}
      <div class="card" data-lab-series={s.unit} style="margin-top:var(--space-4)">
        <div class="spread" style="margin-bottom:var(--space-2)">
          <span class="chart-title">{analyte}</span>
          <span class="muted small series-unit">{s.unit || m.labs_no_unit()}</span>
        </div>
        {#if chart}
          <LineChart
            points={chart.points}
            min={chart.min}
            max={chart.max}
            showDots
            selected={picked[s.unit] ?? null}
            onSelect={(i) => pickPoint(s.unit, i)}
            pointLabel={(i) => pointAria(s.results[i])}
          />
          <!-- The chart's tooltip. A panel under the line rather than a
               floating bubble: on a 390px screen a bubble over the point
               covers the neighbours you are comparing it against, and it has
               nowhere to go at either edge. -->
          {#if point}
            <div class="lab-point" data-lab-point={point.id}>
              <div class="spread">
                <span class="row-title">{point.value} <span class="muted small">{point.unit}</span></span>
                <button class="icon-btn" aria-label={m.labs_point_clear()} onclick={() => pickPoint(s.unit, picked[s.unit])}>
                  <Icon name="x" size={18} />
                </button>
              </div>
              <span class="muted small">{fmtDay(point.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {#if contextLine(point)}
                <span class="muted small lab-context">{contextLine(point)}</span>
              {/if}
            </div>
          {/if}
        {:else}
          <div class="chart-too-little">{m.labs_too_little()}</div>
        {/if}
        <!-- Stated, not warned about: the series is drawn whole, and this
             says what it is made of (ticket 03). -->
        {#if mixed.length}
          <div class="notice notice-info" data-lab-mixed={s.unit} style="margin-top:var(--space-3)">
            <Icon name="info" size={20} />
            <div class="notice-body">
              <span class="notice-title">{m.labs_mixed_title()}</span>
              {m.labs_mixed_body()}
              <ul class="lab-mixed-list">
                {#each mixed as reason (reason)}<li>{reason}</li>{/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each [...results].reverse() as r (r.id)}
        <button class="list-row" data-lab-result={r.id} aria-label={m.labs_result_aria({ analyte: r.analyte, date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })} onclick={() => openEditor(r)}>
          <span class="row-text">
            <span class="row-title">{r.value} <span class="muted small">{r.unit}</span></span>
            <span class="row-subtitle">
              {fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{r.note ? ' · ' + r.note : ''}
            </span>
            <!-- The context on its own line, not appended to the date: it is
                 two more facts about the draw, and three of them run together
                 stop being readable at 390px. -->
            {#if contextLine(r)}
              <span class="row-subtitle lab-context">{contextLine(r)}</span>
            {/if}
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState
      title={m.labs_empty_title()}
      text={m.labs_empty_body()}
    >
      {#snippet action()}
        <div class="stack-3">
          <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.labs_empty_action()}</span></button>
          <button class="btn btn-soft" onclick={openOcrImport}><span>{m.labs_ocr_import_aria()}</span></button>
        </div>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.labs_edit_sheet() : m.labs_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.labs_edit_sheet() : m.labs_new_sheet()}</h3>
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="lab-date">{m.labs_date_label()}</label>
          <input class="input" type="date" id="lab-date" name="lab-date" bind:value={editor.date} />
        </div>
        <!-- Optional, and the hours figure depends on it: a lab slip often
             carries no time, and day-of-interval does not need one. -->
        <div class="field">
          <label class="field-label" for="lab-time">{m.labs_time_label()}</label>
          <input class="input" type="time" id="lab-time" name="lab-time" bind:value={editor.time} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="lab-analyte">{m.labs_analyte_label()}</label>
        <select class="input" id="lab-analyte" value={editor.analyte} onchange={(e) => changeEditorAnalyte((e.target as HTMLSelectElement).value)}>
          {#each offeredQuery.value ?? [] as a (a)}
            <option value={a}>{a}</option>
          {/each}
          <option value="custom">{m.labs_analyte_custom()}</option>
        </select>
      </div>
      {#if editor.analyte === 'custom'}
        <div class="field">
          <label class="field-label" for="lab-custom-analyte">{m.labs_custom_label()}</label>
          <input class="input" id="lab-custom-analyte" name="lab-custom-analyte" placeholder={m.labs_custom_placeholder()} bind:value={editor.customAnalyte} />
        </div>
      {/if}
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="lab-value">{m.labs_value_label()}</label>
          <input class="input" type="number" id="lab-value" name="lab-value" placeholder={m.labs_value_placeholder()} inputmode="decimal" bind:value={editor.value} />
        </div>
        <div class="field">
          <label class="field-label" for="lab-unit">{m.labs_unit_label()}</label>
          <input class="input" id="lab-unit" name="lab-unit" placeholder={m.labs_unit_placeholder()} bind:value={editor.unit} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="lab-provider">{m.labs_provider_label()}</label>
        <input class="input" id="lab-provider" name="lab-provider" placeholder={m.labs_provider_placeholder()} bind:value={editor.provider} />
      </div>
      <div class="field">
        <label class="field-label" for="lab-note">{m.labs_note_label()}</label>
        <input class="input" id="lab-note" name="lab-note" placeholder={m.labs_note_placeholder()} bind:value={editor.note} />
      </div>

      <!-- The detail view's copy of the context. Read-only, because it was
           recorded when the result was saved and is not recomputed
           afterwards (ticket 03, box 6). A saved result with no hours figure
           says what would give it one, rather than staying blank. -->
      {#if editor.id}
        <div class="card editor-section" data-lab-context>
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

      <div class="stack-3">
        <button class="btn btn-primary" data-save-lab onclick={saveResult}><span>{m.labs_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-lab onclick={askToDelete}><span>{m.labs_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.labs_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.labs_delete_q({ analyte: deleteTarget.analyte })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.labs_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-lab onclick={deleteResult}><span>{m.labs_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet
    open={ocrSheetOpen}
    title={ocrSheetTitle}
    onClose={closeOcrSheet}
  >
    {#if ocr.state.tag === 'picking'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.labs_ocr_pick_intro()}</p>
      <div class="stack-3">
        <button class="btn btn-soft" onclick={() => ocr.pickSource('gallery')}>
          <span>{m.labs_ocr_pick_gallery()}</span>
        </button>
        <button class="btn btn-soft" onclick={() => ocr.pickSource('camera')}>
          <span>{m.labs_ocr_pick_camera()}</span>
        </button>
      </div>
    {:else if ocr.state.tag === 'recognizing'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <p class="muted small">{m.labs_ocr_running()}</p>
    {:else if ocr.state.tag === 'permission-denied'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <div class="notice notice-danger" role="alert" style="margin-bottom:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">{m.labs_ocr_permission_denied()}</div>
      </div>
      <button class="btn btn-soft" onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
    {:else if ocr.state.tag === 'recognition-failed'}
      <h3>{m.labs_ocr_pick_sheet()}</h3>
      <div class="notice notice-danger" role="alert" style="margin-bottom:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">{m.labs_ocr_failed()}</div>
      </div>
      <button class="btn btn-soft" onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
    {:else if ocr.state.tag === 'no-rows'}
      <h3>{m.labs_ocr_empty_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.labs_ocr_no_rows_body()}</p>
      <div class="stack-3">
        <button class="btn btn-primary" onclick={() => { ocr.close(); openEditor(null); }}><span>{m.labs_ocr_no_rows_manual()}</span></button>
        <button class="btn btn-soft" onclick={() => ocr.retry()}><span>{m.labs_ocr_retry()}</span></button>
      </div>
    {:else if ocr.state.tag === 'review' || ocr.state.tag === 'save-validation-failed' || ocr.state.tag === 'saving' || ocr.state.tag === 'save-failed'}
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
          <div class="card editor-section">
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
            <div class="field">
              <label class="field-label" for={`ocr-analyte-${i}`}>{m.labs_analyte_label()}</label>
              <input class="input" id={`ocr-analyte-${i}`} value={row.analyte} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, analyte: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
            </div>
            <div class="cd-endpoints">
              <div class="field">
                <label class="field-label" for={`ocr-value-${i}`}>{m.labs_value_label()}</label>
                <input class="input" id={`ocr-value-${i}`} inputmode="decimal" value={row.value} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, value: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
              </div>
              <div class="field">
                <label class="field-label" for={`ocr-unit-${i}`}>{m.labs_unit_label()}</label>
                <input class="input" id={`ocr-unit-${i}`} value={row.unit} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, unit: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
              </div>
            </div>
            <div class="field">
              <label class="field-label" for={`ocr-date-${i}`}>{m.labs_date_label()}</label>
              <input class="input" type="date" id={`ocr-date-${i}`} value={row.date} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, date: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
            </div>
            <div class="field">
              <label class="field-label" for={`ocr-note-${i}`}>{m.labs_note_label()}</label>
              <input class="input" id={`ocr-note-${i}`} value={row.note} oninput={(e) => { const updated = ocrRows.map((r, j) => j === i ? { ...r, note: (e.target as HTMLInputElement).value } : r); handleOcrRowsChange(updated); }} />
            </div>
          </div>
        {/each}
      </div>
      <button class="btn btn-primary" style="margin-top:var(--space-3)" disabled={ocr.state.tag === 'saving'} onclick={() => ocr.save()}><span>{m.labs_ocr_save()}</span></button>
    {/if}
  </Sheet>
</div>
