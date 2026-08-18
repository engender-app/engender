/* The doubt journal (phase 4 ticket 11, CONTEXT: "Doubt entry",
   "Counterevidence snapshot"): free-write reflection for a "not trans
   enough" spiral, plus on-demand snapshots of the counterevidence shown
   while writing one. Two tables, one area - the same shape hairProgress.ts
   uses for stagings and photos - since both halves belong to the same
   composer screen and nothing reads one without the feature the other is
   part of.

   Counterevidence itself - the user's own past euphoria-tagged entries -
   is not read through here: it is an ordinary tag query
   (entries.entriesWithTag('g-euphoria', …)), the same one the stats
   screen's tag-insight sheet already uses (+page.svelte). This area only
   owns what it alone writes: the free-write text, and a snapshot's frozen
   copy of whatever that query returned at save time. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CounterevidenceEntry, CounterevidenceSnapshot, DoubtEntry } from '../types';
import { mintUuid, now, rowidByUuid } from './support';

export interface DoubtEntryInput {
  epochDay: number;
  text: string;
}

export interface DoubtJournalArea {
  /** Newest first, the same order entriesWithTag reads counterevidence in. */
  getEntries(limit: number): Promise<DoubtEntry[]>;
  /** Returns the entry's id. Throws on blank text: a doubt entry's one
      field is the whole point of the record, unlike Entry's "at least one
      of six" rule. */
  addEntry(input: DoubtEntryInput): Promise<string>;
  /** Idempotent, like the journal's other deletes. */
  deleteEntry(id: string): Promise<void>;
  /** Newest first. */
  getSnapshots(limit: number): Promise<CounterevidenceSnapshot[]>;
  /** `items` travels as the whole set the composer was showing at the
      moment of the tap - there is nothing to merge a snapshot with.
      Returns the snapshot's id. */
  saveSnapshot(epochDay: number, items: CounterevidenceEntry[]): Promise<string>;
  /** Idempotent. */
  deleteSnapshot(id: string): Promise<void>;
}

type DoubtEntryRow = { uuid: string; epoch_day: number; timestamp: number; text: string };
type SnapshotRow = { id: number; uuid: string; epoch_day: number; timestamp: number };
type SnapshotItemRow = { snapshot_id: number; epoch_day: number; mood: number | null; note: string };

const toDoubtEntry = (row: DoubtEntryRow): DoubtEntry => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  timestamp: row.timestamp,
  text: row.text
});

export function makeDoubtJournalArea(driver: SqliteDriver): DoubtJournalArea {
  return {
    async getEntries(limit) {
      const rows = await driver.query<DoubtEntryRow>(
        'SELECT uuid, epoch_day, timestamp, text FROM doubt_entry ORDER BY epoch_day DESC, timestamp DESC, id DESC LIMIT ?',
        [limit]
      );
      return rows.map(toDoubtEntry);
    },

    async addEntry(input) {
      if (input.text.trim().length === 0) throw new Error('a doubt entry needs some text');

      const uuid = mintUuid();
      const ts = now();
      await driver.run(
        'INSERT INTO doubt_entry (uuid, epoch_day, timestamp, text, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.epochDay, ts, input.text, ts]
      );
      return uuid;
    },

    async deleteEntry(id) {
      await driver.run('DELETE FROM doubt_entry WHERE uuid = ?', [id]);
    },

    async getSnapshots(limit) {
      const rows = await driver.query<SnapshotRow>(
        'SELECT id, uuid, epoch_day, timestamp FROM doubt_snapshot ORDER BY epoch_day DESC, timestamp DESC, id DESC LIMIT ?',
        [limit]
      );
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(', ');
      const itemRows = await driver.query<SnapshotItemRow>(
        `SELECT snapshot_id, epoch_day, mood, note FROM doubt_snapshot_entry
         WHERE snapshot_id IN (${placeholders}) ORDER BY snapshot_id, order_index`,
        ids
      );

      const itemsBySnapshot = new Map<number, CounterevidenceEntry[]>();
      for (const row of itemRows) {
        const items = itemsBySnapshot.get(row.snapshot_id) ?? [];
        items.push({ epochDay: row.epoch_day, mood: row.mood, note: row.note });
        itemsBySnapshot.set(row.snapshot_id, items);
      }

      return rows.map((r) => ({
        id: r.uuid,
        epochDay: r.epoch_day,
        timestamp: r.timestamp,
        items: itemsBySnapshot.get(r.id) ?? []
      }));
    },

    async saveSnapshot(epochDay, items) {
      const uuid = mintUuid();
      const ts = now();
      return driver.transaction(async () => {
        await driver.run('INSERT INTO doubt_snapshot (uuid, epoch_day, timestamp, updated_at) VALUES (?, ?, ?, ?)', [
          uuid,
          epochDay,
          ts,
          ts
        ]);
        if (items.length > 0) {
          const snapshotId = await rowidByUuid(driver, 'doubt_snapshot', uuid);
          const values = items.map(() => '(?, ?, ?, ?, ?)').join(', ');
          const params = items.flatMap((item, index) => [snapshotId, index, item.epochDay, item.mood, item.note]);
          await driver.run(
            `INSERT INTO doubt_snapshot_entry (snapshot_id, order_index, epoch_day, mood, note) VALUES ${values}`,
            params
          );
        }
        return uuid;
      });
    },

    async deleteSnapshot(id) {
      await driver.run('DELETE FROM doubt_snapshot_entry WHERE snapshot_id IN (SELECT id FROM doubt_snapshot WHERE uuid = ?)', [
        id
      ]);
      await driver.run('DELETE FROM doubt_snapshot WHERE uuid = ?', [id]);
    }
  };
}
