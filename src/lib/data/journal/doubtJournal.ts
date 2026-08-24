/* The doubt journal (phase 4 ticket 11; the free-write half retired by
   phase 5 ticket 16, ADR-0037, CONTEXT: "Counterevidence check"): on-demand
   snapshots of the counterevidence shown on `/doubt`, the one thing this
   area still writes.

   Counterevidence itself - the user's own past euphoria-tagged and starred
   entries - is not read through here: it is entries.counterevidencePool
   (phase 5 ticket 14 widened it from a plain tag query,
   entries.entriesWithTag('g-euphoria', …), to a union with starred
   entries, so a person can curate their own "proof" too; ticket 32 widened
   the tag query itself to EUPHORIA_TAG_KEYS, all three euphoria tags
   rather than the general one alone). This area only owns what it alone
   writes: a snapshot's frozen copy of whatever that query returned at save
   time. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CounterevidenceEntry, CounterevidenceSnapshot } from '../types';
import { mintUuid, now, rowidByUuid } from './support';

export interface DoubtJournalArea {
  /** Newest first. */
  getSnapshots(limit: number): Promise<CounterevidenceSnapshot[]>;
  /** `items` travels as the whole set the composer was showing at the
      moment of the tap - there is nothing to merge a snapshot with.
      Returns the snapshot's id. */
  saveSnapshot(epochDay: number, items: CounterevidenceEntry[]): Promise<string>;
  /** Idempotent. */
  deleteSnapshot(id: string): Promise<void>;
}

type SnapshotRow = { id: number; uuid: string; epoch_day: number; timestamp: number };
type SnapshotItemRow = { snapshot_id: number; epoch_day: number; mood: number | null; note: string };

export function makeDoubtJournalArea(driver: SqliteDriver): DoubtJournalArea {
  return {
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
