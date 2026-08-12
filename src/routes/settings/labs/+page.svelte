<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { normalizeUnit } from '$lib/data/journal/labs';
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
     draw a cliff where nothing happened. */
  let resultsQuery = liveQuery(['lab'], (j) => j.labs.getResults(analyte));
  let results = $derived(resultsQuery.value ?? []);
  let seriesQuery = liveQuery(['lab'], (j) => j.labs.getSeries(analyte));
  let series = $derived(seriesQuery.value ?? []);

  function chartFor(seriesResults: LabResult[]) {
    if (seriesResults.length < 2) return null;
    const values = seriesResults.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || 10;
    return { points: seriesResults.map((r) => ({ day: r.epochDay, value: r.value })), min: min - pad, max: max + pad };
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
      toast(
        unit
          ? `${unit} is new for ${resultAnalyte}, so it gets its own trend.`
          : `This result has no unit, so it gets its own trend.`
      );
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
      <button class="icon-btn" data-add aria-label="Add result" onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if usedQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if analytes.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">
      Your numbers, your trend. The app never interprets them and gives no medical advice.
    </p>
    <Segmented name="Analyte" options={analytes.map((a) => ({ value: a, label: a }))} value={analyte} onChange={(v) => (analyte = v)} />

    {#each series as s (s.unit)}
      {@const chart = chartFor(s.results)}
      <div class="card" data-lab-series={s.unit} style="margin-top:var(--space-4)">
        <div class="spread" style="margin-bottom:var(--space-2)">
          <span class="chart-title">{analyte}</span>
          <span class="muted small series-unit">{s.unit || 'no unit'}</span>
        </div>
        {#if chart}
          <LineChart points={chart.points} min={chart.min} max={chart.max} showDots />
        {:else}
          <div class="chart-too-little">Two results make a trend — add another when it comes in.</div>
        {/if}
      </div>
    {/each}

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each [...results].reverse() as r (r.id)}
        <button class="list-row" data-lab-result={r.id} aria-label="Edit {r.analyte} result from {fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}" onclick={() => openEditor(r)}>
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
      riveLabel="Empty labs: a friendly test tube"
      title="No results yet"
      text="Add bloodwork as it comes in and watch your own trend over time. No ranges, no grades — just your numbers."
    >
      {#snippet action()}
        <button class="btn btn-primary" onclick={() => openEditor(null)}><span>Add a result</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? 'Edit result' : 'New result'} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? 'Edit result' : 'New result'}</h3>
      <div class="field">
        <label class="field-label" for="lab-date">Date</label>
        <input class="input" type="date" id="lab-date" name="lab-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <label class="field-label" for="lab-analyte">Analyte</label>
        <select class="input" id="lab-analyte" bind:value={editor.analyte}>
          {#each offeredQuery.value ?? [] as a (a)}
            <option value={a}>{a}</option>
          {/each}
          <option value="custom">custom…</option>
        </select>
      </div>
      {#if editor.analyte === 'custom'}
        <div class="field">
          <label class="field-label" for="lab-custom-analyte">Custom analyte</label>
          <input class="input" id="lab-custom-analyte" name="lab-custom-analyte" placeholder="e.g. SHBG" bind:value={editor.customAnalyte} />
        </div>
      {/if}
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="lab-value">Value</label>
          <input class="input" type="number" id="lab-value" name="lab-value" placeholder="e.g. 165" inputmode="decimal" bind:value={editor.value} />
        </div>
        <div class="field">
          <label class="field-label" for="lab-unit">Unit</label>
          <input class="input" id="lab-unit" name="lab-unit" placeholder="e.g. pg/mL" bind:value={editor.unit} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="lab-note">Note (optional)</label>
        <input class="input" id="lab-note" name="lab-note" placeholder="e.g. new dose" bind:value={editor.note} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-lab onclick={saveResult}><span>Save result</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-lab onclick={askToDelete}><span>Delete result</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title="Delete result" onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>Delete this {deleteTarget.analyte} result?</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">This cannot be undone.</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-lab onclick={deleteResult}><span>Delete result</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
