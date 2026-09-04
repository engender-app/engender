<script lang="ts">
  /* A margin note: a visibly later layer under the entry it annotates
     (phase 8 features ticket 07, CONTEXT: "Margin note").

     Journal-aware, unlike DayEntry.svelte around it: this is the caller
     that knows, the way EntryDays.svelte already is for tags and marks.
     `notes` still arrives pre-fetched rather than read here - the caller
     batches `journal.marginNotes.forEntries` once for a whole page
     (marginNotes.ts's own reasoning: one query, not one per row) and hands
     this component only the entry it belongs to.

     The rendering is the feature (the ticket's own words): its own date on
     every note, its own indentation, its own type - nothing here may read
     like a second paragraph of the entry above it. `edit`/`add` write
     straight through the journal (ADR-0044: validated by `marginNotes.add`
     before anything is written, and there is only ever the one insert to
     make - no second write for a transaction to wrap). */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal } from '$lib/data/live/journal.svelte';
  import type { MarginNote } from '$lib/data/types';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import ConfirmDeleteSheet from './kit/ConfirmDeleteSheet.svelte';

  let { entryId, notes }: { entryId: number; notes: MarginNote[] } = $props();

  let composeOpen = $state(false);
  let composeText = $state('');
  let editing = $state<MarginNote | null>(null);
  let deleting = $state<MarginNote | null>(null);

  function openAdd() {
    editing = null;
    composeText = '';
    composeOpen = true;
  }

  function openEdit(note: MarginNote) {
    editing = note;
    composeText = note.text;
    composeOpen = true;
  }

  async function save() {
    const text = composeText.trim();
    if (!text) return;
    if (editing) await journal.marginNotes.edit(editing.id, text);
    else await journal.marginNotes.add({ entryId, epochDay: todayEpochDay(), text });
    composeOpen = false;
  }

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    deleting = null;
    await journal.marginNotes.remove(id);
  }
</script>

{#if notes.length}
  <div class="margin-note-list">
    {#each notes as note (note.id)}
      <div class="margin-note" data-margin-note={note.id}>
        <button class="margin-note-open" data-margin-note-edit onclick={() => openEdit(note)}>
          <span class="margin-note-date">{fmtDay(note.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span class="margin-note-text">{note.text}</span>
        </button>
        <button
          class="icon-btn margin-note-delete"
          aria-label={m.margin_note_delete_aria()}
          data-margin-note-delete
          onclick={() => (deleting = note)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<button class="margin-note-add" data-margin-note-add onclick={openAdd}>
  <Icon name="note" size={14} />
  <span>{m.margin_note_add()}</span>
</button>

<Sheet bind:open={composeOpen} title={editing ? m.margin_note_edit_sheet() : m.margin_note_add_sheet()}>
  <h3>{editing ? m.margin_note_edit_sheet() : m.margin_note_add_sheet()}</h3>
  <textarea
    class="input"
    rows="4"
    style="margin-top:var(--space-3)"
    placeholder={m.margin_note_placeholder()}
    data-margin-note-input
    bind:value={composeText}
  ></textarea>
  <div class="stack-3" style="margin-top:var(--space-3)">
    <button
      class="btn btn-primary"
      disabled={!composeText.trim()}
      data-margin-note-save
      onclick={save}
    >
      <span>{m.margin_note_save()}</span>
    </button>
  </div>
</Sheet>

<ConfirmDeleteSheet
  open={deleting !== null}
  title={m.margin_note_delete_sheet()}
  question={m.margin_note_delete_q()}
  confirmLabel={m.margin_note_delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-margin-note': '' }}
  onConfirm={confirmDelete}
  onCancel={() => (deleting = null)}
/>

<style>
  /* The layer. Not a coloured border - a coloured rule beside a card reads
     as decoration the app puts on cards, not as "this is a different
     moment", and a background tint would read as a highlight on the entry
     itself, which is the exact mistake the ticket names. What actually
     separates the two is a hairline break (the same neutral rule a
     ListCard already draws between its own rows) plus a second, indented
     column the note sits in - text a size down from the entry's own note,
     in the muted ink rather than the primary one - so a glance already
     tells the two apart before a word is read. The hard test the ticket
     sets ("which part was written on the day") is a reading-order
     question, which is why the date sits first on every note, in the
     role's own mark colour, and is never merged onto the same line as the
     text. */
  .margin-note-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--hairline);
  }

  .margin-note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    border-bottom: 1px solid var(--hairline);
  }
  .margin-note:last-child {
    border-bottom: none;
  }

  .margin-note-open {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target);
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    transition-property: background-color;
    transition-duration: var(--dur-fast);
  }
  .margin-note-open:hover {
    background: var(--surface-2);
  }

  .margin-note-date {
    display: block;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--role-mark-in, var(--text-2));
  }

  .margin-note-text {
    display: block;
    margin-top: 2px;
    font-size: var(--text-sm);
    color: var(--text-2);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .margin-note-delete {
    flex-shrink: 0;
    margin: auto 0;
  }

  /* Its own row, the same height and left alignment the notes above it
     keep, so tapping it lands where a finger already is rather than
     somewhere the layout jumped to. */
  .margin-note-add {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--touch-target);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    color: var(--text-2);
    cursor: pointer;
    transition-property: background-color;
    transition-duration: var(--dur-fast);
  }
  .margin-note-add:hover {
    background: var(--surface-2);
  }
</style>
