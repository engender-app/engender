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
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { garmentCategoryName } from '$lib/data/vocabulary/labels';
  import { GARMENT_CATEGORIES } from '$lib/data/garmentCategories';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { SizeRecord } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The trend view's own grouping: one category filtered at a time, the
     same reasoning the measurements screen's type picker gives - there is
     nothing here to plot on a numeric axis (size and fit are free text),
     so the trend is this reverse-chronological list within a category
     rather than a chart. */
  let category = $state<string>(GARMENT_CATEGORIES[0]);

  let recordsQuery = liveQuery(['sizeRecord'], (j) => j.sizeRecords.getRecordsByCategory(category));
  let records = $derived(recordsQuery.value ?? []);

  let editor = $state<{ id?: string; date: string; category: string; size: string; brand: string; fitNote: string } | null>(null);
  let deleteTarget = $state<SizeRecord | null>(null);

  function openEditor(record: SizeRecord | null) {
    editor = record
      ? { id: record.id, date: dateInputValueFromEpochDay(record.epochDay), category: record.category, size: record.size, brand: record.brand, fitNote: record.fitNote }
      : { date: dateInputValueFromEpochDay(todayEpochDay()), category, size: '', brand: '', fitNote: '' };
  }

  async function saveRecord() {
    if (!editor || !editor.size.trim()) return;

    await journal.sizeRecords.upsertRecord({
      id: editor.id,
      epochDay: epochDayFromDateInputValue(editor.date) ?? todayEpochDay(),
      category: editor.category,
      size: editor.size,
      brand: editor.brand,
      fitNote: editor.fitNote
    });
    category = editor.category;
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = records.find((r) => r.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteRecord() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.sizeRecords.deleteRecord(id);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.size_log()} back="/more" subtitle={m.size_log_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.size_log_add_aria()} onclick={() => openEditor(null)}>
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
      options={GARMENT_CATEGORIES.map((c) => ({ value: c, label: garmentCategoryName(c) }))}
      onPick={(v) => (category = v)}
    />
  </div>

  {#if recordsQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if records.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each [...records].reverse() as r (r.id)}
          <ListRow
            key={r.id}
            data-size-record={r.id}
            icon="package"
            title={r.brand ? `${r.size} · ${r.brand}` : r.size}
            subtitle={r.fitNote ? `${dayLabel(r.epochDay)} · ${r.fitNote}` : dayLabel(r.epochDay)}
            chevron={false}
            onclick={() => openEditor(r)}
          />
        {/each}
      </ListCard>
    </div>
  {:else}
    <div>
      <Notice
        icon="package"
        key="sizes-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.size_log_empty_title()}
        text={m.size_log_empty_body()}
        action={{ label: m.size_log_empty_action(), primary: true, onclick: () => openEditor(null) }}
      />
    </div>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.size_log_edit_sheet() : m.size_log_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.size_log_edit_sheet() : m.size_log_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="size-log-date">{m.size_log_date_label()}</label>
        <input class="input" type="date" id="size-log-date" name="size-log-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <label class="field-label" for="size-log-category">{m.size_log_category_label()}</label>
        <select class="input" id="size-log-category" bind:value={editor.category}>
          {#each GARMENT_CATEGORIES as c (c)}
            <option value={c}>{garmentCategoryName(c)}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="size-log-size">{m.size_log_size_label()}</label>
        <input class="input" id="size-log-size" name="size-log-size" placeholder={m.size_log_size_placeholder()} bind:value={editor.size} />
      </div>
      <div class="field">
        <label class="field-label" for="size-log-brand">{m.size_log_brand_label()}</label>
        <input class="input" id="size-log-brand" name="size-log-brand" placeholder={m.size_log_brand_placeholder()} bind:value={editor.brand} />
      </div>
      <div class="field">
        <label class="field-label" for="size-log-fit-note">{m.size_log_fit_note_label()}</label>
        <input class="input" id="size-log-fit-note" name="size-log-fit-note" placeholder={m.size_log_fit_note_placeholder()} bind:value={editor.fitNote} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-size-record disabled={!editor.size.trim()} onclick={saveRecord}><span>{m.size_log_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-size-record onclick={askToDelete}><span>{m.size_log_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.size_log_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.size_log_delete_q({ category: garmentCategoryName(deleteTarget.category) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.size_log_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-size-record onclick={deleteRecord}><span>{m.size_log_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
