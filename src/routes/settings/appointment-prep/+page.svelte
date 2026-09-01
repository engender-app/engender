<script lang="ts">
  /* The appointment prep list (phase 5 ticket 11, CONTEXT: "Checklist"): the
     one standalone checklist ticket 05's concept supports, presented as a
     running "ask at my next appointment" list. Carry-forward is a per-item
     toggle rather than a bulk end-of-visit action - nothing in the app
     detects when a visit ends (no such event exists), so the person decides
     for themselves, item by item, what still needs asking.

     On the surface kit (phase 5 UX ticket 25). A row genuinely carries
     three controls here - tick it, flag it to carry forward, throw it away
     - so what the redesign takes off it is the fourth thing: carrying
     forward was drawn twice, once as a subtitle badge and once as the
     flag's own pressed state, which put a second line under every flagged
     item saying what the lit flag beside it already said. The controls
     that remain each get a full touch target, which the 28px squares and
     the buttons packed against them did not have. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import type { ChecklistItem } from '$lib/data/types';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { readLabResultsInRange } from '$lib/data/journal/clinicianSummary';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { severityName } from '$lib/data/vocabulary/labels';
  import { stockRemainingLabel, stockRunOutLabel } from '$lib/data/vocabulary/stockLabel';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);
  const dayShort = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });

  let checklistQuery = liveList((j) => j.checklists.getStandaloneChecklist().then((c) => c?.items));
  let items = $derived(checklistQuery.rows);
  /* The context block below is the "day before" mood (design note): it
     only earns its place once there is something being prepared for. An
     empty list stays the quiet screen it already was. */
  let hasQuestions = $derived(items.length > 0);

  /* The standalone checklist's own appointment date (checklists.ts,
     migrations.ts v48): the one thing this ticket adds storage for.
     Read live and written straight through - no local draft state, since
     the field has exactly one source of truth and nothing here needs to
     hold an in-progress edit across a popup closing. */
  let appointmentDateQuery = liveQuery((j) => j.checklists.getAppointmentDate());
  let appointmentDate = $derived(appointmentDateQuery.value ?? null);
  let appointmentDateInput = $derived(appointmentDate === null ? '' : dateInputValueFromEpochDay(appointmentDate));

  function setAppointmentDate(value: string) {
    journal.checklists.setAppointmentDate(value ? epochDayFromDateInputValue(value) : null);
  }

  /* The current regimen, read the same way the care overview reads it
     (care/+page.svelte) rather than a second look at the episode log:
     `getComparison` is doses.ts's own answer to "which episode is in
     effect", and this screen wants that answer, not a new one. */
  let comparisonQuery = liveQuery((j) => j.doses.getComparison({ fromEpochDay: today - 1, toEpochDay: today }));
  let comparison = $derived(comparisonQuery.value ?? null);
  let activeEpisode = $derived(comparison && 'activeEpisode' in comparison ? comparison.activeEpisode : null);
  /* More than one regimen running at once (e.g. estradiol and progesterone
     together) has no single "current" episode to name - the same case
     care/+page.svelte names rather than silently drops. */
  let severalRegimens = $derived(comparison?.reason === 'multipleEpisodes');

  /* "Since last time" has nothing to scope from until a date is on record
     (ticket 25's design note) - these two stay empty rather than falling
     back to some arbitrary window, which would silently answer a question
     nobody asked. readLabResultsInRange is clinicianSummary.ts's own range
     read, not a second assembly of it. */
  let labsQuery = liveList((j) =>
    appointmentDate === null ? Promise.resolve([]) : readLabResultsInRange(j.labs, appointmentDate, today)
  );
  let sideEffectsQuery = liveList((j) =>
    appointmentDate === null ? Promise.resolve([]) : j.sideEffects.getSideEffectsInRange(appointmentDate, today)
  );

  /* The stock horizon is a live snapshot, not a range - it answers "how
     long until this runs out", which has nothing to do with when the last
     appointment was. */
  let stockQuery = liveList((j) => j.stock.getProjections(today));

  let addSheet = $state(false);
  let newItemText = $state('');

  const record = recordEditor<ChecklistItem>({
    remove: (id) => journal.checklists.deleteItem(id),
    findById: (id) => items.find((item) => item.id === id)
  });

  function openAddSheet() {
    newItemText = '';
    addSheet = true;
  }

  async function addItem() {
    const content = newItemText.trim();
    if (!content) return;
    await journal.checklists.addToStandaloneChecklist(content);
    addSheet = false;
  }

  function toggleChecked(item: ChecklistItem) {
    journal.checklists.setItemChecked(item.id, !item.checked);
  }

  function toggleCarriedForward(item: ChecklistItem) {
    journal.checklists.setItemCarriedForward(item.id, !item.carriedForward);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.appointment_prep_title()} back="/more" subtitle={m.appointment_prep_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.appointment_prep_add_aria()} onclick={openAddSheet}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={checklistQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          <!-- Hand-rolled rather than ListRow (ticket 16): two trailing
               actions (carry-forward flag, delete) where `action` takes
               one, and a checkbox main that's role="checkbox" with its own
               .ap-box rather than ListRow's checked semantics. -->
          {#each items as item (item.id)}
            <div class="kit-row is-split" data-appointment-item={item.id}>
              <button
                class="kit-row-main"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={item.checked ? m.appointment_prep_uncheck_aria({ content: item.content }) : m.appointment_prep_check_aria({ content: item.content })}
                onclick={() => toggleChecked(item)}
              >
                <span class="ap-box" class:ap-ticked={item.checked}>
                  {#if item.checked}<Icon name="check" size={20} />{/if}
                </span>
                <span class="kit-row-text">
                  <span class="kit-row-title" class:ap-done={item.checked}>{item.content}</span>
                </span>
              </button>
              <button
                class="kit-row-act press"
                class:ap-flagged={item.carriedForward}
                data-carry-forward={item.id}
                aria-pressed={item.carriedForward}
                aria-label={item.carriedForward ? m.appointment_prep_uncarry_aria({ content: item.content }) : m.appointment_prep_carry_aria({ content: item.content })}
                onclick={() => toggleCarriedForward(item)}
              >
                <Icon name="flag" size={18} />
              </button>
              <button
                class="kit-row-act press"
                data-delete-appointment-item={item.id}
                aria-label={m.appointment_prep_delete_aria({ content: item.content })}
                onclick={() => record.askToDelete(item)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          {/each}
        </ListCard>
        <!-- What the flag beside each row does. It was a bare icon with an
             aria-label, so the only people the app told were the ones using a
             screen reader (Alicja, 2026-08-26: "what does the flag do in
             appointment check list?"). Under the list rather than in the
             screen's own intro, because it is about a control that is only on
             screen once there is something to flag. -->
        <p class="muted small">{m.appointment_prep_flag_hint()}</p>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="check"
          key="appointment-prep-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.appointment_prep_empty_title()}
          text={m.appointment_prep_empty_body()}
          action={{ label: m.appointment_prep_empty_action(), primary: true, onclick: openAddSheet }}
        />
      </div>
    {/snippet}
  </ReadGate>

  {#if hasQuestions}
    <!-- The "day before" mood (design note): everything below is a live
         read of a module that already owns the figure - regimen.ts through
         doses.getComparison, labs.ts, sideEffects.ts, stock.ts - and prints
         only once there is a question on the list to prep for. -->
    <div class="screen-part">
      <SectionHeading text={m.appointment_prep_context_heading()} />
      <ListCard role={roleAt(activeFlag.roles, 1)}>
        <div class="rows-divide date-row">
          <label class="date-row-label" for="appointment-prep-date">{m.appointment_prep_last_appointment_label()}</label>
          <span class="date-row-value">{appointmentDate === null ? m.appointment_prep_last_appointment_unset() : dayShort(appointmentDate)}</span>
          <span class="date-row-icon"><Icon name="calendar" size={18} /></span>
          <DatePicker
            id="appointment-prep-date"
            value={appointmentDateInput}
            max={todayInput}
            ariaLabel={m.appointment_prep_last_appointment_aria()}
            invis
            onchange={setAppointmentDate}
            data-appointment-date
          />
        </div>
        {#if activeEpisode}
          <ListRow
            key="regimen"
            icon="curve"
            title={activeEpisode.drug}
            subtitle={m.care_regimen_sub({ dose: String(activeEpisode.dose), unit: activeEpisode.doseUnit, interval: activeEpisode.interval })}
            href="/settings/regimen"
          />
        {:else if severalRegimens}
          <ListRow key="regimen" icon="curve" title={m.care_regimen_several()} href="/settings/regimen" />
        {/if}
        <ListRow
          key="clinician-summary"
          icon="share"
          title={m.clinician_summary_row()}
          subtitle={m.clinician_summary_row_sub()}
          href="/settings/clinician-summary"
        />
      </ListCard>
    </div>

    {#if labsQuery.rows.length}
      <div class="screen-part">
        <SectionHeading text={m.appointment_prep_labs_heading()} />
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          {#each labsQuery.rows as lab (lab.id)}
            <ListRow
              key={lab.id}
              icon="flask"
              title={lab.analyte}
              subtitle={[
                `${lab.value} ${lab.unit}`.trim(),
                `${dayShort(lab.epochDay)}${lab.timing ? ` · ${labTimingLabel(lab.timing)}` : ''}`
              ]}
              href="/settings/labs"
            />
          {/each}
        </ListCard>
      </div>
    {/if}

    {#if sideEffectsQuery.rows.length}
      <div class="screen-part">
        <SectionHeading text={m.appointment_prep_side_effects_heading()} />
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          {#each sideEffectsQuery.rows as effect (effect.id)}
            <ListRow
              key={effect.id}
              icon="zap"
              title={effect.name}
              subtitle={[severityName(effect.severity), dayShort(effect.epochDay)]}
              href="/settings/side-effects"
            />
          {/each}
        </ListCard>
      </div>
    {/if}

    {#if stockQuery.rows.length}
      <div class="screen-part">
        <SectionHeading text={m.regimen_stock_link()} />
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          {#each stockQuery.rows as row (row.entry.id)}
            {@const runOut = stockRunOutLabel(row.projection, today)}
            <ListRow
              key={row.entry.id}
              title={row.entry.drug}
              subtitle={[stockRemainingLabel(row.projection.remaining, row.entry.unit), runOut.text]}
              href="/settings/stock"
            >
              {#snippet leading()}
                <span class="kit-row-ico" class:is-warn={runOut.warn}>
                  <Icon name="package" size={22} />
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/if}
  {/if}

  <Sheet open={addSheet} title={m.appointment_prep_new_sheet()} onClose={() => (addSheet = false)}>
    <h3>{m.appointment_prep_new_sheet()}</h3>
    <Field label={m.appointment_prep_new_sheet()} id="appointment-prep-input" hidden>
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="appointment-prep-input"
          placeholder={m.appointment_prep_placeholder()}
          bind:value={newItemText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-appointment-item onclick={addItem}><span>{m.appointment_prep_add()}</span></button>
  </Sheet>

  <RecordSheet
    {record}
    handle="appointment-item"
    confirm={{
      title: m.appointment_prep_delete_sheet(),
      question: () => m.appointment_prep_delete_q(),
      hint: (item) => item.content,
      confirmLabel: m.appointment_prep_delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>

<style>
  /* Same checkbox-square treatment roadmap's page uses for its ticks, and
     the same struck-through-when-done rule - a checked item is not hidden or
     removed, only marked handled. */
  .ap-box {
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    /* Tier 1, response: the square is not the control - the row is - so
       what answers the tap here is the tick landing rather than a press
       depth. The border and the colour cross on --dur-fast, and the
       reduced-motion path keeps both because a colour change is the
       feedback rather than the movement. */
    transition:
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .ap-ticked {
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  .ap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .ap-flagged {
    color: var(--role-mark);
  }

  /* The stock horizon's warn signal, the same rule /settings/stock's own
     rows use (ADR-0046's surfaces): a disc that takes the warn pair only
     when a run-out is close, ordinary role colour otherwise. Not shared
     kit CSS because .kit-row-ico itself is (kit.css) and this variant is
     the one thing each stock-reading screen adds on top of it. */
  .kit-row-ico.is-warn {
    background: var(--warn-soft);
    color: var(--on-warn-soft);
    border-color: transparent;
  }
</style>
