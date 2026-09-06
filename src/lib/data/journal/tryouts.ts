/* Tryouts (phase 4 ticket 16, widened past name/pronoun by phase 5 ticket
   13, CONTEXT: "Tryout"). Two tables, one area - the same shape
   doubtJournal.ts uses for its snapshots - since a tryout's own fields and
   its photos belong to the same screen and nothing reads one without the
   other.

   Which entries fall inside a tryout's date range is not read through
   here: it is an ordinary date-range search
   (entries.searchEntries('', [], { startEpochDay, endEpochDay })), the
   same filter the search screen's date chip already produces. This area
   only owns what it alone writes - the tryout's own fields and its photos.

   A tryout's felt-sense history lives in feltSense.ts instead (CONTEXT:
   "Felt-sense entry"), phase 5 ticket 24: once a milestone could own one
   too, felt-sense stopped being a fact about tryouts alone, the same
   reasoning photos.ts gives for owning entry and milestone photos in one
   place rather than each in the module that happens to use them.

   Tryout photos are their own table (tryout_photo) rather than a third
   owner arm on `photo`, the same reasoning procedures.ts gives for
   procedure_photo: `photo`'s exactly-one-owner CHECK cannot be widened in
   place (schema.ts). The shared pipeline is reused unchanged:
   stagePhoto (photos.ts) writes the same normalized, metadata-stripped
   bytes through the same file-before-row order, and removeFilesOf
   reclaims them the same way on delete. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Tryout, TryoutKind, TryoutPhoto } from '../types';
import type { PhotoFileStore } from '../photos/photo-file-store';
import type { MilestonesArea } from './milestones';
import type { FeltSenseArea } from './feltSense';
import { todayEpochDay } from '../epochDay';
import { removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

interface TryoutInput {
  id?: string;
  kind: TryoutKind;
  label: string;
  description?: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
}

interface AdoptTryoutOptions {
  endEpochDay?: number;
  createMilestone?: boolean;
  milestoneTitle?: string;
  milestoneEpochDay?: number;
}

interface AdoptTryoutResult {
  tryoutId: string;
  milestoneId?: string;
}

/** A tryout photo read without knowing whose it is, so it can say which
    tryout it was taken for (phase 5 deepening ticket 21) - the same reason
    feltSense.ts's own day read carries its owner. */
export interface TryoutPhotoOnDay extends TryoutPhoto {
  tryoutLabel: string;
}

