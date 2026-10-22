/* Transition-roadmap progress (phase 4 ticket 23, widened phase 5 ticket
   20 for a "not my path" tri-state and custom goals; CONTEXT: "Roadmap
   goal", "Country pack", "Custom"): which goals of which country pack
   someone has ticked off, checked or ruled out, plus whatever goals they
   added to a track themselves.

   Two storage shapes for two identities, the same split ADR-0002 draws
   between a built-in and a custom row. A bundled goal is named by its
   pack and goal key and its row exists only because it has a status
   or visibility recorded. No row means unchecked and visible. Clearing
   either choice deletes the row only when neither choice remains. A custom
   goal is the opposite: it is the user's own free text, so its row exists the moment
   it is added regardless of its tick, and 'unchecked' is an ordinary
   value of that same row's `status` column.

   A custom goal's `track` column says where the goal sits. Functional
   audit ticket 34 left one built-in group, the Polish legal steps, written
   'legal', and gave the person categories of their own (roadmap_category),
   whose uuid a goal in one of them holds. A goal written before the trim
   under social, presentational or medical sits in a category migration 111
   made for that track, its uuid the track key. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CustomRoadmapGoal, RoadmapCategory, RoadmapGoalStatus } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface RoadmapArea {
  /** Every bundled goal in one pack that has a status recorded at all, by
      goal key. A key absent from the result is unchecked. */
  getGoalStatuses(packKey: string): Promise<Record<string, RoadmapGoalStatus>>;
  /** Clearing a status preserves a hidden goal's visibility record. */
  setGoalStatus(packKey: string, goalKey: string, status: RoadmapGoalStatus): Promise<void>;

  /** Hidden built-in goal keys in one pack, sorted for stable reads. */
  getHiddenGoals(packKey: string): Promise<string[]>;
  /** Visibility only: never changes status, milestones or documents. */
  setGoalHidden(packKey: string, goalKey: string, hidden: boolean): Promise<void>;

  /** Every custom goal in every group, in the order they were added -
      the order a screen appends them in to their group. */
  getCustomGoals(): Promise<CustomRoadmapGoal[]>;
  /** Starts unchecked, appended to the end of its group: `track` is 'legal'
      for the Polish legal steps (the default) or a category's uuid. */
  addCustomGoal(text: string, track?: string): Promise<CustomRoadmapGoal>;
  setCustomGoalStatus(id: string, status: RoadmapGoalStatus): Promise<void>;
  /** The person's own words, so they can be changed after the fact
      (phase 8 features ticket 69, ADR-0068). Throws on an unknown id the
      way `setCustomGoalStatus` above it does. A milestone this goal minted
      keeps the name it was given on the day; only its provenance line
      moves, because that re-resolves through the join on every read. */
  updateCustomGoalText(id: string, text: string): Promise<void>;
  /** Idempotent: an id that is not there deletes nothing and is success
      (ADR-0053). A milestone minted by this goal keeps its link rather
      than having it nulled - provenance.ts already renders a fallback for
      a goal key that fails to resolve, and a deleted custom goal is simply
      a second way to reach it. A document filed against the goal is
      unfiled rather than deleted: the paper is the person's, and only the
      note about where it belonged goes. A built-in goal has no counterpart
      to any of this: there is no row, so there is nothing to delete. */
  deleteCustomGoal(id: string): Promise<void>;

  /** The person's categories, in the order they were made. */
  getCategories(): Promise<RoadmapCategory[]>;
  addCategory(name: string): Promise<RoadmapCategory>;
  /** Throws on an unknown id, like `updateCustomGoalText`. */
  renameCategory(id: string, name: string): Promise<void>;
  /** Removes the category and every goal in it, unfiling the paper filed
      against those goals the way `deleteCustomGoal` does; a milestone one
      of them minted keeps its link. Idempotent (ADR-0053). */
  deleteCategory(id: string): Promise<void>;
}

