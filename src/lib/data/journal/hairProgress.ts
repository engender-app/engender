/* The hair-progress area (phase 4 ticket 09): self-staging in the person's
   own words (functional audit ticket 23, which replaced the published
   scales; hairStageScales.ts), and fixed-position photos.

   Stages are a dated series - a person
   re-stages over time, never replacing one date's value in place. No
   episode or anchor reference: what a screen reads staging and photos
   against is resolved above this seam (hairAnchor.ts's
   hairAnchorEpochDay), the same reason personalEffects.ts carries none.

   Hair photos are their own table rather than a third owner on `photo`
   (schema.ts explains why: SQLite cannot widen that table's
   exactly-one-owner CHECK without a full rebuild). The shared pipeline is
   still reused exactly as ticket 09 asks: stagePhoto (photos.ts) writes the
   same normalized, metadata-stripped bytes through the same
   file-before-row order, and removeFilesOf reclaims them the same way on
   delete - only the row naming the files lives here. */

import type { SqliteDriver } from '../sqlite/driver';
import type { HairStage } from '../types';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { assertChanged, mintUuid, now } from './support';

interface HairStageInput {
  id?: string;
  epochDay: number;
  description: string;
}

/** A hair-progress photo placed in time. Its own shape rather than
    photos.ts's DatedPhoto: that one carries `milestoneName`, which nothing
    here has an equivalent of. */
export interface HairPhoto {
  id: string;
  epochDay: number;
  fileName: string;
}

export interface HairProgressArea {
  /** Every staging, oldest first. */
  getStages(): Promise<HairStage[]>;
  /** The stagings recorded on one day (phase 5 deepening ticket 21). */
  getStagesOnDay(epochDay: number): Promise<HairStage[]>;
  /** Returns the staging's id. Updating an unknown id throws. */
  upsertStage(input: HairStageInput): Promise<string>;
  /** Idempotent, like the journal's other deletes. */
  deleteStage(id: string): Promise<void>;
  /** The day of the most recent staging at or before `todayEpochDay`, or
      null if there is none (phase 8 features ticket 03, lastWrite.ts). Its
      own table and its own read - `hairPhotos` below is a separate
      registered area. */
  lastStageWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Every hair photo, oldest first. */
  getPhotos(): Promise<HairPhoto[]>;
  /** The hair photos taken on one day (phase 5 deepening ticket 21). */
  getPhotosOnDay(epochDay: number): Promise<HairPhoto[]>;
  /** Normalizes nothing itself - `photo` must already be through
      normalizePhoto (photoPicking.ts), same as photos.ts's attach. Returns
      the new photo's id. */
  addPhoto(epochDay: number, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
  /** The day of the most recent hair photo at or before `todayEpochDay`, or
      null if there is none (phase 8 features ticket 03, lastWrite.ts). */
  lastPhotoWriteEpochDay(todayEpochDay: number): Promise<number | null>;
}

type HairStageRow = { uuid: string; epoch_day: number; description: string };
type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };

const toHairStage = (row: HairStageRow): HairStage => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  description: row.description
});

const toHairPhoto = (row: HairPhotoRow): HairPhoto => ({ id: row.uuid, epochDay: row.epoch_day, fileName: row.file_path });

export function makeHairProgressArea(driver: SqliteDriver, files: PhotoFileStore): HairProgressArea {
  return {
    async getStages() {
      const rows = await driver.query<HairStageRow>(
        'SELECT uuid, epoch_day, description FROM hair_stage ORDER BY epoch_day, id'
      );
      return rows.map(toHairStage);
    },

    async getStagesOnDay(epochDay) {
      const rows = await driver.query<HairStageRow>(
        'SELECT uuid, epoch_day, description FROM hair_stage WHERE epoch_day = ? ORDER BY id',
        [epochDay]
      );
      return rows.map(toHairStage);
    },

    async upsertStage(input) {
      if (input.id) {
        const result = await driver.run(
          'UPDATE hair_stage SET epoch_day = ?, description = ?, updated_at = ? WHERE uuid = ?',
          [input.epochDay, input.description, now(), input.id]
        );
        assertChanged(result, `hair stage: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO hair_stage (uuid, epoch_day, description, updated_at) VALUES (?, ?, ?, ?)',
        [uuid, input.epochDay, input.description, now()]
      );
      return uuid;
    },

    async deleteStage(id) {
      await driver.run('DELETE FROM hair_stage WHERE uuid = ?', [id]);
    },

    async lastStageWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM hair_stage WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    async getPhotos() {
      const rows = await driver.query<HairPhotoRow>(
        'SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY epoch_day, id'
      );
      return rows.map(toHairPhoto);
    },

    async getPhotosOnDay(epochDay) {
      const rows = await driver.query<HairPhotoRow>(
        'SELECT uuid, epoch_day, file_path FROM hair_photo WHERE epoch_day = ? ORDER BY id',
        [epochDay]
      );
      return rows.map(toHairPhoto);
    },

    async addPhoto(epochDay, photo) {
      // Files first (photos.ts's own rule): the row must never name a file
      // that has not landed.
      const staged = await stagePhoto(files, photo);
      await driver.run('INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?)', [
        staged.id,
        epochDay,
        staged.fileName,
        now()
      ]);
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM hair_photo WHERE uuid = ?', [id]);
      await driver.run('DELETE FROM hair_photo WHERE uuid = ?', [id]);
      await removeFilesOf(driver, files, rows);
    },

    async lastPhotoWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM hair_photo WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    }
  };
}
