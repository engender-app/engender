<script lang="ts" generics="TRecord extends { id: string }, TDraft extends { id?: string }">
  /* Adding or editing a record - a wear session, a size record, a cycle
     event, a procedure - happens here, on every screen that logs one
     (phase 5 audit ticket 09).

     recordEditor.svelte.ts already owned the state machine, and sixteen
     screens still hand-wrote everything past it: the sheet element with its
     new-or-edit title, the same ternary again in a heading immediately
     below it (nine screens wrote it twice), the save-and-delete button pair
     with its handles spelled out by hand, the delete-confirm sheet's eight
     props, and two lines re-deriving the editor and the delete target off
     the record. A screen supplies its fields and its wording now.

     The handles come from recordHandles.ts rather than from the call site,
     so ADR-0029's vocabulary has an owner. The confirm sheet underneath is
     unchanged - it is the kit's shallowest module and this is what stops it
     being called from a screen.

     A record that is only ever deleted - a photo, a tag, a checklist item -
     passes `confirm` and nothing else: no `fields` means no editor sheet,
     which is the same shape recordEditor takes when it is handed no
     `blank`. */
  import type { Snippet } from 'svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ConfirmDeleteSheet from './ConfirmDeleteSheet.svelte';
  import type { recordEditor } from './recordEditor.svelte';
  import { recordHandles } from './recordHandles';

  let {
    record,
    handle,
    newTitle,
    editTitle,
    saveLabel,
    deleteLabel,
    canSave,
    fields,
    extraActions,
    primary,
    confirm
  }: {
    /** The screen's own `recordEditor(...)`. Both sheets read their state
        from it, so the screen holds neither. */
    record: ReturnType<typeof recordEditor<TRecord, TDraft>>;
    /** What this screen calls its record, in kebab case - `wear-session`,
        `size-record`. The three walkthrough handles are built off it
        (recordHandles.ts). */
    handle: string;
    /** The editor sheet's title while adding. Omit this and the four props
        below for a record with no editor. */
    newTitle?: string;
    /** And while editing. A screen whose editing state is not one thing -
        a wear session can be running - reads the draft for it, the shape
        `confirm.question` and `canSave` already take. */
    editTitle?: string | ((draft: TDraft) => string);
    saveLabel?: string | ((draft: TDraft) => string);
    /** Omitted, the sheet has no delete button - the screen deletes from a
        row instead, and the confirm sheet below still runs. */
    deleteLabel?: string;
    /** Whether the draft can be saved yet. Omitted, it always can. */
    canSave?: (draft: TDraft) => boolean;
    /** The fields, handed the draft to bind to. */
    fields?: Snippet<[TDraft]>;
    /** Anything else the button row carries, between save and delete -
        the two screens that offer "add to appointment prep" from inside
        the editor. */
    extraActions?: Snippet<[TDraft]>;
    /** Replaces the save button outright, for the one screen whose primary
        action is not always a save (a wear session can be started or
        stopped). Rendered in the save button's place, handle and all. */
    primary?: Snippet<[TDraft]>;
    confirm: {
      title: string;
      /** Both are handed the record being deleted, so the screen never
          derives the delete target to name it. */
      question: (target: TRecord) => string;
      hint?: (target: TRecord) => string | null;
      confirmLabel: string;
      cancelLabel: string;
    };
  } = $props();

  const handles = $derived(recordHandles(handle));
  let draft = $derived(record.editor);
  let deleteTarget = $derived(record.deleteTarget);

  /** A label a screen either states outright or reads off the draft. */
  const wording = (label: string | ((draft: TDraft) => string) | undefined, draft: TDraft) =>
    typeof label === 'function' ? label(draft) : label;
</script>

{#if fields}
  <Sheet
    open={draft !== null}
    title={draft ? (draft.id ? wording(editTitle, draft) : newTitle) : newTitle}
    onClose={() => (record.editor = null)}
  >
    {#if draft}
      <h3>{draft.id ? wording(editTitle, draft) : newTitle}</h3>
      {@render fields(draft)}
      <div class="stack-3">
        {#if primary}
          {@render primary(draft)}
        {:else}
          <button
            class="btn btn-primary"
            {...{ [handles.save]: '' }}
            disabled={canSave ? !canSave(draft) : false}
            onclick={record.save}
          >
            <span>{wording(saveLabel, draft)}</span>
          </button>
        {/if}
        {#if draft.id}
          {#if extraActions}{@render extraActions(draft)}{/if}
          {#if deleteLabel}
            <button class="btn btn-ghost" {...{ [handles.delete]: '' }} onclick={() => record.askToDelete()}>
              <span>{deleteLabel}</span>
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </Sheet>
{/if}

<ConfirmDeleteSheet
  open={deleteTarget !== null}
  title={confirm.title}
  question={deleteTarget ? confirm.question(deleteTarget) : ''}
  hint={deleteTarget && confirm.hint ? confirm.hint(deleteTarget) : null}
  confirmLabel={confirm.confirmLabel}
  cancelLabel={confirm.cancelLabel}
  confirmAttrs={{ [handles.confirm]: '' }}
  onConfirm={record.confirmDelete}
  onCancel={record.cancelDelete}
/>
