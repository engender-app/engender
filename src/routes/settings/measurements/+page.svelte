<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { MEASUREMENT_TYPES, type MeasurementSeries } from '$lib/data/journal/measurements';
  import { measurementTypeName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Measurement } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const PROTOCOL: Record<Measurement['type'], () => string> = {
    waist: m.measurement_protocol_waist,
    hips: m.measurement_protocol_hips,
    chest: m.measurement_protocol_chest,
    underbust: m.measurement_protocol_underbust
  };

  let type = $state<Measurement['type']>('waist');
  const typeOptions = MEASUREMENT_TYPES.map((t) => ({ value: t, label: measurementTypeName(t) }));

  let measurementsQuery = liveQuery(['measurement'], (j) => j.measurements.getMeasurements(type));
  let measurements = $derived(measurementsQuery.value ?? []);
  let seriesQuery = liveQuery(['measurement'], (j) => j.measurements.getSeries(type));
  let series = $derived(seriesQuery.value ?? []);

  function chartFor(s: MeasurementSeries) {
    if (s.measurements.length < 2) return null;
    const values = s.measurements.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || 1;
    return { points: s.measurements.map((r) => ({ day: r.epochDay, value: r.value })), min: min - pad, max: max + pad };
  }

  /** The unit this type was last logged in, so a new entry defaults to
      whatever the person has been using rather than forcing 'cm' back on
      them. `measurements` is already scoped to the selected type and
      ordered oldest first (ADR-0012: never converted, so this is a
      default, not a rule). */
  function lastUnit(): string {
    return measurements.at(-1)?.unit ?? 'cm';
  }

  let editor = $state<{ id?: string; date: string; type: Measurement['type']; value: string; unit: string; note: string } | null>(
    null
  );
  let deleteTarget = $state<Measurement | null>(null);

  function openEditor(measurement: Measurement | null) {
    editor = measurement
      ? {
          id: measurement.id,
          date: dateInputValueFromEpochDay(measurement.epochDay),
          type: measurement.type,
          value: String(measurement.value),
          unit: measurement.unit,
          note: measurement.note
        }
      : {
          date: dateInputValueFromEpochDay(todayEpochDay()),
          type,
          value: '',
          unit: lastUnit(),
          note: ''
        };
  }

  async function saveMeasurement() {
    if (!editor) return;
    const value = parseFloat(editor.value);
    if (isNaN(value)) return;

    await journal.measurements.upsertMeasurement({
      id: editor.id,
      epochDay: epochDayFromDateInputValue(editor.date) ?? todayEpochDay(),
      type: editor.type,
      value,
      unit: editor.unit,
      note: editor.note
    });
    type = editor.type;
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = measurements.find((r) => r.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteMeasurement() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.measurements.deleteMeasurement(id);
  }

  function dismissProtocol(t: Measurement['type']) {
    prefs.measurementProtocolDismissed = { ...prefs.measurementProtocolDismissed, [t]: true };
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.body_measurements()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.measurement_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  <p class="muted small" style="margin-bottom:var(--space-3)">{m.measurements_intro()}</p>
  <Segmented name={m.measurement_type_label()} options={typeOptions} value={type} onChange={(v) => (type = v as Measurement['type'])} />

  {#if !prefs.measurementProtocolDismissed[type]}
    <div class="card" data-protocol={type} style="margin-top:var(--space-4)">
      <div class="spread">
        <h3>{m.measurement_protocol_title()}</h3>
        <button class="icon-btn" aria-label={m.measurement_protocol_dismiss_aria()} onclick={() => dismissProtocol(type)}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <p class="muted small">{PROTOCOL[type]()}</p>
    </div>
  {/if}

  {#if measurementsQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if measurements.length}
    {#each series as s (s.unit)}
      {@const chart = chartFor(s)}
      <div class="card" data-measurement-series={s.unit} style="margin-top:var(--space-4)">
        <div class="spread" style="margin-bottom:var(--space-2)">
          <span class="chart-title">{measurementTypeName(type)}</span>
          <span class="muted small series-unit">{s.unit}</span>
        </div>
        {#if chart}
          <LineChart points={chart.points} min={chart.min} max={chart.max} showDots />
        {:else}
          <div class="chart-too-little">{m.measurement_too_little()}</div>
        {/if}
      </div>
    {/each}

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each [...measurements].reverse() as r (r.id)}
        <button
          class="list-row"
          data-measurement={r.id}
          aria-label={m.measurement_row_aria({ type: measurementTypeName(r.type), date: fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          onclick={() => openEditor(r)}
        >
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
    <EmptyState title={m.measurement_empty_title()} text={m.measurement_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.measurement_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.measurement_edit_sheet() : m.measurement_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.measurement_edit_sheet() : m.measurement_new_sheet()}</h3>
      <div class="field">
        <span class="field-label">{m.measurement_type_label()}</span>
        <Segmented name={m.measurement_type_label()} options={typeOptions} value={editor.type} onChange={(v) => (editor!.type = v as Measurement['type'])} />
      </div>
      <div class="field">
        <label class="field-label" for="measurement-date">{m.measurement_date_label()}</label>
        <input class="input" type="date" id="measurement-date" name="measurement-date" bind:value={editor.date} />
      </div>
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="measurement-value">{m.measurement_value_label()}</label>
          <input class="input" type="number" id="measurement-value" name="measurement-value" placeholder={m.measurement_value_placeholder()} inputmode="decimal" bind:value={editor.value} />
        </div>
        <div class="field">
          <span class="field-label">{m.measurement_unit_label()}</span>
          <Segmented
            name={m.measurement_unit_label()}
            options={[
              { value: 'cm', label: m.measurement_unit_cm() },
              { value: 'in', label: m.measurement_unit_in() }
            ]}
            value={editor.unit}
            onChange={(v) => (editor!.unit = v)}
          />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="measurement-note">{m.measurement_note_label()}</label>
        <input class="input" id="measurement-note" name="measurement-note" placeholder={m.measurement_note_placeholder()} bind:value={editor.note} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-measurement onclick={saveMeasurement}><span>{m.measurement_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-measurement onclick={askToDelete}><span>{m.measurement_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.measurement_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.measurement_delete_q({ type: measurementTypeName(deleteTarget.type) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.measurement_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-measurement onclick={deleteMeasurement}><span>{m.measurement_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
