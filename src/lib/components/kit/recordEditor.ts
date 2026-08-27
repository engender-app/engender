/* The state machine every settings screen that logs a dated record
   hand-rolled for itself (phase 5 UX ticket 39a): an editor draft, a
   delete-confirm target, and the four moves between them. Framework-free
   and unit-testable on its own - recordEditor.svelte.ts wraps it in
   `$state` and is where the reactive object screens actually import lives.
   Same split kit/barRow.ts already makes from BarRows.svelte. */

export type RecordEditorOptions<TRecord extends { id: string }, TDraft extends { id?: string } = TRecord> = {
  /** Build a fresh draft for "add new". Omit for a delete-only record type
      that has no editor at all (e.g. a photo, or a row deleted straight off
      a list). */
  blank?: () => TDraft;
  /** Build a draft from an existing record, to edit it. Required together
      with `blank` - a record type either has both halves of the editor or
      neither. */
  fromRecord?: (record: TRecord) => TDraft;
  /** Persist a draft. Return `false` to keep the editor open instead of
      closing it - the screen's own validation gate (an empty name, a value
      that does not parse). Anything else, including a void return, closes
      it. Omit for a delete-only record type. */
  upsert?: (draft: TDraft) => boolean | void | Promise<boolean | void>;
  /** Delete a record by id. */
  remove: (id: string) => void | Promise<void>;
  /** Look up the current record behind a draft's id, for the delete-confirm
      sheet - the draft holds an edit-friendly shape (e.g. a date input
      string), not the stored record's own fields. */
  findById: (id: string) => TRecord | undefined;
};

/** The next `editor` value for `openEditor(record)`. `null` in, and out,
    for a delete-only record type with no `blank`/`fromRecord` supplied. */
export function nextEditor<TRecord extends { id: string }, TDraft extends { id?: string }>(
  options: Pick<RecordEditorOptions<TRecord, TDraft>, 'blank' | 'fromRecord'>,
  record: TRecord | null
): TDraft | null {
  if (record) return options.fromRecord ? options.fromRecord(record) : null;
  return options.blank ? options.blank() : null;
}

/** Runs `upsert` against a draft and reports whether the editor should
    close. `undefined` `upsert` (a delete-only record type) always closes. */
export async function trySave<TDraft extends { id?: string }>(
  draft: TDraft,
  upsert: RecordEditorOptions<{ id: string }, TDraft>['upsert']
): Promise<boolean> {
  if (!upsert) return true;
  const result = await upsert(draft);
  return result !== false;
}

/** Resolves what `askToDelete` should set as the delete-confirm target.
    Three call shapes: no argument, from inside an open editor (looks the
    record up by the draft's own id); an id string, for a row deleted
    without ever opening an editor; or the record itself, already in hand
    from a list row. */
export function findDeleteTarget<TRecord extends { id: string }, TDraft extends { id?: string }>(
  findById: RecordEditorOptions<TRecord, TDraft>['findById'],
  editor: TDraft | null,
  target: TRecord | string | undefined
): TRecord | null {
  if (target === undefined) return editor?.id ? (findById(editor.id) ?? null) : null;
  if (typeof target === 'string') return findById(target) ?? null;
  return target;
}
