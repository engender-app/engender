/* The hair-removal session area (phase 5 ticket 08, CONTEXT: pending). A
   session is not an Entry: no mood, dimension values, tags or note, and no
   regimen-episode reference - the same reasoning SideEffect and CycleEvent
   give for standing alone.

   A session's photos are their own table (hair_removal_photo) rather than a
   third owner arm on `photo` (migrations.ts v13 explains why for hair_photo:
   SQLite cannot widen that table's exactly-one-owner CHECK without a full
   rebuild). Unlike hair_photo, though, a session photo genuinely belongs to
   one session - a before/after picture of that treatment, not an
   independently dated series - so hair_removal_photo carries a session_id
   foreign key and is read and applied as the session's own nested children
   (archiveRead.ts/archiveApply.ts, modeled on checklist/checklist_item
   rather than on hair_stage/hair_photo's disjoint pair). The shared pipeline
   is still reused exactly as the ticket asks: stagePhoto (photos.ts) writes
   the same normalized, metadata-stripped bytes through the same
   file-before-row order, and removeFilesOf reclaims them the same way on
   delete. */

import type { SqliteDriver } from '../sqlite/driver';
import { HAIR_REMOVAL_AREAS, type HairRemovalAreaKey } from '../hairRemovalAreas';
import type { HairRemovalMethod, HairRemovalSession } from '../types';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import type { PhotoFileStore } from './journal';
import { assertChanged, mintUuid, now } from './support';

export const MIN_PAIN_RATING = 1;
export const MAX_PAIN_RATING = 5;

export interface HairRemovalSessionInput {
  id?: string;
  epochDay: number;
  area: string;
  method: HairRemovalMethod;
  painRating: number;
  cost?: string;
  provider?: string;
}

/** One photo attached to a hair-removal session. Its own shape rather than
    photos.ts's DatedPhoto or hairProgress.ts's HairPhoto: it carries its
    owning session's id rather than its own date, since (unlike a hair
    photo) it has no date of its own to carry - a session's date is enough. */
export interface HairRemovalPhoto {
  id: string;
  sessionId: string;
  fileName: string;
}

export interface HairRemovalArea {
  /** Every session, oldest first. */
  getSessions(): Promise<HairRemovalSession[]>;
  /** The sessions on one day (phase 5 deepening ticket 21). */
  getSessionsOnDay(epochDay: number): Promise<HairRemovalSession[]>;
  /** Returns the session's id. Updating an unknown id throws; an
      out-of-range pain rating or an area outside the closed vocabulary
      throws before anything is written. */
  upsertSession(input: HairRemovalSessionInput): Promise<string>;
  /** Idempotent. Its photos go with it (ON DELETE CASCADE). */
  deleteSession(id: string): Promise<void>;
  /** A session's photos, oldest first. */
  getPhotos(sessionId: string): Promise<HairRemovalPhoto[]>;
  /** Normalizes nothing itself - `photo` must already be through
      normalizePhoto (photoPicking.ts), same as photos.ts's attach. Returns
      the new photo's id. Throws if the session is unknown. */
  addPhoto(sessionId: string, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
}

type HairRemovalSessionRow = {
  uuid: string;
  epoch_day: number;
  area: string;
  method: HairRemovalMethod;
  pain_rating: number;
  cost: string;
  provider: string;
};
type HairRemovalPhotoRow = { uuid: string; session_id: number; file_path: string };

const toHairRemovalSession = (row: HairRemovalSessionRow): HairRemovalSession => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  area: row.area,
  method: row.method,
  painRating: row.pain_rating,
  cost: row.cost,
  provider: row.provider
});

/** The schema's CHECK is the backstop (like side_effect's severity); this is
    what turns a bad value into a message naming the vocabulary it broke
    instead of a raw SQLite constraint failure. */
function assertValidArea(area: string): void {
  if (!HAIR_REMOVAL_AREAS.includes(area as HairRemovalAreaKey)) {
    throw new Error(`invalid hair-removal area: ${area}`);
  }
}

function assertValidPainRating(painRating: number): void {
  if (!Number.isInteger(painRating) || painRating < MIN_PAIN_RATING || painRating > MAX_PAIN_RATING) {
    throw new Error(`invalid pain rating: ${painRating}`);
  }
}

export function makeHairRemovalArea(driver: SqliteDriver, files: PhotoFileStore): HairRemovalArea {
  return {
    async getSessions() {
      const rows = await driver.query<HairRemovalSessionRow>(
        'SELECT uuid, epoch_day, area, method, pain_rating, cost, provider FROM hair_removal_session ORDER BY epoch_day, id'
      );
      return rows.map(toHairRemovalSession);
    },

    async getSessionsOnDay(epochDay) {
      const rows = await driver.query<HairRemovalSessionRow>(
        'SELECT uuid, epoch_day, area, method, pain_rating, cost, provider FROM hair_removal_session WHERE epoch_day = ? ORDER BY id',
        [epochDay]
      );
      return rows.map(toHairRemovalSession);
    },

    async upsertSession(input) {
      assertValidArea(input.area);
      assertValidPainRating(input.painRating);
      const cost = input.cost ?? '';
      const provider = input.provider ?? '';

      if (input.id) {
        const result = await driver.run(
          `UPDATE hair_removal_session
           SET epoch_day = ?, area = ?, method = ?, pain_rating = ?, cost = ?, provider = ?, updated_at = ?
           WHERE uuid = ?`,
          [input.epochDay, input.area, input.method, input.painRating, cost, provider, now(), input.id]
        );
        assertChanged(result, `hair removal session: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, input.epochDay, input.area, input.method, input.painRating, cost, provider, now()]
      );
      return uuid;
    },

    async deleteSession(id) {
      await driver.run('DELETE FROM hair_removal_session WHERE uuid = ?', [id]);
    },

    async getPhotos(sessionId) {
      const rows = await driver.query<HairRemovalPhotoRow>(
        `SELECT p.uuid AS uuid, p.session_id AS session_id, p.file_path AS file_path
         FROM hair_removal_photo p
         JOIN hair_removal_session s ON s.id = p.session_id
         WHERE s.uuid = ?
         ORDER BY p.id`,
        [sessionId]
      );
      return rows.map((row) => ({ id: row.uuid, sessionId, fileName: row.file_path }));
    },

    async addPhoto(sessionId, photo) {
      const sessionRows = await driver.query<{ id: number }>('SELECT id FROM hair_removal_session WHERE uuid = ?', [
        sessionId
      ]);
      if (sessionRows.length === 0) throw new Error(`unknown hair removal session: ${sessionId}`);

      // Files first (photos.ts's own rule): the row must never name a file
      // that has not landed.
      const staged = await stagePhoto(files, photo);
      await driver.run('INSERT INTO hair_removal_photo (uuid, session_id, file_path, updated_at) VALUES (?, ?, ?, ?)', [
        staged.id,
        sessionRows[0].id,
        staged.fileName,
        now()
      ]);
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM hair_removal_photo WHERE uuid = ?', [
        id
      ]);
      await driver.run('DELETE FROM hair_removal_photo WHERE uuid = ?', [id]);
      await removeFilesOf(files, rows);
    }
  };
}
