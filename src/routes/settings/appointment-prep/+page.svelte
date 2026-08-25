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
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import type { ChecklistItem } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const crossfade = (_node: Element) => fadeOnly(motionDuration('--dur-fast', 160));

  let checklistQuery = liveQuery(['checklist'], (j) => j.checklists.getStandaloneChecklist());
  let items = $derived(checklistQuery.value?.items ?? []);

  let addSheet = $state(false);
  let newItemText = $state('');
  let deleteTarget = $state<ChecklistItem | null>(null);

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.checklists.deleteItem(id);
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

  {#if checklistQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if items.length}
    <div in:crossfade>
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
              onclick={() => (deleteTarget = item)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </ListCard>
    </div>
  {:else}
    <div in:crossfade>
      <Notice
        icon="check"
        key="appointment-prep-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.appointment_prep_empty_title()}
        text={m.appointment_prep_empty_body()}
        action={{ label: m.appointment_prep_empty_action(), primary: true, onclick: openAddSheet }}
      />
    </div>
  {/if}

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

  <Sheet open={deleteTarget !== null} title={m.appointment_prep_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.appointment_prep_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{deleteTarget.content}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-appointment-item onclick={confirmDelete}><span>{m.appointment_prep_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
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
