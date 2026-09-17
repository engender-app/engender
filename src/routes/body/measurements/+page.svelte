<script lang="ts">
  /* Measurements and sizes: one screen for one question about one body
     (phase 10 redesign ticket 61).

     They used to be two hub rows side by side in Body, and the split ran
     the wrong way. `/body/measurements` had the chart, the scrub, a
     protocol card per type and the history under it. `/body/sizes` had
     1788px of grouped rows - `XS - H&M`, `15 July 2026 - true to size` -
     with no chart, no reading and no statement anywhere that a size had
     changed, which makes it a purchase log. Clothes changing size is one
     of the most legible signals a transitioning body gives, and often the
     one that lands before any number does.

     So: one row, one screen, one finishable group (`areaGroups.ts`), and
     `/body/sizes` redirects. No `/body` index was added - that costs a
     route, a screen registry entry and the three contracts a new screen
     owes here for the same result the two-area row already gives, which is
     the shape `hair-progress` has had since phase 8.

     Both halves are the same three things in the same order: a picker
     that says which reading is showing, the reading, then the log. Rule 16
     wants what is true now above the records, however long the records
     are.

     The two readings sit together at the top rather than each above its
     own log (audit item 8): the size lines used to open the sizes half,
     directly on top of a log that repeated the same two records as rows,
     so the screen said each change twice within 100px. The protocol card
     is below them for the other half of the same finding - 200px of how to
     hold a tape measure came before anything the screen actually knew.

     The measurements half is not given a heading of its own. The screen's
     title says both words already, a second 28px "Body measurements"
     directly under a 48px "Measurements and sizes" is the screen saying
     one of them twice, and it pushed the reading a card further down on a
     screen whose whole point is that the reading comes first. So the field
     carries the measurement controls, which is where rule 7 puts a deep
     screen's actions, and the one heading on the page is the boundary
     between the halves - with the size log's own add beside it, because a
     second plus on the field would be two buttons neither of which said
     what it added.

     **What the change lines may not do.** Neither of them ranks anything
     (ADR-0012). No arrow, no "down from", no percentage, no colour: a size
     returned to is drawn exactly like a size moved to, and the
     measurement span states three numbers and their arithmetic difference
     with no opinion about which end is better. That is the whole test, and
     `tests/change-lines.test.ts` keeps it.

     The chart is the kit's area chart, which is what buys the scrub: a
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
  import { garmentCategoryName } from '$lib/data/vocabulary/labels';
  import { GARMENT_CATEGORIES, type GarmentCategoryKey } from '$lib/data/garmentCategories';
  import { sizeChanges, sizeLabelKey } from '$lib/data/sizeChanges';
  import { fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Measurement, SizeRecord } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  /* Colour that carries a value takes role 0 (DIRECTION.md): roles run a
     flag's colours before its shades, so index 0 is the only one
     guaranteed chromatic on all 8 palettes and a chart drawn in an
     achromatic band is a chart of disabled marks. The lists take the
     stripe after it, where a tinted disc carries no reading. Both lists
     take the same one: they are the same kind of thing on one screen, and
     a second stripe here would say they were not. */
  const SECTION_ROLE = { chart: 0, list: 1 };

  /** No card for a custom type - it never had built-in guidance to give
      (CONTEXT: "Custom"). */
  const PROTOCOL: Partial<Record<string, () => string>> = {
    waist: m.measurement_protocol_waist,
    hips: m.measurement_protocol_hips,
    chest: m.measurement_protocol_chest,
    underbust: m.measurement_protocol_underbust
  };

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  /** A change line's own grain. The ticket's example is *L in November
      2025, M since July 2026*: what a person remembers about a size is the
      season it started, not the afternoon they bought it, and the exact day
      is on the record in the log below either way. */
  /* Each catalogue writes its own frame around these two dates rather than
     sharing one shape. English says "L in November 2025, M since July
     2026"; Polish cannot, because `Intl` hands back a nominative month for
     a month-and-year and both `w` and `od` want a case it is not in, so
     Polish carries the same before-and-now grain with two adverbs instead
     (docs/ui-copy.md: split the message per case rather than interpolating
     a bare noun). */
  const monthLabel = (epochDay: number) => fmtDay(epochDay, { month: 'long', year: 'numeric' });

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

  const fmtValue = (v: number) => `${Math.round(v * 10) / 10} ${prefs.measurementUnit}`;
  /** The change carries its sign and nothing else. A plus or a minus is
      arithmetic; an arrow, a colour or the word "down" would be a verdict,
      and this app does not hand out verdicts about a body (ADR-0012). */
  const fmtChange = (v: number) => (v > 0 ? `+${fmtValue(v)}` : fmtValue(v));

  /** Where this type started, where it is, and the difference - the line
      the chart has always known and never said. Null under two readings,
      which is the same threshold the chart itself draws at. */
  let span = $derived.by(() => {
    if (!chart) return null;
    const start = chart.points[0].y;
    const current = chart.points[chart.points.length - 1].y;
    return { start, current, change: current - start };
  });

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

  /** The unit this type was last logged in, so a new entry defaults to
      whatever the person has been using rather than forcing 'cm' back on
      them. `measurements` is already scoped to the selected type and
      ordered oldest first (ADR-0012: never converted, so this is a
      default, not a rule). */
  function lastUnit(): string {
    return measurements[measurements.length - 1]?.unit ?? 'cm';
  }

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

  /* --- Sizes ------------------------------------------------------------

     The category filter is this half's picker, the same job the type
     Segmented does above: it says which reading is showing, and both the
     change lines and the log answer to it.

     'all' opens on every category at once rather than whichever came
     first in GARMENT_CATEGORIES (Alicja, 2026-08-27) - a UI-only value
     the picker offers alongside the real ones, never itself a category a
     record can be saved under, so it is not in GARMENT_CATEGORIES and
     never reaches sizeRecords.ts's validation against that list. */
  let category = $state<'all' | GarmentCategoryKey>('all');

  let sizesQuery = liveList((j) =>
    category === 'all' ? j.sizeRecords.getRecords() : j.sizeRecords.getRecordsByCategory(category)
  );
  let sizeRecords = $derived(sizesQuery.rows);
  /* Grouped by category, in the fixed catalogue's own order, and only
     built when 'all' is showing - a single category's own records stay a
     flat reverse-chronological list, unchanged. */
  let sizeGroups = $derived(
    GARMENT_CATEGORIES.map((c) => ({ category: c, records: sizeRecords.filter((r) => r.category === c) })).filter(
      (g) => g.records.length
    )
  );
  let changes = $derived(sizeChanges(sizeRecords));

  const size = recordEditor<SizeRecord, { id?: string; date: string; category: string; size: string; brand: string; fitNote: string }>({
    blank: () => ({
      date: dateInputValueFromEpochDay(todayEpochDay()),
      // 'all' is the filter showing, never a category a new record can be
      // saved under - falls back to the catalogue's first entry, same as
      // the field's own default before 'all' existed.
      category: category === 'all' ? GARMENT_CATEGORIES[0] : category,
      size: '',
      brand: '',
      fitNote: ''
    }),
    fromRecord: (r) => ({ id: r.id, date: dateInputValueFromEpochDay(r.epochDay), category: r.category, size: r.size, brand: r.brand, fitNote: r.fitNote }),
    async upsert(draft) {
      if (!draft.size.trim()) return false;

      await journal.sizeRecords.upsertRecord({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        category: draft.category,
        size: draft.size,
        brand: draft.brand,
        fitNote: draft.fitNote
      });
      // 'all' stays put rather than narrowing to whatever was just saved -
      // a filter showing everything should still show everything right
      // after adding to it. A specific category still follows the edit, the
      // same as before 'all' existed.
      if (category !== 'all') category = draft.category as GarmentCategoryKey;
    },
    remove: (id) => journal.sizeRecords.deleteRecord(id),
    findById: (id) => sizeRecords.find((r) => r.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.measurements_and_sizes()} back="/more" subtitle={m.measurements_intro()}>
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

  <!-- What is true now, before anything explains how to measure or lists
       what was measured (audit item 8): the span for the picked type and,
       under it, every size that changed. Both readings sit here rather than
       each above its own list - the size lines used to sit on top of the
       log that repeats the same two records as rows. -->
  {#if span || changes.length}
    <div class="screen-part">
      {#if span}
        <dl class="span" data-measurement-span transition:disclose>
          <div><dt>{m.measurement_span_start()}</dt><dd>{fmtValue(span.start)}</dd></div>
          <div><dt>{m.measurement_span_current()}</dt><dd>{fmtValue(span.current)}</dd></div>
          <div><dt>{m.measurement_span_change()}</dt><dd>{fmtChange(span.change)}</dd></div>
        </dl>
      {/if}

      {#if changes.length}
        <div class="changes" data-size-changes transition:disclose>
          {#each changes as change (sizeLabelKey(change.category, change.brand))}
            <p class="change">
              <span class="change-of">{change.brand} · {garmentCategoryName(change.category)}</span>
              <span class="change-says">
                {m.size_change_line({
                  from: change.from.size,
                  fromDate: monthLabel(change.from.epochDay),
                  to: change.to.size,
                  toDate: monthLabel(change.to.epochDay)
                })}
              </span>
            </p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

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
              formatValue={fmtValue}
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
              subtitle={dayLabel(r.epochDay)}
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

  <SectionHeading text={m.size_log()}>
    {#snippet action()}
      <button class="icon-btn press" data-add-size aria-label={m.size_log_add_aria()} onclick={() => size.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </SectionHeading>

  <div class="kit-filter">
    <label class="kit-filter-label" for="size-log-category-filter">{m.size_log_category_label()}</label>
    <ChartPicker
      key="size-category"
      id="size-log-category-filter"
      labelledBy="size-log-category-filter"
      value={category}
      options={[
        { value: 'all', label: m.size_log_category_all() },
        ...GARMENT_CATEGORIES.map((c) => ({ value: c, label: garmentCategoryName(c) }))
      ]}
      onPick={(v) => (category = v as 'all' | GarmentCategoryKey)}
    />
  </div>

  {#snippet sizeRow(r: SizeRecord)}
    <ListRow
      key={r.id}
      data-size-record={r.id}
      icon="package"
      title={r.brand ? `${r.size} · ${r.brand}` : r.size}
      subtitle={r.fitNote ? `${dayLabel(r.epochDay)} · ${r.fitNote}` : dayLabel(r.epochDay)}
      chevron={false}
      onclick={() => size.openEditor(r)}
    />
  {/snippet}

  <ReadGate read={sizesQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        {#if category === 'all'}
          {#each sizeGroups as g (g.category)}
            <SectionHeading text={garmentCategoryName(g.category)} />
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
              {#each [...g.records].reverse() as r (r.id)}
                {@render sizeRow(r)}
              {/each}
            </ListCard>
          {/each}
        {:else}
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.list)}>
            {#each [...sizeRecords].reverse() as r (r.id)}
              {@render sizeRow(r)}
            {/each}
          </ListCard>
        {/if}
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="package"
          key="sizes-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.list)}
          title={m.size_log_empty_title()}
          text={m.size_log_empty_body()}
          action={{ label: m.size_log_empty_action(), primary: true, onclick: () => size.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <AreaFinish group="measurements" />

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
            <input class="input" type="number" {id} name="measurement-value" placeholder={m.measurement_value_placeholder()} inputmode="decimal" bind:value={() => editor.value, (value) => { editor.value = value == null ? '' : String(value); }} />
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

  <RecordSheet
    record={size}
    handle="size-record"
    newTitle={m.size_log_new_sheet()}
    editTitle={m.size_log_edit_sheet()}
    saveLabel={m.size_log_save()}
    deleteLabel={m.size_log_delete()}
    canSave={(draft) => draft.size.trim().length > 0}
    confirm={{
      title: m.size_log_delete_sheet(),
      question: (r) => m.size_log_delete_q({ category: garmentCategoryName(r.category) }),
      hint: () => m.size_log_delete_hint(),
      confirmLabel: m.size_log_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.size_log_date_label()} id="size-log-date">
        {#snippet children(id)}
          <DatePicker name="size-log-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.size_log_category_label()} id="size-log-category">
        {#snippet children(id)}
          <select class="input" {id} bind:value={editor.category}>
            {#each GARMENT_CATEGORIES as c (c)}
              <option value={c}>{garmentCategoryName(c)}</option>
            {/each}
          </select>
        {/snippet}
      </Field>
      <Field label={m.size_log_size_label()} id="size-log-size">
        {#snippet children(id)}
          <input class="input" {id} name="size-log-size" placeholder={m.size_log_size_placeholder()} bind:value={editor.size} />
        {/snippet}
      </Field>
      <Field label={m.size_log_brand_label()} id="size-log-brand">
        {#snippet children(id)}
          <input class="input" {id} name="size-log-brand" placeholder={m.size_log_brand_placeholder()} bind:value={editor.brand} />
        {/snippet}
      </Field>
      <Field label={m.size_log_fit_note_label()} id="size-log-fit-note">
        {#snippet children(id)}
          <input class="input" {id} name="size-log-fit-note" placeholder={m.size_log_fit_note_placeholder()} bind:value={editor.fitNote} />
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>

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

<style>
  /* The two change lines, drawn as one idea.

     Both are flush (rule 4): text on the page with a hairline under it and
     no ground of its own, because a block or a card here would make the
     reading look like a control and put a fourth surface on a screen that
     already has a chart, two lists and a notice.

     Neither takes a role. Colour in this app carries a value (rule 3), and
     the one thing these lines must never do is grade the change they
     report - so they are set in the page's own ink and the stripe stays on
     the chart, where it belongs to a series rather than to a verdict. */
  .span {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    margin: 0;
  }

  /* The hairline is between the two readings, never under the block: what
     comes after it draws its own top line - a Notice is flush between two
     of them (rule 4) - and two hairlines a few pixels apart read as a
     stray band rather than as a boundary. */
  .span:not(:last-child) {
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--hairline);
  }

  .span dt {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .span dd {
    margin: var(--space-1) 0 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    /* A reading is a number, and three of them in a row want their digits
       in the same columns whatever the value - otherwise Start and Current
       shift against each other every time a figure changes width. */
    font-variant-numeric: tabular-nums;
  }

  .change {
    margin: 0;
    padding: var(--space-3) 0;
  }

  .change + .change {
    border-top: 1px solid var(--hairline);
  }

  /* Which label and which garment the statement is about. Above the
     statement rather than inside it: a line that read "Uniqlo skirts, L in
     November 2025" as one sentence would invite the eye to carry the brand
     across to the next line, and never carrying a size across two brands
     is the whole discipline here. */
  .change-of {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .change-says {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
</style>
