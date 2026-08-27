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

/** An answer from a read that hangs off the record, tagged with the id it
    was read for. `null` is a read that had no record to read for and so
    asked nothing. */
export type TaggedAnswer<T> = { readonly for: string | null; readonly value: T | undefined };

/** Whether a dependent read's answer is the one this screen should be
    showing.

    This is what the tryout entries race turned on. A read whose closure
    needs the record has nothing to look up while the record is undefined,
    so it answers at once and answers with nothing. The record then arrives
    and the read runs again - but a live query deliberately keeps showing
    its previous answer across a re-run rather than flashing a placeholder
    on every write, so for one round trip the screen holds an empty answer
    that was computed without the record. Rendered as-is, that is "no
    entries in this range" over a tryout with ninety of them.

    An answer read for a different id, or for no record at all, is still
    loading. An answer read for this id is the answer, including when the
    id names nothing stored: an empty state is right there, and a spinner
    that never resolves is not. */
export function answersFor<T>(answer: TaggedAnswer<T> | undefined, id: string): boolean {
  return answer !== undefined && answer.for === id;
}
