<script lang="ts">
  /* "What to raise": the standing appointment prep list (phase 5 ticket 11,
     ADR-0066), with its add, tick, carry-forward flag and delete. The list
     is standing and unowned - nothing ticks itself off when a visit ends -
     so the appointments list and each upcoming appointment's own screen
     draw the same one list (prh12, the screen per appointment). Its own
     component so those two cannot drift.

     The read is handed in rather than made here: the list screen holds this
     read at "loading" until its visit read has answered too (ux-carpet
     ticket 238), and that gate is the list's business. */
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import { journal, type LiveList } from '$lib/data/live/journal.svelte';
  import type { ChecklistItem } from '$lib/data/types';
  import { undoable } from '$lib/stores/deleteUndo';
  import { rowWriter, writer } from '$lib/stores/attempt.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Field from './kit/Field.svelte';
  import ListCard from './kit/ListCard.svelte';
  import Notice from './kit/Notice.svelte';
  import ReadGate from './kit/ReadGate.svelte';
  import RecordSheet from './kit/RecordSheet.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';
  import { recordEditor } from './kit/recordEditor.svelte';

  let { read }: { read: LiveList<ChecklistItem> } = $props();

  let items = $derived(read.rows);

  /* The prep item's own editor, for the one thing a prep row asks
     confirmation for. */
  const prepRecord = recordEditor<ChecklistItem>({
    remove: (id) => undoable((j) => j.checklists.deleteItem(id)),
    findById: (id) => items.find((item) => item.id === id)
  });

  let addSheet = $state(false);
  let newItemText = $state('');

  function openAddSheet() {
    newItemText = '';
    addSheet = true;
  }

  /* One item per tap, and the sheet stays up with its text and a toast
     when the add fails (UI 17). */
  const itemWrite = writer();
  async function addItem() {
    const content = newItemText.trim();
    if (!content) return;
    if (!(await itemWrite.run(() => journal.checklists.addToStandaloneChecklist(content), m.write_failed()))) return;
    addSheet = false;
  }

  /* A row's tick and flag each take one write at a time, read off the row
     as it stands, so a double tap flips once (UI 17). */
  const checkWrite = rowWriter();
  const flagWrite = rowWriter();
  function toggleChecked(item: ChecklistItem) {
    checkWrite(item.id, () => journal.checklists.setItemChecked(item.id, !item.checked), m.write_failed());
  }

  function toggleCarriedForward(item: ChecklistItem) {
    flagWrite(item.id, () => journal.checklists.setItemCarriedForward(item.id, !item.carriedForward), m.write_failed());
  }
</script>

<SectionHeading text={m.appointments_prep_heading()}>
  {#snippet action()}
    <button class="icon-btn" data-add-prep aria-label={m.appointment_prep_add_item()} onclick={openAddSheet}>
      <Icon name="plus" size={22} />
    </button>
  {/snippet}
</SectionHeading>

<ReadGate {read} variant="line" count={3}>
  {#snippet rows()}
    <ListCard role={roleAt(activeFlag.roles, 1)}>
      <!-- Hand-rolled rather than ListRow (ticket 16): two trailing actions
           (carry-forward flag, delete) where `action` takes one, and a
           checkbox main that's role="checkbox" with its own .ap-box.

           Each row opens and closes its own height (ADR-0078), so an item
           added from the sheet arrives by moving rather than appearing
           where it lands. -->
      {#each items as item (item.id)}
        <div class="kit-row is-split" data-appointment-item={item.id} transition:collapse>
          <button
            class="kit-row-main"
            role="checkbox"
            aria-checked={item.checked}
            aria-label={item.checked ? m.appointment_prep_uncheck_aria({ content: item.content }) : m.appointment_prep_check_aria({ content: item.content })}
            onclick={() => toggleChecked(item)}
          >
            <!-- The tick is always in the markup and crosses in and out on
                 opacity and a scale rather than being added and removed: a
                 glyph that appears in one frame is a yank in both
                 directions. -->
            <span class="ap-box" class:ap-ticked={item.checked}>
              <span class="ap-tick" aria-hidden="true"><Icon name="check" size={20} /></span>
            </span>
            <span class="kit-row-text">
              <span class="kit-row-title" class:ap-done={item.checked}>{item.content}</span>
            </span>
          </button>
          <button
            class="kit-row-act"
            class:ap-flagged={item.carriedForward}
            data-carry-forward={item.id}
            aria-pressed={item.carriedForward}
            aria-label={item.carriedForward ? m.appointment_prep_uncarry_aria({ content: item.content }) : m.appointment_prep_carry_aria({ content: item.content })}
            onclick={() => toggleCarriedForward(item)}
          >
            <Icon name="flag" size={18} />
          </button>
          <button
            class="kit-row-act"
            data-delete-appointment-item={item.id}
            aria-label={m.appointment_prep_delete_aria({ content: item.content })}
            onclick={() => prepRecord.askToDelete(item)}
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      {/each}
    </ListCard>
    <!-- What the flag beside each row does (Alicja, 2026-08-26: "what does
         the flag do in appointment check list?"). Under the list, because it
         is about a control that is only on screen once there is something to
         flag. -->
    <p class="muted small">{m.appointment_prep_flag_hint()}</p>
  {/snippet}
  {#snippet empty()}
    <Notice
      icon="check"
      key="appointment-prep-empty"
      role={roleAt(activeFlag.roles, 1)}
      title={m.appointment_prep_empty_title()}
      text={m.appointment_prep_empty_body()}
      action={{ label: m.appointment_prep_add_item(), primary: true, onclick: openAddSheet }}
    />
  {/snippet}
</ReadGate>

<Sheet busy={itemWrite.busy} open={addSheet} title={m.appointment_prep_new_sheet()} onClose={() => (addSheet = false)}>
  <h3>{m.appointment_prep_new_sheet()}</h3>
  <Field label={m.appointment_prep_new_sheet()} id="appointment-prep-input" hidden>
    {#snippet children(id)}
      <input autocomplete={journalTextAutocomplete()}
        class="input"
        {id}
        name="appointment-prep-input"
        placeholder={m.appointment_prep_placeholder()}
        bind:value={newItemText}
      />
    {/snippet}
  </Field>
  <button class="btn btn-primary" data-save-appointment-item disabled={itemWrite.busy} onclick={addItem}><span>{m.add()}</span></button>
</Sheet>

<RecordSheet
  record={prepRecord}
  handle="appointment-item"
  confirm={{
    title: m.appointment_prep_delete_sheet(),
    question: () => m.appointment_prep_delete_q(),
    hint: (item) => item.content,
    confirmLabel: m.delete(),
    cancelLabel: m.keep_it()
  }}
/>

<style>
  /* Same checkbox-square treatment roadmap's page uses for its ticks, and
     the same struck-through-when-done rule - a checked item is not hidden or
     removed, only marked handled. */
  .ap-box {
    border: 2px solid var(--outline);
    border-radius: var(--r-block);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    /* Tier 1, response: what answers the tap here is the tick landing
       rather than a press depth. */
    transition:
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .ap-ticked {
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  /* Transform and opacity, the two properties the performance contract
     admits without a named material. It grows from the box's own centre,
     because the tick is the box filling in, not a thing arriving. */
  .ap-tick {
    display: flex;
    opacity: 0;
    transform: scale(0.4);
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .ap-ticked .ap-tick {
    opacity: 1;
    transform: scale(1);
  }

  .ap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .ap-flagged {
    color: var(--role-mark);
  }
</style>
