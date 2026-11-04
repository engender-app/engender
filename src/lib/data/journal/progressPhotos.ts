/* Progress photos (pre-release-human 12, bug 25): a shot taken on purpose,
   in one of three poses, so the same pose can be compared over months.

   The photo library (/media/photos) reads every photograph the journal
   holds wherever it is kept; this area is the record a person makes when
   the photograph is the point. Its own table, dated in its own right, the
   same shape hairProgress.ts gives its photographs, and through the same
   pipeline: stagePhoto (photos.ts) writes normalized, metadata-stripped
   bytes before the row that names them, and removeFilesOf reclaims them
   after the row has gone. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import { now } from './support';

/** The three poses, in the order the screen offers them. */
export const PROGRESS_POSES = ['front', 'side', 'back'] as const;

export type ProgressPose = (typeof PROGRESS_POSES)[number];

/** A stored pose the code does not know reads as front: the table carries
    no CHECK (the functional audit's CHECK policy), and a row that drops out
    of every tab would be a photograph nobody can reach to delete. */
export function progressPoseOf(value: string): ProgressPose {
  return (PROGRESS_POSES as readonly string[]).includes(value) ? (value as ProgressPose) : 'front';
}

export interface ProgressPhoto {
  id: string;
  epochDay: number;
  pose: ProgressPose;
  fileName: string;
}

export interface ProgressPhotosArea {
  /** Every progress photo, oldest first, all poses together. */
  getPhotos(): Promise<ProgressPhoto[]>;
  /** `photo` must already be through normalizePhoto, as photos.ts's attach
      requires. Returns the new photo's id. */
  addPhoto(epochDay: number, pose: ProgressPose, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
  /** The day of the newest progress photo at or before `todayEpochDay`, or
      null (lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
}

type ProgressPhotoRow = { uuid: string; epoch_day: number; pose: string; file_path: string };

const toProgressPhoto = (row: ProgressPhotoRow): ProgressPhoto => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  pose: progressPoseOf(row.pose),
  fileName: row.file_path
});

export function makeProgressPhotosArea(driver: SqliteDriver, files: PhotoFileStore): ProgressPhotosArea {
  return {
    async getPhotos() {
      const rows = await driver.query<ProgressPhotoRow>(
        'SELECT uuid, epoch_day, pose, file_path FROM progress_photo ORDER BY epoch_day, id'
      );
      return rows.map(toProgressPhoto);
    },

    async addPhoto(epochDay, pose, photo) {
      const staged = await stagePhoto(files, photo);
      await driver.run(
        'INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [staged.id, epochDay, pose, staged.fileName, now()]
      );
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM progress_photo WHERE uuid = ?', [id]);
      await driver.run('DELETE FROM progress_photo WHERE uuid = ?', [id]);
      await removeFilesOf(driver, files, rows);
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM progress_photo WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    }
  };
}
