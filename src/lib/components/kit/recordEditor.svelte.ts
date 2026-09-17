/* Owns the open draft, its in-memory baseline and the pending save.
   Comparison and record lookup stay framework-free in recordEditor.ts. */
import { findDeleteTarget, nextEditor, sameDraft, snapshotDraft, trySave, type RecordEditorOptions } from './recordEditor.ts';

export function recordEditor<TRecord extends { id: string }, TDraft extends { id?: string } = TRecord>(
  options: RecordEditorOptions<TRecord, TDraft>
) {
  let editor = $state<TDraft | null>(null);
  let deleteTarget = $state<TRecord | null>(null);
  let baseline: TDraft | null = null;
  let saving = $state(false);
  let saveFailed = $state(false);

  function setEditor(value: TDraft | null) {
    baseline = snapshotDraft(value);
    editor = value;
    saveFailed = false;
  }

  function openEditor(record: TRecord | null) {
    setEditor(nextEditor(options, record));
  }

  async function save() {
    if (!editor || saving) return;
    const draft = editor;
    saving = true;
    saveFailed = false;
    try {
      if (await trySave(draft, options.upsert) && editor === draft) setEditor(null);
    } catch {
      if (editor === draft) saveFailed = true;
    } finally {
      saving = false;
    }
  }

  function askToDelete(target?: TRecord | string): TRecord | null {
    const found = findDeleteTarget(options.findById, editor, target);
    if (found) {
      deleteTarget = found;
      setEditor(null);
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
    /** Opening a seeded draft also establishes its clean baseline. */
    set editor(value: TDraft | null) {
      setEditor(value);
    },
    get changed() {
      return editor !== null && !sameDraft(editor, baseline);
    },
    get saving() {
      return saving;
    },
    get saveFailed() {
      return saveFailed;
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
