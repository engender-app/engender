<script lang="ts">
  /* Medication stock (phase 4 ticket 04): what a person last reported
     having of each drug, and the run-out it projects from the dose log.
     Box 5: since Reminder never fires on web, this screen is the one
     place the projection is surfaced directly rather than only through
     an Android prompt (box 4, +layout.svelte's reconcileStockRunOutReminders). */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { RUN_OUT_LEAD_DAYS } from '$lib/data/stockProjection';
  import type { StockProjectionRow } from '$lib/data/journal/stock';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  let rowsQuery = liveQuery(['stock', 'dose'], (j) => j.stock.getProjections(todayEpochDay()));
  let rows = $derived(rowsQuery.value ?? []);

  function runOutText(row: StockProjectionRow): string {
    const { remaining, runOutEpochDay } = row.projection;
    if (runOutEpochDay === null) return m.stock_run_out_unknown();
    if (remaining <= 0) return m.stock_run_out_now();
    const date = fmtDay(runOutEpochDay, { day: 'numeric', month: 'short', year: 'numeric' });
    return runOutEpochDay - todayEpochDay() <= RUN_OUT_LEAD_DAYS ? m.stock_run_out_soon({ date }) : m.stock_run_out({ date });
  }

  function isApproaching(row: StockProjectionRow): boolean {
    const { runOutEpochDay } = row.projection;
    return runOutEpochDay !== null && runOutEpochDay - todayEpochDay() <= RUN_OUT_LEAD_DAYS;
  }

  let editor = $state<{
    id?: string;
    drug: string;
    quantity: string;
    unit: string;
    recordedDate: string;
  } | null>(null);

  function openEditor(row: StockProjectionRow | null) {
    editor = row
      ? {
          id: row.entry.id,
          drug: row.entry.drug,
          quantity: String(row.entry.quantity),
          unit: row.entry.unit,
          recordedDate: dateInputValueFromEpochDay(row.entry.recordedEpochDay)
        }
      : { drug: '', quantity: '', unit: '', recordedDate: dateInputValueFromEpochDay(todayEpochDay()) };
  }

  async function saveEntry() {
    if (!editor) return;
    const quantity = parseFloat(editor.quantity);
    const drug = editor.drug.trim();
    const unit = editor.unit.trim();
    if (isNaN(quantity) || !drug || !unit) return;

    await journal.stock.upsertEntry({
      drug,
      quantity,
      unit,
      recordedEpochDay: epochDayFromDateInputValue(editor.recordedDate) ?? todayEpochDay()
    });
    editor = null;
  }

  async function deleteEntry() {
    if (!editor?.id) return;
    await journal.stock.deleteEntry(editor.id);
    editor = null;
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings/regimen" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.stock_title()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.stock_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.stock_intro()}</p>

  {#if rowsQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if rows.length}
    <div class="list-group">
      {#each rows as row (row.entry.id)}
        <button
          class="list-row"
          data-stock={row.entry.id}
          aria-label={m.stock_row_aria({ drug: row.entry.drug })}
          onclick={() => openEditor(row)}
        >
          <span class="row-text">
            <span class="row-title">
              {row.entry.drug}
              {#if isApproaching(row) || row.projection.remaining <= 0}
                <span class="notice-warn" style="padding:2px 8px;border-radius:var(--radius-pill);font-size:var(--text-xs)">
                  {runOutText(row)}
                </span>
              {/if}
            </span>
            <span class="row-subtitle">
              {m.stock_remaining({ count: row.projection.remaining, unit: row.entry.unit })}
              {#if !isApproaching(row) && row.projection.remaining > 0}
                · {runOutText(row)}
              {/if}
              · {m.stock_recorded({ date: fmtDay(row.entry.recordedEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.stock_empty_title()} text={m.stock_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.stock_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.stock_edit_sheet() : m.stock_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.stock_edit_sheet() : m.stock_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="stock-drug">{m.stock_drug_label()}</label>
        <input class="input" id="stock-drug" name="stock-drug" placeholder={m.stock_drug_placeholder()} bind:value={editor.drug} />
      </div>
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="stock-quantity">{m.stock_quantity_label()}</label>
          <input
            class="input"
            type="number"
            id="stock-quantity"
            name="stock-quantity"
            placeholder={m.stock_quantity_placeholder()}
            inputmode="decimal"
            bind:value={editor.quantity}
          />
        </div>
        <div class="field">
          <label class="field-label" for="stock-unit">{m.stock_unit_label()}</label>
          <input class="input" id="stock-unit" name="stock-unit" placeholder={m.stock_unit_placeholder()} bind:value={editor.unit} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="stock-date">{m.stock_date_label()}</label>
        <input class="input" type="date" id="stock-date" name="stock-date" bind:value={editor.recordedDate} />
      </div>

      <div class="stack-3" style="margin-top:var(--space-4)">
        <button class="btn btn-primary" data-save-stock onclick={saveEntry}><span>{m.stock_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-stock onclick={deleteEntry}>
            <span>{m.stock_delete_action({ drug: editor.drug })}</span>
          </button>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>
