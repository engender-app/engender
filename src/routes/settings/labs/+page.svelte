<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { labAnalytes, resultsFor, upsertLabResult } from '$lib/data/repositories/labs';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let analyte = $state('estradiol');
  let analytes = $derived(labAnalytes());
  $effect(() => {
    if (analytes.length && !analytes.includes(analyte)) analyte = analytes[0];
  });

  let results = $derived(resultsFor(analyte));
  let chart = $derived.by(() => {
    if (results.length < 2) return null;
    const values = results.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || 10;
    return { points: results.map((r) => ({ day: r.epochDay, value: r.value })), min: min - pad, max: max + pad };
  });

  let editorOpen = $state(false);
  let draft = $state({ date: dateInputValueFromEpochDay(todayEpochDay()), analyte: 'estradiol', value: '', unit: '', note: '' });

  function saveResult() {
    const val = parseFloat(draft.value);
    editorOpen = false;
    if (isNaN(val)) return;
    upsertLabResult({
      epochDay: epochDayFromDateInputValue(draft.date) ?? todayEpochDay(),
      analyte: draft.analyte === 'custom' ? 'other' : draft.analyte,
      value: val,
      unit: draft.unit || '—',
      note: draft.note,
    });
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.lab_results()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label="Add result" onclick={() => (editorOpen = true)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if db.labResults.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">
      Your numbers, your trend. The app never interprets them and gives no medical advice.
    </p>
    <Segmented name="Analyte" options={analytes.map((a) => ({ value: a, label: a }))} value={analyte} onChange={(v) => (analyte = v)} />

    <div class="card" style="margin-top:var(--space-4)">
      <div class="spread" style="margin-bottom:var(--space-2)">
        <span class="chart-title">{analyte}</span>
        <span class="muted small">{results[0]?.unit ?? ''}</span>
      </div>
      {#if chart}
        <LineChart points={chart.points} min={chart.min} max={chart.max} showDots />
      {:else}
        <div class="chart-too-little">Two results make a trend — add another when it comes in.</div>
      {/if}
    </div>

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each [...results].reverse() as r (r.id)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{r.value} <span class="muted small">{r.unit}</span></span>
            <span class="row-subtitle">
              {fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{r.note ? ' · ' + r.note : ''}
            </span>
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState
      riveLabel="Empty labs: a friendly test tube"
      title="No results yet"
      text="Add bloodwork as it comes in and watch your own trend over time. No ranges, no grades — just your numbers."
    >
      {#snippet action()}
        <button class="btn btn-primary" onclick={() => (editorOpen = true)}><span>Add a result</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet bind:open={editorOpen} title="New result">
    <h3>New result</h3>
    <div class="field">
      <label class="field-label" for="lab-date">Date</label>
      <input class="input" type="date" id="lab-date" name="lab-date" bind:value={draft.date} />
    </div>
    <div class="field">
      <label class="field-label" for="lab-analyte">Analyte</label>
      <select class="input" id="lab-analyte" bind:value={draft.analyte}>
        <option value="estradiol">estradiol</option>
        <option value="testosterone">testosterone</option>
        <option value="prolactin">prolactin</option>
        <option value="custom">custom…</option>
      </select>
    </div>
    <div class="cd-endpoints">
      <div class="field">
        <label class="field-label" for="lab-value">Value</label>
        <input class="input" type="number" id="lab-value" name="lab-value" placeholder="e.g. 165" inputmode="decimal" bind:value={draft.value} />
      </div>
      <div class="field">
        <label class="field-label" for="lab-unit">Unit</label>
        <input class="input" id="lab-unit" name="lab-unit" placeholder="e.g. pg/mL" bind:value={draft.unit} />
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="lab-note">Note (optional)</label>
      <input class="input" id="lab-note" name="lab-note" placeholder="e.g. new dose" bind:value={draft.note} />
    </div>
    <button class="btn btn-primary" data-save-lab onclick={saveResult}><span>Save result</span></button>
  </Sheet>
</div>
