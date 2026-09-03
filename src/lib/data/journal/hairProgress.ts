/* The hair-progress area (phase 4 ticket 09): self-staging against a
   published scale, and scheduled fixed-position photos. Two scales since
   phase 5 ticket 33, plus a third option for a pattern neither describes -
   a staging carries the scale it belongs to and the two are never merged
   (hairStageScales.ts).

   Stages are a dated series like measurement (ticket 08) - a person
   re-stages over time, never replacing one date's value in place. No
   episode or anchor reference: what a screen reads staging and photos
   against is resolved above this seam (hairAnchor.ts's
   hairAnchorEpochDay), the same reason personalEffects.ts and
   measurements.ts carry none either.

   Hair photos are their own table rather than a third owner on `photo`
   (migrations.ts v13 explains why: SQLite cannot widen that table's
   exactly-one-owner CHECK without a full rebuild). The shared pipeline is
   still reused exactly as ticket 09 asks: stagePhoto (photos.ts) writes the
   same normalized, metadata-stripped bytes through the same
   file-before-row order, and removeFilesOf reclaims them the same way on
   delete - only the row naming the files lives here. */

import type { SqliteDriver } from '../sqlite/driver';
import { isGradedScale, isHairStaging } from '../hairStageScales';
import type { HairStage } from '../types';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { assertChanged, mintUuid, now } from './support';

export interface HairStageInput {
  id?: string;
  epochDay: number;
  /** A scale and one of its published grades, or 'other' with an empty
      `stage` and whatever the person wrote in `description`. Validated
      here, not by the caller (hairStageScales.ts's isHairStaging). */
  scale: string;
  stage: string;
  /** Free text, and only ever under 'other' - the schema refuses it on a
      graded staging (migrations.ts v37). Defaults to empty. */
  description?: string;
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
}

type HairStageRow = { uuid: string; epoch_day: number; scale: string; stage: string; description: string };
type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };

const toHairStage = (row: HairStageRow): HairStage => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  scale: row.scale,
  stage: row.stage,
  description: row.description
});

/* Rejected here rather than left to the schema's CHECK, the same seam
   hairRemoval.ts validates an area at: the CHECK is the backstop that also
   covers a restore, and a caller that got the pair wrong deserves the name
   of what it got wrong. The description is dropped rather than refused
   when the scale publishes grades - the caller is switching a staging back
   to a graded scale and the prose has nowhere to live. */
function checkedStaging(input: HairStageInput): { scale: string; stage: string; description: string } {
  if (!isHairStaging(input.scale, input.stage)) {
    throw new Error(`hair stage: ${input.stage || '(none)'} is not a grade on ${input.scale}`);
  }
  return {
    scale: input.scale,
    stage: input.stage,
    description: isGradedScale(input.scale) ? '' : (input.description ?? '')
  };
}
const toHairPhoto = (row: HairPhotoRow): HairPhoto => ({ id: row.uuid, epochDay: row.epoch_day, fileName: row.file_path });

export function makeHairProgressArea(driver: SqliteDriver, files: PhotoFileStore): HairProgressArea {
  return {
    async getStages() {
      const rows = await driver.query<HairStageRow>(
        'SELECT uuid, epoch_day, scale, stage, description FROM hair_stage ORDER BY epoch_day, id'
      );
      return rows.map(toHairStage);
    },

    async getStagesOnDay(epochDay) {
      const rows = await driver.query<HairStageRow>(
        'SELECT uuid, epoch_day, scale, stage, description FROM hair_stage WHERE epoch_day = ? ORDER BY id',
        [epochDay]
      );
      return rows.map(toHairStage);
    },

    async upsertStage(input) {
      const staging = checkedStaging(input);

      if (input.id) {
        const result = await driver.run(
          'UPDATE hair_stage SET epoch_day = ?, scale = ?, stage = ?, description = ?, updated_at = ? WHERE uuid = ?',
          [input.epochDay, staging.scale, staging.stage, staging.description, now(), input.id]
        );
        assertChanged(result, `hair stage: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO hair_stage (uuid, epoch_day, scale, stage, description, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, input.epochDay, staging.scale, staging.stage, staging.description, now()]
      );
      return uuid;
    },

    async deleteStage(id) {
      await driver.run('DELETE FROM hair_stage WHERE uuid = ?', [id]);
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
      await removeFilesOf(files, rows);
    }
  };
}
