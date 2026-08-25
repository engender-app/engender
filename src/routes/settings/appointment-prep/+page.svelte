<script lang="ts">
  /* The appointment prep list (phase 5 ticket 11, CONTEXT: "Checklist"): the
     one standalone checklist ticket 05's concept supports, presented as a
     running "ask at my next appointment" list. Carry-forward is a per-item
     toggle rather than a bulk end-of-visit action - nothing in the app
     detects when a visit ends (no such event exists), so the person decides
     for themselves, item by item, what still needs asking. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import type { ChecklistItem } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

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
  <ScreenHeader title={m.appointment_prep_title()} back="/settings">
    {#snippet actions()}
      <button class="icon-btn" data-add aria-label={m.appointment_prep_add_aria()} onclick={openAddSheet}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if checklistQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if items.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.appointment_prep_intro()}</p>
    <div class="list-group">
      {#each items as item (item.id)}
        <div class="list-row" style="cursor:default" data-appointment-item={item.id}>
          <button
            class="appointment-toggle"
            role="checkbox"
            aria-checked={item.checked}
            aria-label={item.checked ? m.appointment_prep_uncheck_aria({ content: item.content }) : m.appointment_prep_check_aria({ content: item.content })}
            onclick={() => toggleChecked(item)}
          >
            <span class="row-icon" class:ap-ticked={item.checked}>
              {#if item.checked}<Icon name="check" size={20} />{/if}
            </span>
            <span class="row-text">
              <span class="row-title" class:ap-done={item.checked}>{item.content}</span>
              {#if item.carriedForward}<span class="row-subtitle">{m.appointment_prep_carried_forward_badge()}</span>{/if}
            </span>
          </button>
          <span class="row-trailing">
            <button
              class="icon-btn"
              class:ap-flagged={item.carriedForward}
              data-carry-forward={item.id}
              aria-pressed={item.carriedForward}
              aria-label={item.carriedForward ? m.appointment_prep_uncarry_aria({ content: item.content }) : m.appointment_prep_carry_aria({ content: item.content })}
              onclick={() => toggleCarriedForward(item)}
            >
              <Icon name="flag" size={18} />
            </button>
            <button
              class="icon-btn"
              data-delete-appointment-item={item.id}
              aria-label={m.appointment_prep_delete_aria({ content: item.content })}
              onclick={() => (deleteTarget = item)}
            >
              <Icon name="trash" size={18} />
            </button>
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.appointment_prep_empty_title()} text={m.appointment_prep_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={openAddSheet}><span>{m.appointment_prep_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
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
  /* Same checkbox-square treatment roadmap.ts's page uses for its ticks, and
     the same struck-through-when-done rule - a checked item is not hidden or
     removed, only marked handled. */
  .appointment-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .row-icon {
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .ap-ticked {
    border-color: var(--accent);
    color: var(--accent);
  }

  .ap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  .ap-flagged {
    color: var(--accent);
  }
</style>
