/* The milestones area (PRD F6/F26). No kind column and no order: whether
   a milestone reads as a countdown or an anniversary follows from its
   date and today (ADR-0010), computed by milestoneStatus() above the seam.

   Photos become writable in ticket 11; deleting a milestone already takes
   its photo rows and files along, mirroring deleteEntry. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Milestone } from '../types';
import type { PhotoFileStore } from './journal';
import {
  insertStagedPhoto,
  photosByMilestone,
  removeFilesAfterCommit,
  removeFilesOf,
  stagePhoto,
  type NormalizedPhoto
} from './photos';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

export type MilestonePhotoChange =
  | { action: 'preserve' }
  | { action: 'remove' }
  | { action: 'replace'; photo: NormalizedPhoto };

export interface MilestoneInput {
  id?: string;
  name: string;
  epochDay: number;
  templateKey?: string | null;
  /** The final photo intent for this save. Omitted means preserve, which
      keeps existing callers and non-photo edits from touching photo rows. */
  photo?: MilestonePhotoChange;
}

export interface MilestonesArea {
  getMilestones(): Promise<Milestone[]>;
  /** Returns the milestone's id. Updating an unknown id throws. */
  upsertMilestone(input: MilestoneInput): Promise<string>;
  /** Idempotent. Takes the milestone's photo rows and files with it. */
  deleteMilestone(id: string): Promise<void>;
}

export function makeMilestonesArea(driver: SqliteDriver, files: PhotoFileStore): MilestonesArea {
  return {
    async getMilestones() {
      const rows = await driver.query<{
        id: number;
        uuid: string;
        name: string;
        epoch_day: number;
        template_key: string | null;
      }>('SELECT id, uuid, name, epoch_day, template_key FROM milestone ORDER BY epoch_day, id');
      // One query for every milestone's photo rather than one per row: the
      // milestones screen renders the whole list at once.
      const photos = await photosByMilestone(driver);
      return rows.map((r) => ({
        id: r.uuid,
        name: r.name,
        epochDay: r.epoch_day,
        templateKey: r.template_key,
        photo: photos.get(r.id) ?? null
      }));
    },

    async upsertMilestone(input) {
      const photoChange = input.photo ?? { action: 'preserve' };
      let milestoneRowid: number | null = null;
      if (input.id) {
        const rows = await driver.query<{ id: number }>('SELECT id FROM milestone WHERE uuid = ?', [input.id]);
        if (!rows[0]) throw new Error(`unknown milestone: ${input.id}`);
        milestoneRowid = rows[0].id;
      }

      const oldPhotos =
        milestoneRowid != null && photoChange.action !== 'preserve'
          ? await driver.query<{ file_path: string }>('SELECT file_path FROM photo WHERE milestone_id = ?', [
              milestoneRowid
            ])
          : [];
      const staged = photoChange.action === 'replace' ? await stagePhoto(files, photoChange.photo) : null;

      if (input.id) {
        if (photoChange.action === 'preserve') {
          const result = await driver.run(
            'UPDATE milestone SET name = ?, epoch_day = ?, template_key = ?, updated_at = ? WHERE uuid = ?',
            [input.name, input.epochDay, input.templateKey ?? null, now(), input.id]
          );
          assertChanged(result, `milestone: ${input.id}`);
          return input.id;
        }
        await driver.transaction(async () => {
          const result = await driver.run(
            'UPDATE milestone SET name = ?, epoch_day = ?, template_key = ?, updated_at = ? WHERE uuid = ?',
            [input.name, input.epochDay, input.templateKey ?? null, now(), input.id]
          );
          assertChanged(result, `milestone: ${input.id}`);
          await driver.run('DELETE FROM photo WHERE milestone_id = ?', [milestoneRowid]);
          if (staged) {
            await insertStagedPhoto(driver, { entryId: null, milestoneId: milestoneRowid }, staged);
          }
        });
        await removeFilesAfterCommit(files, oldPhotos);
        return input.id;
      }
      const uuid = mintUuid();
      if (!staged) {
        await driver.run(
          'INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at) VALUES (?, ?, ?, ?, ?)',
          [uuid, input.name, input.epochDay, input.templateKey ?? null, now()]
        );
        return uuid;
      }
      await driver.transaction(async () => {
        await driver.run(
          'INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at) VALUES (?, ?, ?, ?, ?)',
          [uuid, input.name, input.epochDay, input.templateKey ?? null, now()]
        );
        if (staged) {
          const rowid = await rowidByUuid(driver, 'milestone', uuid);
          await insertStagedPhoto(driver, { entryId: null, milestoneId: rowid }, staged);
        }
      });
      return uuid;
    },

    async deleteMilestone(id) {
      const photos = await driver.query<{ file_path: string }>(
        'SELECT p.file_path FROM photo p JOIN milestone m ON m.id = p.milestone_id WHERE m.uuid = ?',
        [id]
      );
      await driver.transaction(async () => {
        await driver.run('DELETE FROM photo WHERE milestone_id IN (SELECT id FROM milestone WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM milestone WHERE uuid = ?', [id]);
      });
      // After the commit, like deleteEntry: rows never come back because a
      // file removal failed; the boot sweep reclaims orphaned files.
      await removeFilesOf(files, photos);
    }
  };
}