export interface TryoutsArea {
  /** Most recently started first: several tryouts can be open at once, and
      the one someone just started is what they came here to check on. */
  getTryouts(): Promise<Tryout[]>;
  /** Returns the tryout's id. Updating an unknown id throws. */
  upsertTryout(input: TryoutInput): Promise<string>;
  /** Idempotent. Takes the tryout's felt-sense history and photos with it. */
  deleteTryout(id: string): Promise<void>;
  /** A tryout's photos, oldest first. */
  getPhotos(tryoutId: string): Promise<TryoutPhoto[]>;
  /** The tryout photos taken on one day, whichever tryout they belong to
      (phase 5 deepening ticket 21), each carrying that tryout's label.

      The photos and not the tryout: a tryout runs across a stretch of days
      and a day view says what happened on one, so what reaches it from here
      is the dated record, and how the tryout itself felt that day reaches it
      through `feltSense.onDay`. */
  getPhotosOnDay(epochDay: number): Promise<TryoutPhotoOnDay[]>;
  /** The day of the most recent tryout photo, across every tryout, at or
      before `todayEpochDay`, or null if there is none (phase 8 features
      ticket 03, lastWrite.ts). The same exclusion `getPhotosOnDay` makes: a
      tryout's own start/end days are a span, not a dated write, and its
      felt-sense history is `feltSenseEntries`' own registered area. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Normalizes nothing itself - `photo` must already be through
      normalizePhoto (photoPicking.ts), same as photos.ts's attach. Returns
      the new photo's id. Throws if the tryout is unknown. */
  addPhoto(tryoutId: string, epochDay: number, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
  /** Adopts a tryout permanently: closes it on `endEpochDay` (defaults to
      today) and optionally mints a timeline milestone with the tryout's
      felt-sense summary attached. */
  adoptTryout(id: string, options?: AdoptTryoutOptions): Promise<AdoptTryoutResult>;
}

type TryoutRow = {
  uuid: string;
  kind: TryoutKind;
  label: string;
  description: string | null;
  start_epoch_day: number;
  end_epoch_day: number | null;
};

const toTryout = (row: TryoutRow): Tryout => ({
  id: row.uuid,
  kind: row.kind,
  label: row.label,
  description: row.description,
  startEpochDay: row.start_epoch_day,
  endEpochDay: row.end_epoch_day
});

export function makeTryoutsArea(
  driver: SqliteDriver,
  files: PhotoFileStore,
  milestones?: MilestonesArea,
  feltSense?: FeltSenseArea
): TryoutsArea {
  return {
    async getTryouts() {
      const rows = await driver.query<TryoutRow>(
        'SELECT uuid, kind, label, description, start_epoch_day, end_epoch_day FROM tryout ORDER BY start_epoch_day DESC, id DESC'
      );
      return rows.map(toTryout);
    },

    async upsertTryout(input) {
      const label = input.label.trim();
      if (label.length === 0) throw new Error('a tryout needs a label');
      const description = input.description?.trim() || null;

      if (input.id) {
        const result = await driver.run(
          'UPDATE tryout SET kind = ?, label = ?, description = ?, start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.kind, label, description, input.startEpochDay, input.endEpochDay, now(), input.id]
        );
        assertChanged(result, `tryout: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO tryout (uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid, input.kind, label, description, input.startEpochDay, input.endEpochDay, now()]
      );
      return uuid;
    },

    async deleteTryout(id) {
      // Read before the transaction, the same order deleteMilestone keeps:
      // a failed file removal must never resurrect the rows just committed
      // gone.
      const photos = await driver.query<{ file_path: string }>(
        'SELECT file_path FROM tryout_photo WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)',
        [id]
      );
      await driver.transaction(async () => {
        // Unlinked before the tryout row goes, the same order procedures.ts
        // keeps for procedure_id: milestone.tryout_id references tryout(uuid)
        // with no ON DELETE clause, so the FK would refuse the delete
        // otherwise, and a milestone this adoption minted is preserved on
        // the timeline rather than taken down with the tryout it came from
        // (ADR-0045).
        await driver.run('UPDATE milestone SET tryout_id = NULL WHERE tryout_id = ?', [id]);
        await driver.run('DELETE FROM felt_sense WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM tryout_photo WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)', [id]);
        await driver.run('DELETE FROM tryout WHERE uuid = ?', [id]);
      });
      await removeFilesOf(files, photos);
    },

    async getPhotos(tryoutId) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; file_path: string }>(
        `SELECT p.uuid AS uuid, p.epoch_day AS epoch_day, p.file_path AS file_path
         FROM tryout_photo p
         JOIN tryout t ON t.id = p.tryout_id
         WHERE t.uuid = ?
         ORDER BY p.epoch_day, p.id`,
        [tryoutId]
      );
      return rows.map((row) => ({ id: row.uuid, tryoutId, epochDay: row.epoch_day, fileName: row.file_path }));
    },

    async getPhotosOnDay(epochDay) {
      const rows = await driver.query<{ uuid: string; file_path: string; tryout_uuid: string; tryout_label: string }>(
        `SELECT p.uuid AS uuid, p.file_path AS file_path, t.uuid AS tryout_uuid, t.label AS tryout_label
           FROM tryout_photo p JOIN tryout t ON t.id = p.tryout_id
          WHERE p.epoch_day = ?
          ORDER BY p.id`,
        [epochDay]
      );
      return rows.map((row) => ({
        id: row.uuid,
        tryoutId: row.tryout_uuid,
        tryoutLabel: row.tryout_label,
        epochDay,
        fileName: row.file_path
      }));
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM tryout_photo WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    async addPhoto(tryoutId, epochDay, photo) {
      const tryoutRowId = await rowidByUuid(driver, 'tryout', tryoutId);

      // Files first (photos.ts's own rule): the row must never name a file
      // that has not landed.
      const staged = await stagePhoto(files, photo);
      await driver.run(
        'INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [staged.id, tryoutRowId, epochDay, staged.fileName, now()]
      );
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM tryout_photo WHERE uuid = ?', [
        id
      ]);
      await driver.run('DELETE FROM tryout_photo WHERE uuid = ?', [id]);
      await removeFilesOf(files, rows);
    },

    async adoptTryout(id, options) {
      const rows = await driver.query<TryoutRow>(
        'SELECT uuid, kind, label, description, start_epoch_day, end_epoch_day FROM tryout WHERE uuid = ?',
        [id]
      );
      if (!rows[0]) throw new Error(`unknown tryout: ${id}`);
      const tryout = toTryout(rows[0]);

      const endEpochDay = options?.endEpochDay ?? todayEpochDay();
      const result = await driver.run(
        'UPDATE tryout SET end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
        [endEpochDay, now(), id]
      );
      assertChanged(result, `tryout: ${id}`);

      let milestoneId: string | undefined = undefined;

      if (options?.createMilestone) {
        const milestoneEpochDay = options.milestoneEpochDay ?? endEpochDay;
        const milestoneTitle = options.milestoneTitle?.trim() || tryout.label;

        if (milestones) {
          milestoneId = await milestones.upsertMilestone({
            name: milestoneTitle,
            epochDay: milestoneEpochDay,
            tryoutId: id
          });
        } else {
          milestoneId = mintUuid();
          await driver.run(
            'INSERT INTO milestone (uuid, name, epoch_day, template_key, tryout_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [milestoneId, milestoneTitle, milestoneEpochDay, null, id, now()]
          );
        }

        const feltSenseRows = await driver.query<{ mood: number; note: string | null }>(
          `SELECT f.mood, f.note
             FROM felt_sense f JOIN tryout t ON t.id = f.tryout_id
            WHERE t.uuid = ?
            ORDER BY f.epoch_day DESC, f.id DESC`,
          [id]
        );

        if (feltSenseRows.length > 0) {
          const counts = new Map<number, number>();
          for (const f of feltSenseRows) {
            counts.set(f.mood, (counts.get(f.mood) ?? 0) + 1);
          }
          let majorityMood = feltSenseRows[0].mood;
          let maxCount = -1;
          for (let m = 1; m <= 5; m++) {
            const c = counts.get(m) ?? 0;
            if (c > maxCount) {
              maxCount = c;
              majorityMood = m;
            }
          }

          const summaryNote = feltSenseRows.find((f) => f.note?.trim())?.note ?? null;
          if (feltSense) {
            await feltSense.add(
              { milestoneId },
              { epochDay: milestoneEpochDay, mood: majorityMood, note: summaryNote }
            );
          } else {
            const milestoneRowId = await rowidByUuid(driver, 'milestone', milestoneId);
            const fsUuid = mintUuid();
            await driver.run(
              'INSERT INTO felt_sense (uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [fsUuid, null, milestoneRowId, milestoneEpochDay, majorityMood, summaryNote, now()]
            );
          }
        }
      }

      return { tryoutId: id, milestoneId };
    }
  };
}

export async function adoptTryout(
  journal: { tryouts: TryoutsArea },
  tryoutId: string,
  options?: AdoptTryoutOptions
): Promise<AdoptTryoutResult> {
  return journal.tryouts.adoptTryout(tryoutId, options);
}