export function makeRoadmapArea(driver: SqliteDriver): RoadmapArea {
  return {
    async getGoalStatuses(packKey) {
      const rows = await driver.query<{ goal_key: string; status: RoadmapGoalStatus }>(
        "SELECT goal_key, status FROM roadmap_check WHERE pack_key = ? AND status != 'unchecked'",
        [packKey]
      );
      return Object.fromEntries(rows.map((row) => [row.goal_key, row.status]));
    },

    async setGoalStatus(packKey, goalKey, status) {
      if (status === 'unchecked') {
        await driver.transaction(async (driver) => {
          await driver.run(
            "UPDATE roadmap_check SET status = 'unchecked', updated_at = ? WHERE pack_key = ? AND goal_key = ? AND hidden = 1",
            [now(), packKey, goalKey]
          );
          await driver.run('DELETE FROM roadmap_check WHERE pack_key = ? AND goal_key = ? AND hidden = 0', [packKey, goalKey]);
        });
        return;
      }
      await driver.run(
        `INSERT INTO roadmap_check (pack_key, goal_key, status, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (pack_key, goal_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        [packKey, goalKey, status, now()]
      );
    },

    async getHiddenGoals(packKey) {
      const rows = await driver.query<{ goal_key: string }>(
        'SELECT goal_key FROM roadmap_check WHERE pack_key = ? AND hidden = 1 ORDER BY goal_key',
        [packKey]
      );
      return rows.map((row) => row.goal_key);
    },

    async setGoalHidden(packKey, goalKey, hidden) {
      if (!hidden) {
        await driver.transaction(async (driver) => {
          await driver.run(
            'UPDATE roadmap_check SET hidden = 0, updated_at = ? WHERE pack_key = ? AND goal_key = ?',
            [now(), packKey, goalKey]
          );
          await driver.run("DELETE FROM roadmap_check WHERE pack_key = ? AND goal_key = ? AND status = 'unchecked'", [packKey, goalKey]);
        });
        return;
      }
      await driver.run(
        `INSERT INTO roadmap_check (pack_key, goal_key, status, hidden, updated_at) VALUES (?, ?, 'unchecked', 1, ?)
           ON CONFLICT (pack_key, goal_key) DO UPDATE SET hidden = 1, updated_at = excluded.updated_at`,
        [packKey, goalKey, now()]
      );
    },

    async getCustomGoals() {
      const rows = await driver.query<{ uuid: string; track: string; text: string; status: RoadmapGoalStatus }>(
        'SELECT uuid, track, text, status FROM roadmap_goal ORDER BY id'
      );
      return rows.map((row) => ({ id: row.uuid, track: row.track, text: row.text, status: row.status }));
    },

    async addCustomGoal(text, track = 'legal') {
      const uuid = mintUuid();
      await driver.run('INSERT INTO roadmap_goal (uuid, track, text, status, updated_at) VALUES (?, ?, ?, ?, ?)', [
        uuid,
        track,
        text,
        'unchecked',
        now()
      ]);
      return { id: uuid, track, text, status: 'unchecked' };
    },

    async setCustomGoalStatus(id, status) {
      const result = await driver.run('UPDATE roadmap_goal SET status = ?, updated_at = ? WHERE uuid = ?', [
        status,
        now(),
        id
      ]);
      assertChanged(result, `custom roadmap goal: ${id}`);
    },

    async updateCustomGoalText(id, text) {
      const result = await driver.run('UPDATE roadmap_goal SET text = ?, updated_at = ? WHERE uuid = ?', [
        text,
        now(),
        id
      ]);
      assertChanged(result, `custom roadmap goal: ${id}`);
    },

    async deleteCustomGoal(id) {
      await driver.transaction(async (driver) => {
        // A document's link is a (kind, id) pair rather than a foreign key
        // (documents.ts), so nothing cascades it - the same UPDATE before
        // the DELETE that deleteMilestone and deleteProcedure run. Matched
        // on the id as well as the kind: a goal link's id is a custom
        // goal's uuid or a built-in goal's pack-and-key string in one
        // column (types.ts), and only the former can be deleted.
        await driver.run(
          "UPDATE document SET target_kind = NULL, target_id = NULL WHERE target_kind = 'goal' AND target_id = ?",
          [id]
        );
        await driver.run('DELETE FROM roadmap_goal WHERE uuid = ?', [id]);
      });
    },

    async getCategories() {
      const rows = await driver.query<{ uuid: string; name: string }>('SELECT uuid, name FROM roadmap_category ORDER BY id');
      return rows.map((row) => ({ id: row.uuid, name: row.name }));
    },

    async addCategory(name) {
      const uuid = mintUuid();
      await driver.run('INSERT INTO roadmap_category (uuid, name, updated_at) VALUES (?, ?, ?)', [uuid, name, now()]);
      return { id: uuid, name };
    },

    async renameCategory(id, name) {
      const result = await driver.run('UPDATE roadmap_category SET name = ?, updated_at = ? WHERE uuid = ?', [
        name,
        now(),
        id
      ]);
      assertChanged(result, `roadmap category: ${id}`);
    },

    async deleteCategory(id) {
      await driver.transaction(async (driver) => {
        await driver.run(
          "UPDATE document SET target_kind = NULL, target_id = NULL WHERE target_kind = 'goal' AND target_id IN (SELECT uuid FROM roadmap_goal WHERE track = ?)",
          [id]
        );
        await driver.run('DELETE FROM roadmap_goal WHERE track = ?', [id]);
        await driver.run('DELETE FROM roadmap_category WHERE uuid = ?', [id]);
      });
    }
  };
}
