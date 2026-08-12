<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { normalizeUnit, type LabSeries } from '$lib/data/journal/labs';
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

  let editor = $state<{
    id?: string;
    date: string;
    analyte: string;
    customAnalyte: string;
    value: string;
    unit: string;
    note: string;
  } | null>(null);
  let deleteTarget = $state<LabResult | null>(null);

  function openEditor(result: LabResult | null) {
    editor = result
      ? {
          id: result.id,
          date: dateInputValueFromEpochDay(result.epochDay),
          analyte: result.analyte,
          customAnalyte: '',
          value: String(result.value),
          unit: result.unit,
          note: result.note
        }
      : {
          date: dateInputValueFromEpochDay(todayEpochDay()),
          analyte: 'estradiol',
          customAnalyte: '',
          value: '',
          unit: '',
          note: ''
        };
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
      note: draft.note
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
      <button class="icon-btn" data-add aria-label={m.labs_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if usedQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if analytes.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.labs_intro()}</p>
    <Segmented name={m.labs_analyte_group()} options={analytes.map((a) => ({ value: a, label: a }))} value={analyte} onChange={(v) => (analyte = v)} />

    {#each series as s (s.unit)}
      {@const chart = chartFor(s)}
      <div class="card" data-lab-series={s.unit} style="margin-top:var(--space-4)">
        <div class="spread" style="margin-bottom:var(--space-2)">
          <span class="chart-title">{analyte}</span>
          <span class="muted small series-unit">{s.unit || m.labs_no_unit()}</span>
        </div>
        {#if chart}
          <LineChart points={chart.points} min={chart.min} max={chart.max} showDots />
        {:else}
          <div class="chart-too-little">{m.labs_too_little()}</div>
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
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState
      riveLabel={m.rive_empty_labs()}
      title={m.labs_empty_title()}
      text={m.labs_empty_body()}
    >
      {#snippet action()}
        <button class="btn btn-primary" onclick={() => openEditor(null)}><span>{m.labs_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.labs_edit_sheet() : m.labs_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.labs_edit_sheet() : m.labs_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="lab-date">{m.labs_date_label()}</label>
        <input class="input" type="date" id="lab-date" name="lab-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <label class="field-label" for="lab-analyte">{m.labs_analyte_label()}</label>
        <select class="input" id="lab-analyte" bind:value={editor.analyte}>
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
        <label class="field-label" for="lab-note">{m.labs_note_label()}</label>
        <input class="input" id="lab-note" name="lab-note" placeholder={m.labs_note_placeholder()} bind:value={editor.note} />
      </div>
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
</div>
