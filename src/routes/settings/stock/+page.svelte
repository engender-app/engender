<script lang="ts">
  /* Medication stock (phase 4 ticket 04): what a person last reported
     having of each drug, and the run-out it projects from the dose log.
     Box 5: since Reminder never fires on web, this screen is the one
     place the projection is surfaced directly rather than only through
     an Android prompt (box 4, +layout.svelte's reconcileStockRunOutReminders). */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import {
    todayEpochDay,
    epochDayFromDateInputValueOrToday,
    epochDayFromDateInputValue,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import { stockRemainingLabel, stockRunOutLabel, stockOpenedWindowLine } from '$lib/data/vocabulary/stockLabel';
  import type { StockProjectionRow } from '$lib/data/journal/stock';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const WINDOW_MODES = [
    { value: 'days', label: m.stock_window_mode_days() },
    { value: 'end', label: m.stock_window_mode_end() }
  ];

  let rowsQuery = liveList((j) => j.stock.getProjections(todayEpochDay()));
  let projections = $derived(rowsQuery.rows);

  /* The excluded-dose caveat is about every projection on the screen - its
     own wording says "every projection above" - and it was being rendered
     as a third line inside each row, which said the same thing once per
     drug and made the row three lines deep. One statement, under the list,
     summing what was left out. */
  let excludedDoses = $derived(projections.reduce((total, row) => total + row.projection.excludedDoses, 0));

  let editor = $state<{
    id?: string;
    drug: string;
    quantity: string;
    unit: string;
    recordedDate: string;
    openedDate: string;
    windowMode: 'days' | 'end';
    windowDays: string;
    windowEndDate: string;
  } | null>(null);

  function openEditor(row: StockProjectionRow | null) {
    editor = row
      ? {
          id: row.entry.id,
          drug: row.entry.drug,
          quantity: String(row.entry.quantity),
          unit: row.entry.unit,
          recordedDate: dateInputValueFromEpochDay(row.entry.recordedEpochDay),
          openedDate: row.entry.openedEpochDay === null ? '' : dateInputValueFromEpochDay(row.entry.openedEpochDay),
          windowMode: row.entry.inUseEndEpochDay !== null ? 'end' : 'days',
          windowDays: row.entry.inUseWindowDays === null ? '' : String(row.entry.inUseWindowDays),
          windowEndDate: row.entry.inUseEndEpochDay === null ? '' : dateInputValueFromEpochDay(row.entry.inUseEndEpochDay)
        }
      : {
          drug: '',
          quantity: '',
          unit: '',
          recordedDate: dateInputValueFromEpochDay(todayEpochDay()),
          openedDate: '',
          windowMode: 'days',
          windowDays: '',
          windowEndDate: ''
        };
  }

  async function saveEntry() {
    if (!editor) return;
    const quantity = parseFloat(editor.quantity);
    const drug = editor.drug.trim();
    const unit = editor.unit.trim();
    if (isNaN(quantity) || !drug || !unit) return;

    // No opened date, nothing to project a window from - both columns stay
    // null regardless of what the (hidden) window fields hold.
    const openedEpochDay = editor.openedDate ? epochDayFromDateInputValue(editor.openedDate) : null;
    const days = parseInt(editor.windowDays, 10);
    const inUseWindowDays = openedEpochDay !== null && editor.windowMode === 'days' && !isNaN(days) ? days : null;
    const inUseEndEpochDay =
      openedEpochDay !== null && editor.windowMode === 'end' && editor.windowEndDate
        ? epochDayFromDateInputValue(editor.windowEndDate)
        : null;

    await journal.stock.upsertEntry({
      drug,
      quantity,
      unit,
      recordedEpochDay: epochDayFromDateInputValueOrToday(editor.recordedDate),
      openedEpochDay,
      inUseWindowDays,
      inUseEndEpochDay
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
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each projections as row (row.entry.id)}
            {@const runOut = stockRunOutLabel(row.projection, todayEpochDay())}
            <ListRow
              key={row.entry.id}
              data-stock={row.entry.id}
              title={row.entry.drug}
              subtitle={[
                stockRemainingLabel(row.projection.remaining, row.entry.unit),
                m.stock_recorded({ date: fmtDay(row.entry.recordedEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) }),
                runOut.text,
                stockOpenedWindowLine(row.entry, todayEpochDay())
              ]}
              onclick={() => openEditor(row)}
            >
              {#snippet leading()}
                <!-- The run-out reading is a full-width second line now
                     (below), not a pill squeezed into a narrow trailing
                     column - "Already out, based on what you've logged"
                     was wrapping three deep there. The warning colour
                     moves to the icon disc instead: a glance at the left
                     edge says which drugs need attention, and the reading
                     itself stays plain text either way. -->
                <span class="kit-row-ico" class:is-warn={runOut.warn}>
                  <Icon name="package" size={22} />
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
      <Field label={m.stock_drug_label()} id="stock-drug">
        {#snippet children(id)}
          <input class="input" {id} name="stock-drug" placeholder={m.stock_drug_placeholder()} bind:value={editor!.drug} />
        {/snippet}
      </Field>
      <div class="cd-endpoints">
        <Field label={m.stock_quantity_label()} id="stock-quantity">
          {#snippet children(id)}
            <input
              class="input"
              type="number"
              {id}
              name="stock-quantity"
              placeholder={m.stock_quantity_placeholder()}
              inputmode="decimal"
              bind:value={editor!.quantity}
            />
          {/snippet}
        </Field>
        <Field label={m.stock_unit_label()} id="stock-unit">
          {#snippet children(id)}
            <input class="input" {id} name="stock-unit" placeholder={m.stock_unit_placeholder()} bind:value={editor!.unit} />
          {/snippet}
        </Field>
      </div>
      <Field label={m.stock_date_label()} id="stock-date">
        {#snippet children(id)}
          <DatePicker name="stock-date" bind:value={editor!.recordedDate} {id} />
        {/snippet}
      </Field>
      <Field label={m.stock_opened_label()} id="stock-opened">
        {#snippet children(id)}
          <DatePicker name="stock-opened" bind:value={editor!.openedDate} {id} />
        {/snippet}
      </Field>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.stock_opened_hint()}</p>
      {#if editor.openedDate}
        <Field label={m.stock_window_legend()} legend>
          {#snippet children()}
            <Segmented
              name={m.stock_window_legend()}
              options={WINDOW_MODES}
              value={editor!.windowMode}
              onChange={(v) => (editor!.windowMode = v as 'days' | 'end')}
            />
          {/snippet}
        </Field>
        {#if editor.windowMode === 'days'}
          <Field label={m.stock_window_days_label()} id="stock-window-days">
            {#snippet children(id)}
              <input
                class="input"
                type="number"
                {id}
                name="stock-window-days"
                placeholder={m.stock_window_days_placeholder()}
                inputmode="numeric"
                bind:value={editor!.windowDays}
              />
            {/snippet}
          </Field>
        {:else}
          <Field label={m.stock_window_end_label()} id="stock-window-end">
            {#snippet children(id)}
              <DatePicker name="stock-window-end" bind:value={editor!.windowEndDate} {id} />
            {/snippet}
          </Field>
        {/if}
      {/if}

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
  /* The warn signal moved from a trailing pill to the icon disc (ADR-0046's
     surfaces): the app's own warn pair, which palette-contrast.test.ts
     already holds to 4.5:1 across all 8 palettes and both themes, same as
     Notice's .notice-warn. Everywhere else the disc takes its ordinary
     role colour, because most drugs are not running low. */
  .kit-row-ico.is-warn {
    background: var(--warn-soft);
    color: var(--on-warn-soft);
    border-color: transparent;
  }
</style>
