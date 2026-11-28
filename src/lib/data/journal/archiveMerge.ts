/* Merge rows and tombstones by traveling identity and timestamp
   (ADR-0098). Updated rows keep their updated_at. Child rows without
   identity follow their parent. Tables outside the comparison have an
   explicit class and reason. Tests check every table is classified.

   Take a matched Archive row only when it is newer. A tie keeps this
   device's row, and legacy rows without a timestamp never replace it.
   Insert a new row unless the destination deleted it at or after its
   write. Apply an Archive deletion when the local row is no newer.
   Retain the tombstone even when there is no row to remove.

   Keep the incoming timestamp so it cannot mask a later source edit.
   The comparison depends on both devices' clocks. */

import type { SqliteDriver } from '../sqlite/driver';
import type { ArchiveDeletion } from '../archive/payload';
import type { Restoring } from './archiveApply';

type Identity = (prefix: string) => string;

export type MergeClass =
  | { by: 'updatedAt'; identity: Identity }
  | { by: 'parent'; parent: string }
  | { by: 'none'; why: string };

const column = (name: string): MergeClass => ({ by: 'updatedAt', identity: (p) => `${p}${name}` });
const uuid = column('uuid');
/** A built-in by its key, a custom one by its uuid (ADR-0002). */
const keyOrUuid: MergeClass = { by: 'updatedAt', identity: (p) => `COALESCE(${p}key, ${p}uuid)` };
const parent = (table: string): MergeClass => ({ by: 'parent', parent: table });

export const MERGE_CLASSES: Readonly<Record<string, MergeClass>> = {
  appointment: uuid,
  appointment_debrief: { by: 'none', why: 'device-local: it names an entry row this device holds, which another device cannot adopt' },
  appointment_status: uuid,
  area_state: column('area'),
  body_region: keyOrUuid,
  checklist: uuid,
  checklist_item: uuid,
  comfort_item: uuid,
  cycle_event: uuid,
  deletion: { by: 'none', why: 'the deletions themselves, applied by applyDeletions' },
  document: uuid,
  dose_event: uuid,
  dose_pause: uuid,
  dose_schedule: uuid,
  dose_schedule_dose_amount: parent('dose_schedule'),
  dose_schedule_weekday: parent('dose_schedule'),
  effect_category: column('key'),
  entry: uuid,
  entry_body_region: parent('entry'),
  entry_dimension_value: parent('entry'),
  entry_fts: { by: 'none', why: 'the search index, rewritten from its entry' },
  entry_fts_config: { by: 'none', why: "the search index's own storage" },
  entry_fts_data: { by: 'none', why: "the search index's own storage" },
  entry_fts_docsize: { by: 'none', why: "the search index's own storage" },
  entry_fts_idx: { by: 'none', why: "the search index's own storage" },
  entry_tag: parent('entry'),
  era: uuid,
  era_mute: column('era_uuid'),
  felt_sense: uuid,
  gender_dimension: column('key'),
  gender_preset: keyOrUuid,
  hair_removal_photo: uuid,
  hair_removal_session: uuid,
  import_log: uuid,
  lab_result: uuid,
  letter: uuid,
  margin_note: uuid,
  medication_stock: column('drug_key'),
  milestone: uuid,
  personal_effect: column('effect'),
  personal_effect_type: column('key'),
  photo: uuid,
  pref: { by: 'none', why: "preferences travel beside the journal, and a Merge keeps this device's (ADR-0003)" },
  presentation: uuid,
  preset_dimension: parent('gender_preset'),
  procedure: uuid,
  procedure_photo: uuid,
  progress_photo: uuid,
  progress_pose: keyOrUuid,
  provider: uuid,
  regimen_episode: uuid,
  reminder: uuid,
  roadmap_category: uuid,
  // A newline joins the pair because neither key can hold one.
  roadmap_check: { by: 'updatedAt', identity: (p) => `${p}pack_key || char(10) || ${p}goal_key` },
  roadmap_goal: uuid,
  roadmap_institution: uuid,
  roadmap_institution_change: uuid,
  side_effect: uuid,
  tag: keyOrUuid,
  tag_group: column('key'),
  taper: uuid,
  taper_session: uuid,
  tryout: uuid,
  tryout_photo: uuid,
  video_note: uuid,
  voice_benchmark: uuid,
  voice_practice_take: uuid,
  voice_recording: uuid,
  wear_session: uuid
};

/** The roadmap check's identity as it travels, the pair the class above
    joins. */
export const roadmapCheckId = (packKey: string, goalKey: string): string => `${packKey}\n${goalKey}`;

function identityOf(table: string): Identity {
  const merge = MERGE_CLASSES[table];
  if (merge?.by !== 'updatedAt') throw new Error(`${table} has no identity a Merge can match rows by`);
  return merge.identity;
}

/** What happens to one archive row: written as a new row, written over this
    device's, or left out because this device's copy (or its deletion) is
    the newer. */
type RowFate = 'insert' | 'update' | 'keep';

export interface RowGate {
  fate(id: string, updatedAt: number | undefined): RowFate;
  /** The archive's row has just been written; a second row with the same
      identity later in the same import meets it as present. */
  wrote(id: string, updatedAt: number): void;
}

/** One table's present rows and deletions, read once, deciding each
    archive row's fate by the rule in the header. Replace has emptied the
    table of everything but built-ins before this is read, and writes the
    archive's state over those, so it only ever inserts or updates.

    `identity` is the table's class unless a flat descriptor names its own
    column (archiveTable.ts), which is the same column for every table the
    registry declares. */
