/* The reactive wrapper around recordEditor.ts's state machine - `$state`
   only works inside a `.svelte`/`.svelte.ts` file, so this is deliberately
   thin: it owns the two pieces of state and delegates every branch to the
   framework-free functions there, which is where the actual behaviour is
   tested. */
import { findDeleteTarget, nextEditor, trySave, type RecordEditorOptions } from './recordEditor.ts';

export function recordEditor<TRecord extends { id: string }, TDraft extends { id?: string } = TRecord>(
  options: RecordEditorOptions<TRecord, TDraft>
) {
  let editor = $state<TDraft | null>(null);
  let deleteTarget = $state<TRecord | null>(null);

  function openEditor(record: TRecord | null) {
    editor = nextEditor(options, record);
  }

  async function save() {
    if (!editor) return;
    if (await trySave(editor, options.upsert)) editor = null;
  }

  function askToDelete(target?: TRecord | string): TRecord | null {
    const found = findDeleteTarget(options.findById, editor, target);
    if (found) {
      deleteTarget = found;
      editor = null;
    }
    return found;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await options.remove(id);
  }

  function cancelDelete() {
    deleteTarget = null;
  }

  return {
    get editor() {
      return editor;
    },
    /** Settable directly, the way a Sheet's own `onClose` closes any other
        editor - there is no separate `cancelEditor`. */
    set editor(value: TDraft | null) {
      editor = value;
    },
    get deleteTarget() {
      return deleteTarget;
    },
    openEditor,
    save,
    askToDelete,
    confirmDelete,
    cancelDelete
  };
}
