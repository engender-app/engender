/* Transition-roadmap progress (phase 4 ticket 23, CONTEXT: "Roadmap goal",
   "Country pack"): which goals of which country pack someone has ticked
   off.

   The area holds ticks and knows nothing about what a goal says or which
   track it sits in - that is a bundled content module (roadmap.ts), read
   off the bundle rather than out of the database. So `packKey` and
   `goalKey` arrive as plain strings and are stored as given, with no check
   against the packs this build happens to ship. That is deliberate: it is
   what lets a second country's pack be content alone (acceptance box 3),
   and a row left behind by a pack that stopped being bundled is invisible
   rather than broken.

   A row exists exactly when a goal is ticked, so unticking deletes it and
   nothing stores a boolean. */

import type { SqliteDriver } from '../sqlite/driver';
import { now } from './support';

export interface RoadmapArea {
  /** The goal keys ticked off in one pack, in key order. */
  getCheckedGoals(packKey: string): Promise<string[]>;
  /** Idempotent both ways: ticking a ticked goal and unticking an
      unticked one both leave the pack exactly as it was. */
  setGoalChecked(packKey: string, goalKey: string, checked: boolean): Promise<void>;
}

export function makeRoadmapArea(driver: SqliteDriver): RoadmapArea {
  return {
    async getCheckedGoals(packKey) {
      const rows = await driver.query<{ goal_key: string }>(
        'SELECT goal_key FROM roadmap_check WHERE pack_key = ? ORDER BY goal_key',
        [packKey]
      );
      return rows.map((row) => row.goal_key);
    },

    async setGoalChecked(packKey, goalKey, checked) {
      if (checked) {
        await driver.run(
          `INSERT INTO roadmap_check (pack_key, goal_key, updated_at) VALUES (?, ?, ?)
             ON CONFLICT (pack_key, goal_key) DO UPDATE SET updated_at = excluded.updated_at`,
          [packKey, goalKey, now()]
        );
      } else {
        await driver.run('DELETE FROM roadmap_check WHERE pack_key = ? AND goal_key = ?', [packKey, goalKey]);
      }
    }
  };
}