export async function rowGate(
  { driver, mode }: Pick<Restoring, 'driver' | 'mode'>,
  table: string,
  identity: string = identityOf(table)('')
): Promise<RowGate> {
  const rows = await driver.query<{ id: string; updated_at: number }>(`SELECT ${identity} AS id, updated_at FROM ${table}`);
  const present = new Map(rows.map((row) => [row.id, row.updated_at]));
  const deleted = new Map(
    (await driver.query<{ row_key: string; deleted_at: number }>(
      'SELECT row_key, deleted_at FROM deletion WHERE tbl = ?', [table]
    )).map((row) => [row.row_key, row.deleted_at])
  );
  return {
    fate(id, updatedAt) {
      const local = present.get(id);
      if (mode === 'replace') return local === undefined ? 'insert' : 'update';
      if (local !== undefined) return updatedAt !== undefined && updatedAt > local ? 'update' : 'keep';
      const gone = deleted.get(id);
      return gone !== undefined && (updatedAt === undefined || updatedAt <= gone) ? 'keep' : 'insert';
    },
    wrote(id, updatedAt) {
      present.set(id, updatedAt);
    }
  };
}

/** Every deletion this journal has recorded, oldest first. */
export async function readDeletions({ driver }: { driver: Pick<SqliteDriver, 'query'> }): Promise<ArchiveDeletion[]> {
  const rows = await driver.query<{ tbl: string; row_key: string; deleted_at: number }>(
    'SELECT tbl, row_key, deleted_at FROM deletion ORDER BY deleted_at, id'
  );
  return rows.map((row) => ({ table: row.tbl, id: row.row_key, deletedAt: row.deleted_at }));
}

/** The references to `table` that neither cascade nor set null on their
    own (milestone.procedure_uuid, milestone.tryout_uuid, entry.presentation_uuid,
    personal_effect_type.category_key), each as the statement that unlinks
    one record's children. The areas' own deletes unlink them by hand
    (procedures.ts, tryouts.ts) without touching the child's `updated_at`,
    and a Merge applying the same deletion does the same. */
async function unlinkStatements(driver: SqliteDriver, table: string): Promise<string[]> {
  const identity = identityOf(table)('');
  const references = await driver.query<{ child: string; from: string; to: string | null }>(
    `SELECT m.name AS child, f."from" AS "from", f."to" AS "to"
       FROM sqlite_master m, pragma_foreign_key_list(m.name) f
      WHERE m.type = 'table' AND f."table" = ? AND f.on_delete = 'NO ACTION'`,
    [table]
  );
  return references.map(({ child, from, to }) =>
    `UPDATE ${child} SET ${from} = NULL WHERE ${from} = (SELECT ${to ?? 'rowid'} FROM ${table} WHERE ${identity} = ?)`
  );
}

/** Which rows of a table are built-ins: the rows a Replace keeps
    (archiveSections.ts discards only the others). No area deletes one - a
    built-in tag hides instead (tags.ts), and every effect category is
    built in - and reconcile seeds a missing one back on the next open, so a
    deletion naming one is something only a hand-edited archive carries. */
const BUILT_IN: Readonly<Record<string, string>> = {
  body_region: 'key IS NOT NULL',
  effect_category: '1',
  gender_dimension: 'is_built_in = 1',
  gender_preset: 'key IS NOT NULL',
  personal_effect_type: 'is_built_in = 1',
  progress_pose: 'key IS NOT NULL',
  tag: 'key IS NOT NULL',
  tag_group: 'uuid IS NULL'
};

/**
 * Restore tombstones before applying rows. Replace keeps the imported
 * set and clears tombstones its own discard produced. Merge applies
 * a deletion when the local row is no newer and records it even when
 * there is no row to remove.
 *
 * Skip tables outside this build's classification. In Merge, skip
 * tombstones for reconciled built-ins, which may still have dependent
 * rows. Apply all row decisions through RowGate.
 */
export async function applyDeletions({ driver, mode, journal }: Restoring): Promise<void> {
  for (const deletion of journal.deletions) {
    if (MERGE_CLASSES[deletion.table]?.by !== 'updatedAt') continue;
    const [prior] = await driver.query<{ deleted_at: number }>(
      'SELECT deleted_at FROM deletion WHERE tbl = ? AND row_key = ?', [deletion.table, deletion.id]
    );
    if (mode === 'merge') {
      const identity = identityOf(deletion.table)('');
      const builtIn = BUILT_IN[deletion.table];
      if (builtIn && (await driver.query(
        `SELECT 1 FROM ${deletion.table} WHERE ${identity} = ? AND ${builtIn}`, [deletion.id]
      )).length > 0) continue;
      const [row] = await driver.query<{ updated_at: number }>(
        `SELECT updated_at FROM ${deletion.table} WHERE ${identity} = ?`, [deletion.id]
      );
      // A row written here after the deletion stays; the marker is still
      // recorded below, so this device's next archive carries it on.
      if (row && row.updated_at <= deletion.deletedAt) {
        for (const unlink of await unlinkStatements(driver, deletion.table)) await driver.run(unlink, [deletion.id]);
        await driver.run(`DELETE FROM ${deletion.table} WHERE ${identity} = ?`, [deletion.id]);
      }
    }
    // The trigger stamped that delete with this device's clock; the
    // deletion happened when the archive says it did, or when this device
    // had already recorded it, whichever is later.
    await driver.run(
      `INSERT INTO deletion (tbl, row_key, deleted_at) VALUES (?, ?, ?)
         ON CONFLICT (tbl, row_key) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [deletion.table, deletion.id, Math.max(prior?.deleted_at ?? deletion.deletedAt, deletion.deletedAt)]
    );
  }
}
