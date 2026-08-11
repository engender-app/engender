/* The milestones area (PRD F6/F26). No kind column and no order: whether
   a milestone reads as a countdown or an anniversary follows from its
   date and today (ADR-0010), computed by milestoneStatus() above the seam.

   Photos become writable in ticket 11; deleting a milestone already takes
   its photo rows and files along, mirroring deleteEntry. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Milestone } from '../types';
import type { PhotoFileStore } from './journal';
import { photosByMilestone } from './photos';
import { filesOf } from '../photos/names';
import { assertChanged, mintUuid, now } from './support';

export interface MilestoneInput {
  id?: string;
  name: string;
  epochDay: number;
  templateKey?: string | null;
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
      if (input.id) {
        const result = await driver.run(
          'UPDATE milestone SET name = ?, epoch_day = ?, template_key = ?, updated_at = ? WHERE uuid = ?',
          [input.name, input.epochDay, input.templateKey ?? null, now(), input.id]
        );
        assertChanged(result, `milestone: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.name, input.epochDay, input.templateKey ?? null, now()]
      );
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
      for (const p of photos) for (const name of filesOf(p.file_path)) await files.remove(name);
    }
  };
}
