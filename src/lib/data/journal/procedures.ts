/* The surgery journey area (phase 5 ticket 07, CONTEXT: "Procedure"). One
   record per procedure someone is going through, and nothing here assumes
   exactly one is active: two can run concurrently or in sequence, so every
   read is a list and every write names the procedure it is for.

   A procedure is not an Entry: no mood, dimension values or tags, and no
   regimen-episode reference, the same reasoning SideEffect and CycleEvent
   give for standing alone. It stores no day counter either - how far along
   recovery is is a question about the surgery date and today, answered
   above this seam by recoveryDay.ts (ADR-0010).

   The recovery checklist is not this area's own record type: it is an
   ordinary Checklist (checklists.ts) owned by the (kind, uuid) pair ticket
   05 built for exactly this, which is why `checklists` is a dependency
   below rather than a table here. The lazy create-on-first-item lives in
   checklists.ts next to the standalone list's own (ticket 11), so one file
   owns that rule; what this area adds is that deleting a procedure takes
   its checklist with it - the owner pair is not a foreign key, so no
   cascade would do it.

   Recovery photos are their own table (procedure_photo) rather than a third
   owner arm on `photo` (migrations.ts v13 explains why: `photo`'s
   exactly-one-owner CHECK cannot be widened in place). They carry both an
   owning procedure and their own date, unlike either existing photo table:
   a recovery photo belongs to one procedure the way hair_removal_photo
   belongs to one session, and is dated the way hair_photo is, because when
   in recovery it was taken is the whole point of it. The shared pipeline is
   reused unchanged: stagePhoto (photos.ts) writes the same normalized,
   metadata-stripped bytes through the same file-before-row order, and
   removeFilesOf reclaims them the same way on delete. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Checklist, ChecklistItem, ChecklistOwner, Milestone, Procedure } from '../types';
import type { AppointmentsArea } from './appointments';
import type { ChecklistsArea } from './checklists';
import type { PhotoFileStore } from '../photos/photo-file-store';
import type { MilestonesArea } from './milestones';
import { photosByMilestone, removeFilesOf, stagePhoto, type NormalizedPhoto } from './photos';
import { assertChanged, mintUuid, now } from './support';
import { todayEpochDay } from '../epochDay';

/** What a procedure's checklist is owned by. A plain string rather than an
    enum of one, matching ChecklistOwner's own deliberately open `kind`
    (types.ts). */
export const PROCEDURE_CHECKLIST_OWNER_KIND = 'procedure';

export const procedureChecklistOwner = (procedureId: string): ChecklistOwner => ({
  kind: PROCEDURE_CHECKLIST_OWNER_KIND,
  id: procedureId
});

export interface ProcedureInput {
  id?: string;
  name: string;
  /** Absent or null both mean no date set yet - a procedure record usually
      starts life at the consult. Passing null on an update clears a date
      that was set. */
  surgeryEpochDay?: number | null;
  /** Only on create, and only so a caller can make a procedure and its
      notes in one call; `setNotes` is how notes are edited afterwards, so
      an ordinary name/date edit cannot blank them by omission. */
  notes?: string;
}

/** One dated recovery photo. Its own shape rather than hairProgress.ts's
    HairPhoto or hairRemoval.ts's HairRemovalPhoto: it is the only photo in
    the app that carries both an owner and a date. */
export interface ProcedurePhoto {
  id: string;
  procedureId: string;
  epochDay: number;
  fileName: string;
}

/** One recovery photo a procedure holds, with the procedure named on it
    (phase 5 deepening ticket 21).

    It used to be two arms, the second being the procedure's consults. Those
    are appointments now (ticket 57, ADR-0066) and reach a day through
    `appointments.getDayRecords`, which names the procedure on them the same
    way this does - so a consult is reported once rather than by two sections
    of the same day. */
export interface ProcedureDayRecord {
  procedureId: string;
  procedureName: string;
  id: string;
  fileName: string;
}

