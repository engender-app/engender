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

     One chart, not one per unit ever logged in (Alicja, 2026-08-27: "there
     are two graphs for some reason - we want only one"). A measurement is
     still stored in whatever unit it was typed in and never converted
     (measurements.ts) - `prefs.measurementUnit` only decides what every
     reading converts to for this chart, so switching from a wrist-cm era to
     an inches one still draws a single continuous line instead of two
     that stop and start where the habit changed. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { paddedSeries } from '$lib/charts/geometry';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Measurement } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

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

  let measurementsQuery = liveList((j) => j.measurements.getMeasurements(type));
  let measurements = $derived(measurementsQuery.rows);

  /* cm and in are both linear and their factor is exact, unlike a lab
     analyte's per-substance molar mass (labs/units.ts) - so a straight
     multiply is the whole of it, and an unrecognised unit is left as
     logged rather than guessed at. */
  const CM_PER_IN = 2.54;
  function toChartUnit(value: number, fromUnit: string, toUnit: string): number {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'cm' && toUnit === 'in') return value / CM_PER_IN;
    if (fromUnit === 'in' && toUnit === 'cm') return value * CM_PER_IN;
    return value;
  }

  let chartPoints = $derived(
    measurements.map((r) => ({ x: r.epochDay, y: toChartUnit(r.value, r.unit, prefs.measurementUnit) }))
  );
  /* One centimetre or one inch as the flat-run floor: a body measurement
     that has not moved is still worth a band that wide. Labs pass ten,
     for values that run in the hundreds. */
  let chart = $derived(paddedSeries(chartPoints, 1));

  /** The unit this type was last logged in, so a new entry defaults to
      whatever the person has been using rather than forcing 'cm' back on
      them. `measurements` is already scoped to the selected type and
      ordered oldest first (ADR-0012: never converted, so this is a
      default, not a rule). */
  function lastUnit(): string {
    return measurements[measurements.length - 1]?.unit ?? 'cm';
  }

  const record = recordEditor<Measurement, { id?: string; date: string; type: string; value: string; unit: string }>({
    blank: () => ({
      date: dateInputValueFromEpochDay(todayEpochDay()),
      type,
      value: '',
      unit: lastUnit()
    }),
    fromRecord: (measurement) => ({
      id: measurement.id,
      date: dateInputValueFromEpochDay(measurement.epochDay),
      type: measurement.type,
      value: String(measurement.value),
      unit: measurement.unit
    }),
    async upsert(draft) {
      const value = parseFloat(draft.value);
      if (isNaN(value)) return false;

      await journal.measurements.upsertMeasurement({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        type: draft.type,
        value,
        unit: draft.unit
      });
      type = draft.type;
    },
    remove: (id) => journal.measurements.deleteMeasurement(id),
    findById: (id) => measurements.find((r) => r.id === id)
  });
  let manageOpen = $state(false);
  let newTypeName = $state('');

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

  function dismissProtocol() {
    prefs.measurementProtocolDismissed = true;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.body_measurements()} back="/more" subtitle={m.measurements_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-manage-types aria-label={m.measurement_manage_types_aria()} onclick={() => (manageOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
      <button class="icon-btn press" data-add aria-label={m.measurement_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  <Segmented name={m.measurement_type_label()} options={typeOptions} value={type} onChange={(v) => (type = v)} />

  {#if !prefs.measurementProtocolDismissed && PROTOCOL[type]}
    <div class="screen-part">
      <Notice
        icon="ruler"
        key="protocol"
        data-protocol={type}
        role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
        title={m.measurement_protocol_title()}
        text={PROTOCOL[type]!()}
        dismiss={{ label: m.measurement_protocol_dismiss_aria(), onclick: dismissProtocol }}
      />
    </div>
  {/if}

  <ReadGate read={measurementsQuery} variant="block" count={1}>
    {#snippet rows()}
      <div class="screen-part">
        <ChartCard
          heading={vocabulary.measurementTypeName(type)}
          kind="measurements-{type}"
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
              formatValue={(v) => `${Math.round(v * 10) / 10} ${prefs.measurementUnit}`}
              scrubLabel={(point) => fmtDay(point.x, { day: 'numeric', month: 'short', year: 'numeric' })}
              ariaLabel={m.measurement_row_aria({
                type: vocabulary.measurementTypeName(type),
                date: fmtDay(chart.to, { day: 'numeric', month: 'long', year: 'numeric' })
              })}
            />
          {:else}
            <ChartEmpty>{m.measurement_too_little()}</ChartEmpty>
          {/if}
        </ChartCard>

        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
          {#each [...measurements].reverse() as r (r.id)}
            <ListRow
              key={r.id}
              data-measurement={r.id}
              icon="ruler"
              title={`${r.value} ${r.unit}`}
              subtitle={fmtDay(r.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
              chevron={false}
              onclick={() => record.openEditor(r)}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="ruler"
          key="measurements-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
          title={m.measurement_empty_title()}
          text={m.measurement_empty_body()}
          action={{ label: m.measurement_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <RecordSheet
    {record}
    handle="measurement"
    newTitle={m.measurement_new_sheet()}
    editTitle={m.measurement_edit_sheet()}
    saveLabel={m.measurement_save()}
    deleteLabel={m.measurement_delete()}
    confirm={{
      title: m.measurement_delete_sheet(),
      question: (mr) => m.measurement_delete_q({ type: vocabulary.measurementTypeName(mr.type) }),
      hint: () => m.measurement_delete_hint(),
      confirmLabel: m.measurement_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.measurement_type_label()} legend>
        {#snippet children()}
          <Segmented name={m.measurement_type_label()} options={typeOptions} value={editor.type} onChange={(v) => (editor.type = v)} />
        {/snippet}
      </Field>
      <Field label={m.measurement_date_label()} id="measurement-date">
        {#snippet children(id)}
          <DatePicker name="measurement-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <div class="cd-endpoints">
        <Field label={m.measurement_value_label()} id="measurement-value">
          {#snippet children(id)}
            <input class="input" type="number" {id} name="measurement-value" placeholder={m.measurement_value_placeholder()} inputmode="decimal" bind:value={editor.value} />
          {/snippet}
        </Field>
        <Field label={m.measurement_unit_label()} legend>
          {#snippet children()}
            <Segmented
              name={m.measurement_unit_label()}
              options={[
                { value: 'cm', label: m.measurement_unit_cm() },
                { value: 'in', label: m.measurement_unit_in() }
              ]}
              value={editor.unit}
              onChange={(v) => (editor.unit = v)}
            />
          {/snippet}
        </Field>
      </div>
    {/snippet}
  </RecordSheet>

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="measurements" />

  <Sheet open={manageOpen} title={m.measurement_manage_types()} onClose={() => (manageOpen = false)}>
    <h3>{m.measurement_manage_types()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.measurement_manage_types_intro()}</p>
    <div class="managed-tags">
      {#each vocabulary.measurementTypes as t (t.key)}
        <div class="rows-divide managed-tag" class:is-hidden={t.hidden}>
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
    <Field label={m.measurement_type_new_label()} id="new-measurement-type">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="new-measurement-type"
          placeholder={m.measurement_type_new_placeholder()}
          bind:value={newTypeName}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-add-measurement-type onclick={addType}><span>{m.measurement_type_add()}</span></button>
  </Sheet>
</div>
