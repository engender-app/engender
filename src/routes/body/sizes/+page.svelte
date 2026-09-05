<script lang="ts">
  /* The size log, on the surface kit (phase 5 UX ticket 25).

     What it was: a full-width `<select>` in a `.field` above a
     `.list-group`, which is the shape a form uses for a value being
     entered. Nothing on that line is being entered - it says which
     category the list below is showing - and a screen-width field sitting
     directly on top of a list reads as the first row of it. It is the
     kit's filter line now.

     The rows keep doing exactly what they did: tapping one opens the
     record in the editor sheet, where its delete lives. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { garmentCategoryName } from '$lib/data/vocabulary/labels';
  import { GARMENT_CATEGORIES, type GarmentCategoryKey } from '$lib/data/garmentCategories';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { SizeRecord } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The trend view's own grouping: one category filtered at a time, the
     same reasoning the measurements screen's type picker gives - there is
     nothing here to plot on a numeric axis (size and fit are free text),
     so the trend is this reverse-chronological list within a category
     rather than a chart.

     'all' opens on every category at once rather than whichever came
     first in GARMENT_CATEGORIES (Alicja, 2026-08-27) - a UI-only value
     the picker offers alongside the real ones, never itself a category a
     record can be saved under, so it is not in GARMENT_CATEGORIES and
     never reaches sizeRecords.ts's validation against that list. */
  let category = $state<'all' | GarmentCategoryKey>('all');

  let recordsQuery = liveList((j) =>
    category === 'all' ? j.sizeRecords.getRecords() : j.sizeRecords.getRecordsByCategory(category)
  );
  let records = $derived(recordsQuery.rows);
  /* Grouped by category, in the fixed catalogue's own order, and only
     built when 'all' is showing - a single category's own records stay a
     flat reverse-chronological list, unchanged. */
  let groups = $derived(
    GARMENT_CATEGORIES.map((c) => ({ category: c, records: records.filter((r) => r.category === c) })).filter(
      (g) => g.records.length
    )
  );

  const record = recordEditor<SizeRecord, { id?: string; date: string; category: string; size: string; brand: string; fitNote: string }>({
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
    findById: (id) => records.find((r) => r.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.size_log()} back="/more" subtitle={m.size_log_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.size_log_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

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
      onclick={() => record.openEditor(r)}
    />
  {/snippet}

  <ReadGate read={recordsQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        {#if category === 'all'}
          {#each groups as g (g.category)}
            <SectionHeading text={garmentCategoryName(g.category)} />
            <ListCard role={roleAt(activeFlag.roles, 0)}>
              {#each [...g.records].reverse() as r (r.id)}
                {@render sizeRow(r)}
              {/each}
            </ListCard>
          {/each}
        {:else}
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each [...records].reverse() as r (r.id)}
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
          role={roleAt(activeFlag.roles, 0)}
          title={m.size_log_empty_title()}
          text={m.size_log_empty_body()}
          action={{ label: m.size_log_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="sizes" />

  <RecordSheet
    {record}
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
</div>
