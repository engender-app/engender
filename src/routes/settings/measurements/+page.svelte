<script lang="ts">
  /* Waist, hips, chest and underbust over time, on the surface and chart
     kits (phase 5 UX ticket 25).

     The chart is the kit's area chart now rather than this screen's own
     LineChart, which is what the ticket asks of the four charted feature
     screens. What that buys beyond a consistent drawing is the scrub: a
     reading was a dot you could see and not name, and an exact number now
     comes from dragging across the plot. The unit rides on the formatter,
     so the gutter at the ends of the scale says "82 cm" and nothing on the
     card has to repeat it.

     A series still exists per unit, because a measurement is never
     converted (ADR-0012) and 82 cm and 32 in on one axis is a lie. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import type { MeasurementSeries } from '$lib/data/journal/measurements';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Measurement } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Colour that carries a value takes role 0 (DIRECTION.md): roles run a
     flag's colours before its shades, so index 0 is the only one
     guaranteed chromatic on all 8 palettes and a chart drawn in an
     achromatic band is a chart of disabled marks. The list takes the
     stripe after it, where a tinted disc carries no reading. */
  const SECTION_ROLE = { chart: 0, list: 1 };

  /** No card for a custom type - it never had built-in guidance to give
      (CONTEXT: "Custom"). */
  const PROTOCOL: Partial<Record<string, () => string>> = {
    waist: m.measurement_protocol_waist,
    hips: m.measurement_protocol_hips,
    chest: m.measurement_protocol_chest,
    underbust: m.measurement_protocol_underbust
  };

  // Falls back off 'waist' when it has been hidden - the picker below only
  // ever offers a visible type, and defaulting to a hidden one would open
  // on a selection Segmented has no button for.
  let type = $state<string>(vocabulary.visibleMeasurementTypes[0]?.key ?? 'waist');
  let typeOptions = $derived(vocabulary.visibleMeasurementTypes.map((t) => ({ value: t.key, label: t.name })));

  let measurementsQuery = liveQuery(['measurement'], (j) => j.measurements.getMeasurements(type));
  let measurements = $derived(measurementsQuery.value ?? []);
  let seriesQuery = liveQuery(['measurement'], (j) => j.measurements.getSeries(type));
  let series = $derived(seriesQuery.value ?? []);

  /* The scale is padded off the readings rather than starting at zero: a
     waist measured in centimetres moves within a few percent of itself,
     and a zero-based axis draws that as a flat line. Not axis furniture -
     there is none - only what the top and the bottom of the plot mean. */
  function chartFor(s: MeasurementSeries) {
    if (s.measurements.length < 2) return null;
    const values = s.measurements.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.2 || 1;
    return {
      points: s.measurements.map((r) => ({ x: r.epochDay, y: r.value })),
      min: min - pad,
      max: max + pad,
      from: s.measurements[0].epochDay,
      to: s.measurements[s.measurements.length - 1].epochDay
    };
  }

  /** The unit this type was last logged in, so a new entry defaults to
      whatever the person has been using rather than forcing 'cm' back on
      them. `measurements` is already scoped to the selected type and
      ordered oldest first (ADR-0012: never converted, so this is a
      default, not a rule). */
  function lastUnit(): string {
    return measurements.at(-1)?.unit ?? 'cm';
  }

  let editor = $state<{ id?: string; date: string; type: string; value: string; unit: string } | null>(null);
  let deleteTarget = $state<Measurement | null>(null);
  let manageOpen = $state(false);
  let newTypeName = $state('');

  function openEditor(measurement: Measurement | null) {
    editor = measurement
      ? {
          id: measurement.id,
          date: dateInputValueFromEpochDay(measurement.epochDay),
          type: measurement.type,
          value: String(measurement.value),
          unit: measurement.unit
        }
      : {
          date: dateInputValueFromEpochDay(todayEpochDay()),
          type,
          value: '',
          unit: lastUnit()
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
      unit: editor.unit
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

  /** Hiding never deletes (CONTEXT: "Hidden") - it only takes the type out
      of the picker above. If that was the type on screen, fall back to
      another still-visible one rather than leaving the picker on a type
      it no longer offers. `vocabulary.measurementTypes` is read before the
      write's own mirror refresh lands, so `key` is excluded explicitly
      rather than trusted to already read hidden. */
  async function setTypeHidden(key: string, hidden: boolean) {
    await journal.measurements.setMeasurementTypeHidden(key, hidden);
    if (hidden && type === key) {
      const fallback = vocabulary.measurementTypes.find((t) => t.key !== key && !t.hidden);
      if (fallback) type = fallback.key;
    }
  }

  async function addType() {
    const name = newTypeName.trim();
    if (!name) return;
    const created = await journal.measurements.addCustomMeasurementType(name);
    newTypeName = '';
    manageOpen = false;
    type = created.key;
  }

  function dismissProtocol(t: string) {
    prefs.measurementProtocolDismissed = { ...prefs.measurementProtocolDismissed, [t]: true };
  }
</script>

<div class="screen">
  <ScreenHeader title={m.body_measurements()} back="/more" subtitle={m.measurements_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-manage-types aria-label={m.measurement_manage_types_aria()} onclick={() => (manageOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
      <button class="icon-btn press" data-add aria-label={m.measurement_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  <Segmented name={m.measurement_type_label()} options={typeOptions} value={type} onChange={(v) => (type = v)} />

  {#if !prefs.measurementProtocolDismissed[type] && PROTOCOL[type]}
    <div style="margin-top:var(--space-4)">
      <Notice
        icon="ruler"
        key="protocol"
        data-protocol={type}
        role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
        title={m.measurement_protocol_title()}
        text={PROTOCOL[type]!()}
        dismiss={{ label: m.measurement_protocol_dismiss_aria(), onclick: () => dismissProtocol(type) }}
      />
    </div>
  {/if}

  {#if measurementsQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if measurements.length}
    <div>
      {#each series as s (s.unit)}
        {@const chart = chartFor(s)}
        <ChartCard
          heading={vocabulary.measurementTypeName(type)}
          kind="measurements-{s.unit}"
          role={roleAt(activeFlag.roles, SECTION_ROLE.chart)}
        >
          {#if chart}
            {@const ends = fmtRangeEnds(chart.from, chart.to)}
            <AreaChart
              points={chart.points}
              min={chart.min}
              max={chart.max}
              from={ends.from}
              to={ends.to}
              formatValue={(v) => `${Math.round(v * 10) / 10} ${s.unit}`}
              scrubLabel={(point) => fmtDay(point.x, { day: 'numeric', month: 'short', year: 'numeric' })}
              ariaLabel={m.measurement_row_aria({
                type: vocabulary.measurementTypeName(type),
                date: fmtDay(chart.to, { day: 'numeric', month: 'long', year: 'numeric' })
              })}
            />
          {:else}
            <p class="kit-chart-empty">{m.measurement_too_little()}</p>
          {/if}
        </ChartCard>
      {/each}

      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
        {#each [...measurements].reverse() as r (r.id)}
          <ListRow
            key={r.id}
            data-measurement={r.id}
            icon="ruler"
            title={`${r.value} ${r.unit}`}
            subtitle={fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
            chevron={false}
            onclick={() => openEditor(r)}
          />
        {/each}
      </ListCard>
    </div>
  {:else}
    <div>
      <Notice
        icon="ruler"
        key="measurements-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
        title={m.measurement_empty_title()}
        text={m.measurement_empty_body()}
        action={{ label: m.measurement_empty_action(), primary: true, onclick: () => openEditor(null) }}
      />
    </div>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.measurement_edit_sheet() : m.measurement_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.measurement_edit_sheet() : m.measurement_new_sheet()}</h3>
      <div class="field">
        <span class="field-label">{m.measurement_type_label()}</span>
        <Segmented name={m.measurement_type_label()} options={typeOptions} value={editor.type} onChange={(v) => (editor!.type = v)} />
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
      <h3>{m.measurement_delete_q({ type: vocabulary.measurementTypeName(deleteTarget.type) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.measurement_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-measurement onclick={deleteMeasurement}><span>{m.measurement_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={manageOpen} title={m.measurement_manage_types()} onClose={() => (manageOpen = false)}>
    <h3>{m.measurement_manage_types()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.measurement_manage_types_intro()}</p>
    <div class="managed-tags">
      {#each vocabulary.measurementTypes as t (t.key)}
        <div class="managed-tag" class:is-hidden={t.hidden}>
          <span class="managed-label">
            {t.name}{#if !t.builtIn}<span class="muted small"> · {m.custom_suffix()}</span>{/if}
          </span>
          {#if t.hidden}<span class="muted small">{m.tags_hidden()}</span>{/if}
          <span class="managed-actions">
            <button
              class="icon-btn"
              data-measurement-type-hide={t.key}
              aria-label={t.hidden ? m.measurement_type_show_aria({ name: t.name }) : m.measurement_type_hide_aria({ name: t.name })}
              onclick={() => setTypeHidden(t.key, !t.hidden)}
            >
              <Icon name={t.hidden ? 'eye' : 'eyeOff'} size={16} />
            </button>
          </span>
        </div>
      {/each}
    </div>
    <div class="field" style="margin-top:var(--space-4)">
      <label class="field-label" for="new-measurement-type">{m.measurement_type_new_label()}</label>
      <input
        class="input"
        id="new-measurement-type"
        name="new-measurement-type"
        placeholder={m.measurement_type_new_placeholder()}
        bind:value={newTypeName}
      />
    </div>
    <button class="btn btn-primary" data-add-measurement-type onclick={addType}><span>{m.measurement_type_add()}</span></button>
  </Sheet>
</div>
