/* The margin note area (phase 8 features ticket 07, ADR-0010, ADR-0027,
   CONTEXT: "Margin note"). A note an entry's owner adds afterwards, on
   rereading - its own table, its own day, never merged into the entry it
   annotates.

   Owned by an entry's rowid directly rather than by a travelling uuid, the
   way `entry_body_region` is: an entry's domain identity already is its
   rowid (`Entry.id`, ADR-0002's local half) everywhere this module's
   callers speak of one, so there is no owner to resolve at write time the
   way `feltSense.ts`'s `columnsFor` resolves a tryout or a milestone. Only
   the archive, which travels by uuid, needs that resolution - see
   archiveRead.ts's `readMarginNotes` and archiveApply.ts's
   `applyMarginNotes`.

   Batched by entry rather than read one at a time: `forEntries` is the one
   read every caller uses, the same reasoning `photosByEntry` gives for its
   own batching - a page of thirty entries must cost one query, not thirty.

   `add` validates the owner before writing anything, which is what makes it
   ADR-0044's shape (validate outside the transaction, write inside it) even
   though there is only ever one row to write here: a margin note added from
   a read surface is its own write, never bundled with the entry's, so
   there is no second write for a transaction to wrap - the single INSERT is
   already all-or-nothing, and what ADR-0044 actually asks of a new writer is
   this ordering, not a `driver.transaction()` call with nothing else inside
   it. */

import type { SqliteDriver } from '../sqlite/driver';
import type { MarginNote } from '../types';
import { assertChanged, mintUuid, now } from './support';

interface MarginNoteInput {
  entryId: number;
  epochDay: number;
  text: string;
}

export interface MarginNotesArea {
  /** Every named entry's margin notes, oldest first within each entry - the
      order they were added in, which is the order a layered rereading reads
      back in. An entry with none is absent from the map rather than present
      and empty, the same convention `photosByEntry` uses; the caller
      supplies the empty list. */
  forEntries(entryIds: readonly number[]): Promise<Map<number, MarginNote[]>>;
  /** Returns the note's id. Throws on an unknown or trashed entry, before
      anything is written. */
  add(input: MarginNoteInput): Promise<string>;
  /** Corrects the text alone - the day stays what it was, because it is a
      fact about when the person looked back and not something a later edit
      may rewrite (ADR-0010). Throws on an unknown id (ADR-0053). */
  edit(id: string, text: string): Promise<void>;
  /** Idempotent (ADR-0053). */
  remove(id: string): Promise<void>;
}

type MarginNoteRow = { uuid: string; entry_id: number; epoch_day: number; text: string };

const toMarginNote = (row: MarginNoteRow): MarginNote => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  text: row.text
});

export function makeMarginNotesArea(driver: SqliteDriver): MarginNotesArea {
  return {
    async forEntries(entryIds) {
      const byEntry = new Map<number, MarginNote[]>();
      if (entryIds.length === 0) return byEntry;
      const rows = await driver.query<MarginNoteRow>(
        `SELECT uuid, entry_id, epoch_day, text FROM margin_note
         WHERE entry_id IN (${entryIds.map(() => '?').join(', ')})
         ORDER BY epoch_day, id`,
        [...entryIds]
      );
      for (const row of rows) {
        const notes = byEntry.get(row.entry_id);
        if (notes) notes.push(toMarginNote(row));
        else byEntry.set(row.entry_id, [toMarginNote(row)]);
      }
      return byEntry;
    },

    async add({ entryId, epochDay, text }) {
      const owner = await driver.query<{ id: number }>('SELECT id FROM entry WHERE id = ? AND trashed_at IS NULL', [
        entryId
      ]);
      if (owner.length === 0) throw new Error(`unknown entry: ${entryId}`);

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO margin_note (uuid, entry_id, epoch_day, text, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, entryId, epochDay, text, now()]
      );
      return uuid;
    },

    async edit(id, text) {
      const result = await driver.run('UPDATE margin_note SET text = ?, updated_at = ? WHERE uuid = ?', [
        text,
        now(),
        id
      ]);
      assertChanged(result, `margin note: ${id}`);
    },

    async remove(id) {
      await driver.run('DELETE FROM margin_note WHERE uuid = ?', [id]);
    }
  };
}
