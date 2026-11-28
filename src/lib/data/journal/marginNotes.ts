/* A margin note has its own table and day (ADR-0010, ADR-0027). Use the local entry rowid
   (ADR-0002); only archiveRead.ts and archiveApply.ts resolve UUIDs for transfer.

   forEntries batches a page in one query. add validates the owner before a single atomic
   INSERT, independent of any entry write. */

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