export interface ProceduresArea {
  /** Every procedure, the ones with a surgery date first and oldest first,
      then the undated ones - which have nowhere to sort to but the end. */
  getProcedures(): Promise<Procedure[]>;
  /** Returns the procedure's id. Updating an unknown id throws. */
  upsertProcedure(input: ProcedureInput): Promise<string>;
  /** Idempotent. Takes the procedure's consults, photos, photo files and
      recovery checklist with it. */
  deleteProcedure(id: string): Promise<void>;
  /** The recovery log's free text, replaced whole. Its own call rather than
      a field on upsertProcedure, so the dates editor and the notes field
      cannot overwrite each other. */
  setNotes(id: string, notes: string): Promise<void>;
  /** Returns the consult's own id, which is what deleteConsult takes.
      Writes an appointment linked to this procedure (ticket 57): the same
      row the appointments screen creates, with the link filled in. */
  addConsult(procedureId: string, epochDay: number): Promise<string>;
  /** Idempotent. */
  deleteConsult(id: string): Promise<void>;
  /** A procedure's recovery photos, oldest first. */
  getPhotos(procedureId: string): Promise<ProcedurePhoto[]>;
  /** What a procedure put on one day (phase 5 deepening ticket 21): the
      recovery photos taken on it, carrying the procedure they belong to.
      Its consults are appointments now and reach a day through
      `appointments.getDayRecords` instead (ticket 57).

      Not the procedure itself. A procedure is a journey that runs for
      months, and a day view says what happened on a day rather than what
      was in progress across it - which is why a surgery reaches the day
      view as the milestone it already mints (ADR-0045) rather than as a
      second row here. */
  getDayRecords(epochDay: number): Promise<ProcedureDayRecord[]>;
  /** The day of the most recent consult or recovery photo, across every
      procedure, at or before `todayEpochDay`, or null if there is none
      (phase 8 features ticket 03, lastWrite.ts). Still reads the consults,
      unlike `getDayRecords` above: this is what the surgery hub row
      reports, and a journey whose only activity was booking the next visit
      has not gone quiet. Mirrors `getDayRecords`' other exclusion, though -
      a procedure's `surgeryEpochDay` reaches the day view as the milestone
      ADR-0045 mints, so it is not part of this area's own last write. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Normalizes nothing itself - `photo` must already be through
      normalizePhoto (photoPicking.ts), same as photos.ts's attach. Returns
      the new photo's id. Throws if the procedure is unknown. */
  addPhoto(procedureId: string, epochDay: number, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent. */
  deletePhoto(id: string): Promise<void>;
  /** The procedure's recovery checklist, or undefined until its first item
      creates one. Reads through checklists.ts's own path unchanged. */
  getChecklist(procedureId: string): Promise<Checklist | undefined>;
  /** Adds a user-authored item, creating the checklist on first use so no
      caller has to check whether it exists yet - the same shape ticket 11's
      addToStandaloneChecklist takes. Throws if the procedure is unknown. */
  addChecklistItem(procedureId: string, content: string): Promise<ChecklistItem>;
  /** Finds the transition milestone linked to this procedure, if one exists. */
  getMilestone(procedureId: string): Promise<Milestone | null>;
  /** Records or updates a transition milestone linked to this procedure (ADR-0045). */
  recordSurgeryMilestone(procedureId: string, options?: { name?: string; epochDay?: number }): Promise<string>;
}

type ProcedureRow = {
  id: number;
  uuid: string;
  name: string;
  surgery_epoch_day: number | null;
  notes: string;
};

export function makeProceduresArea(
  driver: SqliteDriver,
  files: PhotoFileStore,
  checklists: ChecklistsArea,
  milestones: MilestonesArea,
  appointments: AppointmentsArea
): ProceduresArea {
  const rowidOf = async (procedureId: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [procedureId]);
    if (rows.length === 0) throw new Error(`unknown procedure: ${procedureId}`);
    return rows[0].id;
  };

