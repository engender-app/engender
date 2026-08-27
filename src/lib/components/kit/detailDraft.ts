/* The rules behind a screen that edits one record reached by id (phase 5
   audit ticket 09).

   Three `[id]` screens hand-rolled the same five moves - read the record,
   find it, hold a draft, fill the draft once when the first result lands,
   save and navigate - and both known bugs in that area lived in the shape.
   The route parameter was captured as a plain const in two of the three, so
   it went stale when SvelteKit reused the component across ids; and a read
   hanging off the record could answer with nothing before the record itself
   had arrived, leaving an empty state on screen over data that exists.

   Rune-free so both rules can be node-tested, the split readGate.ts and
   recordEditor.ts already make here. detailDraft.svelte.ts is the reactive
   half and holds nothing but the state these decide over. */

import type { LiveList } from '$lib/data/live/journal.svelte';

export type FillDecision =
  /** The record for this id has not answered yet. */
  | 'wait'
  /** Build the draft from what the read answered with. */
  | 'fill'
  /** The draft on screen is this id's, and whatever has been typed into it
      outlives every later result. */
  | 'keep';

/** Whether the draft on screen is the one this id should be showing.

    `filledFor` is the id the current draft was built from, or null before
    the first fill. The id changing is what makes this refill: a component
    reused across two ids would otherwise keep the first record's draft
    forever, which is what a plain `const id = page.params.id` cannot even
    notice. */
export function fillDecision(filledFor: string | null, id: string, loading: boolean): FillDecision {
  if (filledFor === id) return 'keep';
  return loading ? 'wait' : 'fill';
}

/** The draft for a record that was found, or a blank one for an id that
    names nothing stored - which is every `new`, and also an id that has
    been deleted from under the route. */
export function draftFor<TRecord, TDraft>(
  record: TRecord | undefined,
  blank: () => TDraft,
  fromRecord: (record: TRecord) => TDraft
): TDraft {
  return record ? fromRecord(record) : blank();
}

/** A list read that hangs off the record, seen as still loading until the
    record has arrived.

    A read whose closure needs the record has nothing to ask for while the
    record is undefined, so it answers immediately and answers with nothing.
    Rendered as-is that is an empty state over a screen that is still
    loading. `failed` survives the wait: a read that rejected has something
    to say whenever the screen is ready to say it. */
export function waitingOn<T>(recordLoading: boolean, read: LiveList<T>): LiveList<T> {
  if (!recordLoading) return read;
  return {
    get rows() {
      return read.rows;
    },
    loading: true,
    empty: false,
    get failed() {
      return read.failed;
    }
  };
}
