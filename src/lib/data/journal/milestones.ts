/* The milestones area (PRD F6/F26). No kind column and no order: whether
   a milestone reads as a countdown or an anniversary follows from its
   date and today (ADR-0010), computed by milestoneStatus() above the seam.

   Photos become writable in ticket 11; deleting a milestone already takes
   its photo rows and files along, mirroring deleteEntry. Phase 5 ticket 24
   widens feltSense.ts's own table to a second owner arm here, so deleting
   a milestone takes its felt-sense history along too - read and written
   through feltSense.ts, not this module, the same division photos.ts
   keeps for the photo row this file only deletes by owner id. */

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
  description?: string;
  templateKey?: string | null;
  roadmapGoalKey?: string | null;
  procedureId?: string | null;
  tryoutId?: string | null;
  /** The final photo intent for this save. Omitted means preserve, which
      keeps existing callers and non-photo edits from touching photo rows. */
  photo?: MilestonePhotoChange;
}

export interface MilestonesArea {
  getMilestones(): Promise<Milestone[]>;
  /** The milestones dated to one day, in the same shape and order
      `getMilestones` reads them (phase 5 ticket 21). Its own query rather
      than a filter over that one, so the day view pays for the day it is
      showing and not for every milestone ever recorded. */
  getMilestonesOnDay(epochDay: number): Promise<Milestone[]>;
  /** Returns the milestone's id. Updating an unknown id throws. */
  upsertMilestone(input: MilestoneInput): Promise<string>;
  /** Idempotent. Takes the milestone's photo rows and files with it. */
  deleteMilestone(id: string): Promise<void>;
}

type MilestoneRow = {
  id: number;
  uuid: string;
  name: string;
  epoch_day: number;
  description: string;
  template_key: string | null;
  roadmap_goal_key: string | null;
  procedure_id: string | null;
  tryout_id: string | null;
  procedure_name: string | null;
  tryout_label: string | null;
  custom_goal_text: string | null;
};

/* The three joins resolve a linked procedure's or tryout's own name, and a
   custom roadmap goal's own text, in the same query rather than a lookup
   per row on every screen a milestone renders on (phase 5 deepening ticket
   22): the provenance line these feed (provenance.ts) needs a name to show,
   not just the id the milestone already carried. A built-in roadmap goal's
   title isn't joined - it's a compiled string, resolved by key in code
   instead, so roadmap_goal only ever matches a custom one. */
const MILESTONE_SELECT = `
  SELECT ms.id, ms.uuid, ms.name, ms.epoch_day, ms.description, ms.template_key, ms.roadmap_goal_key, ms.procedure_id, ms.tryout_id,
         p.name AS procedure_name, t.label AS tryout_label, rg.text AS custom_goal_text
    FROM milestone ms
    LEFT JOIN procedure p ON p.uuid = ms.procedure_id
    LEFT JOIN tryout t ON t.uuid = ms.tryout_id
    LEFT JOIN roadmap_goal rg ON rg.uuid = ms.roadmap_goal_key
`;

export function makeMilestonesArea(driver: SqliteDriver, files: PhotoFileStore): MilestonesArea {
  /* One query for every milestone's photo rather than one per row: both
     readers below render whole lists at once.

     `scoped` is which query that is. Reading a day's milestones (phase 5
     deepening ticket 21) narrows to the rows in hand, or opening any day
     would pay for every milestone photo in the journal; reading all of them
     does not, because an IN clause naming every rowid is the worse half of
     that trade. */
  const withPhotos = async (rows: MilestoneRow[], scoped = false): Promise<Milestone[]> => {
    const photos = await photosByMilestone(driver, scoped ? rows.map((r) => r.id) : undefined);
    return rows.map((r) => ({
      id: r.uuid,
      name: r.name,
      epochDay: r.epoch_day,
      description: r.description,
      templateKey: r.template_key,
      roadmapGoalKey: r.roadmap_goal_key,
      procedureId: r.procedure_id ?? null,
      tryoutId: r.tryout_id ?? null,
      procedureName: r.procedure_name ?? null,
      tryoutLabel: r.tryout_label ?? null,
      customRoadmapGoalText: r.custom_goal_text ?? null,
      photo: photos.get(r.id) ?? null
    }));
  };

  return {
    async getMilestones() {
      return withPhotos(await driver.query<MilestoneRow>(`${MILESTONE_SELECT} ORDER BY ms.epoch_day, ms.id`));
    },

    async getMilestonesOnDay(epochDay) {
      return withPhotos(
        await driver.query<MilestoneRow>(`${MILESTONE_SELECT} WHERE ms.epoch_day = ? ORDER BY ms.id`, [epochDay]),
        true
      );
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

      // roadmapGoalKey, procedureId, tryoutId and description are each set
      // by a different caller (roadmap sync, the procedure hub, tryout
      // adoption, the milestones editor) and each must survive an edit made
      // by a caller that doesn't know about it - a procedure resync passes
      // none of them and must not clear a link or a person's own written
      // description.
      const hasRoadmap = input.roadmapGoalKey !== undefined;
      const hasProc = input.procedureId !== undefined;
      const hasTryout = input.tryoutId !== undefined;
      const hasDescription = input.description !== undefined;
      const extraColumns = [
        ...(hasRoadmap ? ['roadmap_goal_key'] : []),
        ...(hasProc ? ['procedure_id'] : []),
        ...(hasTryout ? ['tryout_id'] : []),
        ...(hasDescription ? ['description'] : [])
      ];
      const extraValues = [
        ...(hasRoadmap ? [input.roadmapGoalKey ?? null] : []),
        ...(hasProc ? [input.procedureId ?? null] : []),
        ...(hasTryout ? [input.tryoutId ?? null] : []),
        ...(hasDescription ? [input.description] : [])
      ];
      const updateSql = `UPDATE milestone SET name = ?, epoch_day = ?, template_key = ?${extraColumns.map((c) => `, ${c} = ?`).join('')}, updated_at = ? WHERE uuid = ?`;
      const updateParams = [input.name, input.epochDay, input.templateKey ?? null, ...extraValues, now(), input.id];

      if (input.id) {
        if (photoChange.action === 'preserve') {
          const result = await driver.run(updateSql, updateParams);
          assertChanged(result, `milestone: ${input.id}`);
          return input.id;
        }
        await driver.transaction(async () => {
          const result = await driver.run(updateSql, updateParams);
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
      const insertSql = `INSERT INTO milestone (uuid, name, epoch_day, description, template_key, roadmap_goal_key, procedure_id, tryout_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const insertParams = [
        uuid,
        input.name,
        input.epochDay,
        input.description ?? '',
        input.templateKey ?? null,
        input.roadmapGoalKey ?? null,
        input.procedureId ?? null,
        input.tryoutId ?? null,
        now()
      ];
      if (!staged) {
        await driver.run(insertSql, insertParams);
        return uuid;
      }
      await driver.transaction(async () => {
        await driver.run(insertSql, insertParams);
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
        await driver.run('DELETE FROM felt_sense WHERE milestone_id IN (SELECT id FROM milestone WHERE uuid = ?)', [
          id
        ]);
        await driver.run('DELETE FROM photo WHERE milestone_id IN (SELECT id FROM milestone WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM milestone WHERE uuid = ?', [id]);
      });
      // After the commit, like deleteEntry: rows never come back because a
      // file removal failed; the boot sweep reclaims orphaned files.
      await removeFilesOf(files, photos);
    }
  };
}
