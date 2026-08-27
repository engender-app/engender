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
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import type { ChecklistItem } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let checklistQuery = liveList((j) => j.checklists.getStandaloneChecklist().then((c) => c?.items));
  let items = $derived(checklistQuery.rows);

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

  <Sheet open={addSheet} title={m.appointment_prep_new_sheet()} onClose={() => (addSheet = false)}>
    <h3>{m.appointment_prep_new_sheet()}</h3>
    <div class="field">
      <input
        class="input"
        id="appointment-prep-input"
        name="appointment-prep-input"
        placeholder={m.appointment_prep_placeholder()}
        bind:value={newItemText}
      />
    </div>
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
</style>
