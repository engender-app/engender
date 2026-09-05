/* Transition-roadmap progress (phase 4 ticket 23, widened phase 5 ticket
   20 for a "not my path" tri-state and custom goals; CONTEXT: "Roadmap
   goal", "Country pack", "Custom"): which goals of which country pack
   someone has ticked off, checked or ruled out, plus whatever goals they
   added to a track themselves.

   Two storage shapes for two identities, the same split ADR-0002 draws
   between a built-in and a custom row. A bundled goal is named by its
   pack and goal key and its row exists only because it has a status at
   all - no row means unchecked, and clearing a status back to unchecked
   deletes the row rather than storing the value, the way it always did
   before this had three states instead of two. A custom goal is the
   opposite: it is the user's own free text, so its row exists the moment
   it is added regardless of its tick, and 'unchecked' is an ordinary
   value of that same row's `status` column.

   Track is roadmap.ts's business for a bundled goal (RoadmapGoal.track)
   and the user's own choice for a custom one, fixed at creation: the
   ticket's out-of-scope line refuses a reorder UI, so there is no setter
   to move a custom goal between tracks either. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CustomRoadmapGoal, RoadmapGoalStatus } from '../types';
import type { RoadmapTrack } from '../roadmap';
import { assertChanged, mintUuid, now } from './support';

export interface RoadmapArea {
  /** Every bundled goal in one pack that has a status recorded at all, by
      goal key. A key absent from the result is unchecked. */
  getGoalStatuses(packKey: string): Promise<Record<string, RoadmapGoalStatus>>;
  /** Idempotent: setting a goal to the status it already holds changes
      nothing, and setting 'unchecked' deletes its row rather than storing
      the value. */
  setGoalStatus(packKey: string, goalKey: string, status: RoadmapGoalStatus): Promise<void>;

  /** Every custom goal across every track, in the order they were added -
      the order a screen appends them in after a track's bundled goals. */
  getCustomGoals(): Promise<CustomRoadmapGoal[]>;
  /** Starts unchecked. `track` is fixed for the goal's whole life; there
      is no reorder or move-track UI for a custom goal to feed. */
  addCustomGoal(track: RoadmapTrack, text: string): Promise<CustomRoadmapGoal>;
  setCustomGoalStatus(id: string, status: RoadmapGoalStatus): Promise<void>;

  /** Which tracks the person has said are not their path (phase 8 features
      ticket 49), sorted, so a caller comparing two reads gets the same
      order. A track named here that `ROADMAP_TRACKS` no longer lists is
      returned like any other and matches nothing on screen - the same
      no-cleanup-job property a mute naming a deleted era has. */
  getDismissedTracks(): Promise<string[]>;
  /** Idempotent both ways: presence is the whole of the state, so
      dismissing twice writes the same row and undoing one that was never
      dismissed deletes nothing and is success. Never touches a goal's own
      status - the fold is a reading of the ticks, not a write over them. */
  setTrackDismissed(track: RoadmapTrack, dismissed: boolean): Promise<void>;
}

export function makeRoadmapArea(driver: SqliteDriver): RoadmapArea {
  return {
    async getGoalStatuses(packKey) {
      const rows = await driver.query<{ goal_key: string; status: RoadmapGoalStatus }>(
        'SELECT goal_key, status FROM roadmap_check WHERE pack_key = ?',
        [packKey]
      );
      return Object.fromEntries(rows.map((row) => [row.goal_key, row.status]));
    },

    async setGoalStatus(packKey, goalKey, status) {
      if (status === 'unchecked') {
        await driver.run('DELETE FROM roadmap_check WHERE pack_key = ? AND goal_key = ?', [packKey, goalKey]);
        return;
      }
      await driver.run(
        `INSERT INTO roadmap_check (pack_key, goal_key, status, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (pack_key, goal_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        [packKey, goalKey, status, now()]
      );
    },

    async getCustomGoals() {
      const rows = await driver.query<{ uuid: string; track: string; text: string; status: RoadmapGoalStatus }>(
        'SELECT uuid, track, text, status FROM roadmap_goal ORDER BY id'
      );
      return rows.map((row) => ({ id: row.uuid, track: row.track, text: row.text, status: row.status }));
    },

    async addCustomGoal(track, text) {
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

    async getDismissedTracks() {
      const rows = await driver.query<{ track: string }>('SELECT track FROM roadmap_track ORDER BY track');
      return rows.map((row) => row.track);
    },

    async setTrackDismissed(track, dismissed) {
      if (!dismissed) {
        await driver.run('DELETE FROM roadmap_track WHERE track = ?', [track]);
        return;
      }
      await driver.run(
        `INSERT INTO roadmap_track (track, updated_at) VALUES (?, ?)
           ON CONFLICT (track) DO UPDATE SET updated_at = excluded.updated_at`,
        [track, now()]
      );
    }
  };
}