  return {
    async getProcedures() {
      // Undated last rather than first: `ORDER BY surgery_epoch_day` alone
      // would sort NULL to the front in SQLite, putting a procedure with no
      // date yet ahead of one already had.
      const rows = await driver.query<ProcedureRow>(
        `SELECT id, uuid, name, surgery_epoch_day, notes FROM procedure
         ORDER BY surgery_epoch_day IS NULL, surgery_epoch_day, id`
      );
      // The appointments that name a procedure, grouped by it and read in
      // one query rather than one per row - appointments.ts owns that table
      // now (ticket 57), and a consult is one of its rows with the link
      // filled in.
      const consults = await appointments.consultsByProcedure();

      return rows.map((row) => ({
        id: row.uuid,
        name: row.name,
        surgeryEpochDay: row.surgery_epoch_day,
        notes: row.notes,
        consults: consults.get(row.uuid) ?? []
      }));
    },

    async upsertProcedure(input) {
      const surgeryEpochDay = input.surgeryEpochDay ?? null;

      if (input.id) {
        const result = await driver.run(
          'UPDATE procedure SET name = ?, surgery_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.name, surgeryEpochDay, now(), input.id]
        );
        assertChanged(result, `procedure: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO procedure (uuid, name, surgery_epoch_day, notes, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.name, surgeryEpochDay, input.notes ?? '', now()]
      );
      return uuid;
    },

    async deleteProcedure(id) {
      // The photo rows are read before the delete cascades them away, so
      // their files can be reclaimed after - the same order deleteMilestone
      // keeps. The checklist needs its own delete: an owner pair is not a
      // foreign key, so nothing cascades it.
      const photos = await driver.query<{ file_path: string }>(
        'SELECT p.file_path AS file_path FROM procedure_photo p JOIN procedure r ON r.id = p.procedure_id WHERE r.uuid = ?',
        [id]
      );
      const checklist = await checklists.getChecklistByOwner(procedureChecklistOwner(id));

      await driver.run('UPDATE milestone SET procedure_id = NULL WHERE procedure_id = ?', [id]);
      await driver.run('DELETE FROM procedure WHERE uuid = ?', [id]);
      if (checklist) await checklists.deleteChecklist(checklist.id);
      await removeFilesOf(files, photos);
    },

    async setNotes(id, notes) {
      const result = await driver.run('UPDATE procedure SET notes = ?, updated_at = ? WHERE uuid = ?', [
        notes,
        now(),
        id
      ]);
      assertChanged(result, `procedure: ${id}`);
    },

    /* The one read in this area that still selects from `appointment`
       itself, against the rule the writes below follow. Deliberate: the
       last-write registry budgets one query per registered area
       (lastWrite.test.ts, "the assembled read costs one query per
       registered area"), and asking appointments.ts for the consult half
       and taking MAX in JS costs two. A union of two MAXes is what fits
       that budget, and the budget is a documented repo standard, so it
       wins over the ownership line. Nothing here writes. */
    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        `SELECT MAX(day) AS day FROM (
           SELECT epoch_day AS day FROM appointment WHERE procedure_id IS NOT NULL
           UNION ALL
           SELECT epoch_day AS day FROM procedure_photo
         ) WHERE day <= ?`,
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    /* Both of these go through appointments.ts rather than writing the
       table here: one writer for one table is what keeps the delete
       contract and the blank-is-null rule from having a second opinion
       (ADR-0053, ADR-0066). What the surgery screen adds is only that the
       procedure link is filled in. */
    addConsult(procedureId, epochDay) {
      return appointments.upsertAppointment({ epochDay, procedureId, kind: null, place: null, note: null });
    },

    deleteConsult(id) {
      return appointments.deleteAppointment(id);
    },

    async getPhotos(procedureId) {
      const rows = await driver.query<{ uuid: string; epoch_day: number; file_path: string }>(
        `SELECT p.uuid AS uuid, p.epoch_day AS epoch_day, p.file_path AS file_path
         FROM procedure_photo p
         JOIN procedure r ON r.id = p.procedure_id
         WHERE r.uuid = ?
         ORDER BY p.epoch_day, p.id`,
        [procedureId]
      );
      return rows.map((row) => ({ id: row.uuid, procedureId, epochDay: row.epoch_day, fileName: row.file_path }));
    },

    /* One query rather than one per procedure: a day view that walked the
       procedures and asked each for its photos would cost a round trip per
       journey being tracked, on a day where almost always none of them has
       anything. */
    async getDayRecords(epochDay) {
      const photos = await driver.query<{
        uuid: string;
        file_path: string;
        procedure_uuid: string;
        procedure_name: string;
      }>(
        `SELECT p.uuid AS uuid, p.file_path AS file_path, r.uuid AS procedure_uuid, r.name AS procedure_name
           FROM procedure_photo p JOIN procedure r ON r.id = p.procedure_id
          WHERE p.epoch_day = ?
          ORDER BY p.id`,
        [epochDay]
      );
      return photos.map(
        (row): ProcedureDayRecord => ({
          id: row.uuid,
          fileName: row.file_path,
          procedureId: row.procedure_uuid,
          procedureName: row.procedure_name
        })
      );
    },

    async addPhoto(procedureId, epochDay, photo) {
      const procedureRowId = await rowidOf(procedureId);

      // Files first (photos.ts's own rule): the row must never name a file
      // that has not landed.
      const staged = await stagePhoto(files, photo);
      await driver.run(
        'INSERT INTO procedure_photo (uuid, procedure_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [staged.id, procedureRowId, epochDay, staged.fileName, now()]
      );
      return staged.id;
    },

    async deletePhoto(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM procedure_photo WHERE uuid = ?', [
        id
      ]);
      await driver.run('DELETE FROM procedure_photo WHERE uuid = ?', [id]);
      await removeFilesOf(files, rows);
    },

    getChecklist(procedureId) {
      return checklists.getChecklistByOwner(procedureChecklistOwner(procedureId));
    },

    async addChecklistItem(procedureId, content) {
      await rowidOf(procedureId);
      return checklists.addToOwnedChecklist(procedureChecklistOwner(procedureId), content);
    },

    async getMilestone(procedureId) {
      const rows = await driver.query<{
        id: number;
        uuid: string;
        name: string;
        epoch_day: number;
        description: string;
        template_key: string | null;
        procedure_id: string | null;
      }>(
        'SELECT id, uuid, name, epoch_day, description, template_key, procedure_id FROM milestone WHERE procedure_id = ? LIMIT 1',
        [procedureId]
      );
      if (rows.length === 0) return null;
      const photos = await photosByMilestone(driver);
      return {
        id: rows[0].uuid,
        name: rows[0].name,
        epochDay: rows[0].epoch_day,
        description: rows[0].description,
        templateKey: rows[0].template_key,
        procedureId: rows[0].procedure_id,
        photo: photos.get(rows[0].id) ?? null
      };
    },

    async recordSurgeryMilestone(procedureId, options) {
      const rows = await driver.query<ProcedureRow>(
        'SELECT id, uuid, name, surgery_epoch_day, notes FROM procedure WHERE uuid = ?',
        [procedureId]
      );
      if (rows.length === 0) throw new Error(`unknown procedure: ${procedureId}`);
      const procedure = rows[0];

      const name = options?.name?.trim() || procedure.name;
      const epochDay = options?.epochDay ?? procedure.surgery_epoch_day ?? todayEpochDay();

      const existing = await driver.query<{ uuid: string }>(
        'SELECT uuid FROM milestone WHERE procedure_id = ?',
        [procedureId]
      );

      if (existing.length > 0) {
        const existingId = existing[0].uuid;
        await milestones.upsertMilestone({
          id: existingId,
          name,
          epochDay,
          templateKey: 'surgery',
          procedureId
        });
        return existingId;
      }

      return milestones.upsertMilestone({
        name,
        epochDay,
        templateKey: 'surgery',
        procedureId
      });
    }
  };
}
