/* Progress photos: a shot taken on purpose,
   in a pose, so the same pose can be compared over months. The poses are
   the person's own list since version 122: Front, Side, Back and Hair built
   in (Hair since version 124, where the hair progress photos went),
   renamed or hidden at will, and any others they add.

   The photo library (/media/photos) reads every photograph the journal
   holds wherever it is kept; this area is the record a person makes when
   the photograph is the point. Its own table, dated in its own right, and
   through the shared photo pipeline: stagePhoto (photos.ts) writes
   normalized, metadata-stripped bytes before the row that names them, and removeFilesOf reclaims them
   after the row has gone. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import { BUILT_IN_PROGRESS_POSES } from '../vocabulary/builtins';
import { assertChanged, bool, domainIdOf, mintUuid, now } from './support';

/** The built-in poses, in the order the screen offers them. */
export const PROGRESS_POSES = BUILT_IN_PROGRESS_POSES;

export type BuiltInProgressPose = (typeof PROGRESS_POSES)[number];

/** A pose's domain id (ADR-0002): a built-in's key, a custom pose's uuid. */
export type ProgressPose = string;

/** One pose on the person's list. `name` is '' for a built-in that keeps
    the catalogue's name, and the person's own wording otherwise. */
export interface ProgressPoseRow {
  id: ProgressPose;
  builtIn: boolean;
  name: string;
  hidden: boolean;
}

export interface ProgressPhoto {
  id: string;
  epochDay: number;
  pose: ProgressPose;
  fileName: string;
}

export interface ProgressPhotosArea {
  /** Every progress photo, oldest first, all poses together. A stored pose the pose list
      does not hold reads as front: the column carries no CHECK, and a row that dropped out
      of every tab would be a photograph nobody can reach to delete. */
  getPhotos(): Promise<ProgressPhoto[]>;
  /** The built-ins in seed order, then the person's own in the order they
      were added. Hidden ones included. */
  getPoses(): Promise<ProgressPoseRow[]>;
  /** Returns the new pose's id. */
  addPose(name: string): Promise<ProgressPose>;
  /** Either kind. A built-in renamed to '' takes the catalogue's name back. */
  renamePose(id: ProgressPose, name: string): Promise<void>;
  setPoseHidden(id: ProgressPose, hidden: boolean): Promise<void>;
  /** Custom poses only, and the pose's photos go with it, files and all;
      run it inside `undoable` for the undo. A built-in id throws, so an
      archive's built-in poses always keep their meaning. */
  deletePose(id: ProgressPose): Promise<void>;
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
type ProgressPoseDbRow = { key: string | null; uuid: string | null; name: string; hidden: number };

const toProgressPhoto = (row: ProgressPhotoRow): ProgressPhoto => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  pose: row.pose,
  fileName: row.file_path
});

const toPose = (row: ProgressPoseDbRow): ProgressPoseRow => ({
  id: domainIdOf(row, 'progress pose'),
  builtIn: row.key !== null,
  name: row.name,
  hidden: bool(row.hidden)
});

export function makeProgressPhotosArea(driver: SqliteDriver, files: PhotoFileStore): ProgressPhotosArea {
  return {
    async getPhotos() {
      const rows = await driver.query<ProgressPhotoRow>(
        `SELECT g.uuid, g.epoch_day, COALESCE(p.key, p.uuid, 'front') AS pose, g.file_path
         FROM progress_photo g LEFT JOIN progress_pose p ON p.key = g.pose OR p.uuid = g.pose
         ORDER BY g.epoch_day, g.id`
      );
      return rows.map(toProgressPhoto);
    },

    async getPoses() {
      const rows = await driver.query<ProgressPoseDbRow>(
        'SELECT key, uuid, name, hidden FROM progress_pose ORDER BY key IS NULL, id'
      );
      return rows.map(toPose);
    },

    async addPose(name) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO progress_pose (uuid, name, updated_at) VALUES (?, ?, ?)', [uuid, name, now()]);
      return uuid;
    },

    async renamePose(id, name) {
      const result = await driver.run('UPDATE progress_pose SET name = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        name,
        now(),
        id,
        id
      ]);
      assertChanged(result, `progress pose: ${id}`);
    },

    async setPoseHidden(id, hidden) {
      const result = await driver.run('UPDATE progress_pose SET hidden = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id,
        id
      ]);
      assertChanged(result, `progress pose: ${id}`);
    },

    async deletePose(id) {
      /* A built-in key throws; an unknown id deletes nothing and succeeds,
         as every delete does (ADR-0053). */
      const builtIn = await driver.query<{ id: number }>('SELECT id FROM progress_pose WHERE key = ?', [id]);
      if (builtIn.length) throw new Error(`a built-in progress pose cannot be deleted: ${id}`);
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM progress_photo WHERE pose = ?', [id]);
      await driver.run('DELETE FROM progress_photo WHERE pose = ?', [id]);
      await driver.run('DELETE FROM progress_pose WHERE uuid = ?', [id]);
      await removeFilesOf(driver, files, rows);
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
