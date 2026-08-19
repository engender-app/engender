/* Tryouts (phase 4 ticket 16, widened past name/pronoun by phase 5 ticket
   13, CONTEXT: "Tryout"). Two tables, one area - the same shape
   doubtJournal.ts uses for its snapshots - since a tryout's own fields and
   its photos belong to the same screen and nothing reads one without the
   other.

   Which entries fall inside a tryout's date range is not read through
   here: it is an ordinary date-range search
   (entries.searchEntries('', [], { startEpochDay, endEpochDay })), the
   same filter the search screen's date chip already produces. This area
   only owns what it alone writes - the tryout's own fields and its photos.

   A tryout's felt-sense history lives in feltSense.ts instead (CONTEXT:
   "Felt-sense entry"), phase 5 ticket 24: once a milestone could own one
   too, felt-sense stopped being a fact about tryouts alone, the same
   reasoning photos.ts gives for owning entry and milestone photos in one
   place rather than each in the module that happens to use them.

   Tryout photos are their own table (tryout_photo) rather than a third
   owner arm on `photo`, the same reasoning procedures.ts gives for
   procedure_photo: `photo`'s exactly-one-owner CHECK cannot be widened in
   place (migrations.ts v13). The shared pipeline is reused unchanged:
   stagePhoto (photos.ts) writes the same normalized, metadata-stripped
   bytes through the same file-before-row order, and removeFilesOf
   reclaims them the same way on delete. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Tryout, TryoutKind, TryoutPhoto } from '../types';
import type { PhotoFileStore } from './journal';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

export interface TryoutInput {
  id?: string;
  kind: TryoutKind;
  label: string;
  description?: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
}

export interface TryoutsArea {
  /** Most recently started first: several tryouts can be open at once, and
      the one someone just started is what they came here to check on. */
  getTryouts(): Promise<Tryout[]>;
  /** Returns the tryout's id. Updating an unknown id throws. */
  upsertTryout(input: TryoutInput): Promise<string>;
  /** Idempotent. Takes the tryout's felt-sense history and photos with it. */
  deleteTryout(id: string): Promise<void>;
  /** A tryout's photos, oldest first. */
  getPhotos(tryoutId: string): Promise<TryoutPhoto[]>;
  /** Normalizes nothing itself - `photo` must already be through
      normalizePhoto (photoPicking.ts), same as photos.ts's attach. Returns
      the new photo's id. Throws if the tryout is unknown. */
  addPhoto(tryoutId: string, epochDay: number, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
}

type TryoutRow = {
  uuid: string;
  kind: TryoutKind;
  label: string;
  description: string | null;
  start_epoch_day: number;
  end_epoch_day: number | null;
};

const toTryout = (row: TryoutRow): Tryout => ({
  id: row.uuid,
  kind: row.kind,
  label: row.label,
  description: row.description,
  startEpochDay: row.start_epoch_day,
  endEpochDay: row.end_epoch_day
});

export function makeTryoutsArea(driver: SqliteDriver, files: PhotoFileStore): TryoutsArea {
  return {
    async getTryouts() {
      const rows = await driver.query<TryoutRow>(
        'SELECT uuid, kind, label, description, start_epoch_day, end_epoch_day FROM tryout ORDER BY start_epoch_day DESC, id DESC'
      );
      return rows.map(toTryout);
    },

    async upsertTryout(input) {
      const label = input.label.trim();
      if (label.length === 0) throw new Error('a tryout needs a label');
      const description = input.description?.trim() || null;

      if (input.id) {
        const result = await driver.run(
          'UPDATE tryout SET kind = ?, label = ?, description = ?, start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.kind, label, description, input.startEpochDay, input.endEpochDay, now(), input.id]
        );
        assertChanged(result, `tryout: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO tryout (uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid, input.kind, label, description, input.startEpochDay, input.endEpochDay, now()]
      );
      return uuid;
    },

    async deleteTryout(id) {
      // Read before the transaction, the same order deleteMilestone keeps:
      // a failed file removal must never resurrect the rows just committed
      // gone.
      const photos = await driver.query<{ file_path: string }>(
        'SELECT file_path FROM tryout_photo WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)',
        [id]
      );
      await driver.transaction(async () => {
        await driver.run('DELETE FROM felt_sense WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM tryout_photo WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM tryout WHERE uuid = ?', [id]);
      });
      await removeFilesOf(files, photos);
    },

    async getPhotos(tryoutId) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; file_path: string }>(
        `SELECT p.uuid AS uuid, p.epoch_day AS epoch_day, p.file_path AS file_path
         FROM tryout_photo p
         JOIN tryout t ON t.id = p.tryout_id
         WHERE t.uuid = ?
         ORDER BY p.epoch_day, p.id`,
        [tryoutId]
      );
      return rows.map((row) => ({ id: row.uuid, tryoutId, epochDay: row.epoch_day, fileName: row.file_path }));
    },

    async addPhoto(tryoutId, epochDay, photo) {
      const tryoutRowId = await rowidByUuid(driver, 'tryout', tryoutId);

      // Files first (photos.ts's own rule): the row must never name a file
      // that has not landed.
      const staged = await stagePhoto(files, photo);
      await driver.run(
        'INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [staged.id, tryoutRowId, epochDay, staged.fileName, now()]
      );
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM tryout_photo WHERE uuid = ?', [
        id
      ]);
      await driver.run('DELETE FROM tryout_photo WHERE uuid = ?', [id]);
      await removeFilesOf(files, rows);
    }
  };
}
