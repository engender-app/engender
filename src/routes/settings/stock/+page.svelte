<script lang="ts">
  /* Medication stock (phase 4 ticket 04): what a person last reported
     having of each drug, and the run-out it projects from the dose log.
     Box 5: since Reminder never fires on web, this screen is the one
     place the projection is surfaced directly rather than only through
     an Android prompt (box 4, +layout.svelte's reconcileStockRunOutReminders). */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { RUN_OUT_LEAD_DAYS } from '$lib/data/stockProjection';
  import type { StockProjectionRow } from '$lib/data/journal/stock';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  let rowsQuery = liveList((j) => j.stock.getProjections(todayEpochDay()));
  let rows = $derived(rowsQuery.rows);

  /* The excluded-dose caveat is about every projection on the screen - its
     own wording says "every projection above" - and it was being rendered
     as a third line inside each row, which said the same thing once per
     drug and made the row three lines deep. One statement, under the list,
     summing what was left out. */
  let excludedDoses = $derived(rows.reduce((total, row) => total + row.projection.excludedDoses, 0));

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
  <ScreenHeader title={m.stock_title()} back="/settings/regimen" subtitle={m.stock_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.stock_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={rowsQuery} variant="line" count={3}>
    {#snippet rows(rows)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each rows as row (row.entry.id)}
            <ListRow
              key={row.entry.id}
              data-stock={row.entry.id}
              icon="package"
              title={row.entry.drug}
              subtitle={`${m.stock_remaining({ count: row.projection.remaining, unit: row.entry.unit })} · ${m.stock_recorded({ date: fmtDay(row.entry.recordedEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })}`}
              chevron={false}
              onclick={() => openEditor(row)}
            >
              {#snippet trailing()}
                <!-- The projection is the reason to be on this screen, so it
                     sits at the end of the row where a count or a date does
                     rather than as a pill wedged into the title. It takes the
                     warning colour only where there is something to be warned
                     about; otherwise it is a reading like any other. -->
                <span
                  class="stock-run-out"
                  class:notice-warn={isApproaching(row) || row.projection.remaining <= 0}
                >
                  {runOutText(row)}
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
        {#if excludedDoses > 0}
          <div class="screen-part">
            <Notice icon="info" key="stock-excluded" text={m.stock_excluded_note({ count: String(excludedDoses) })} />
          </div>
        {/if}
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="package"
          key="stock-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.stock_empty_title()}
          text={m.stock_empty_body()}
          action={{ label: m.stock_empty_action(), primary: true, onclick: () => openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

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

      <div class="stack-3">
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

<style>
  /* The row's trailing reading. It wraps rather than truncating, because
     the run-out is a sentence and a sentence cut off mid-word says less
     than no sentence at all; the row grows to fit it. */
  .stock-run-out {
    text-align: right;
    max-width: 11rem;
    line-height: 1.25;
  }

  /* Where there is something to be warned about it takes the app's own
     warn pair, which palette-contrast.test.ts already holds to 4.5:1 across
     all 8 palettes and both themes. Everywhere else it is a reading in the
     row's own colour, because most of the time it is not a warning. */
  .stock-run-out.notice-warn {
    padding: 2px var(--space-2);
    border-radius: var(--radius-md);
    font-weight: var(--weight-medium);
  }
</style>
