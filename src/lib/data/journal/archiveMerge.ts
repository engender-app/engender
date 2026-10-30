/* What an archive Merge decides for each row, and the deletions it carries
   (functional audit ticket 48, ADR draft-archive-merge-keeps-the-newer-copy).

   Until this ticket a Merge added what this device did not have and left
   every matched row alone, so an edit made on the other device never
   arrived, and neither did a deletion. Now each row travels with its
   `updated_at`, and a row present on both sides takes the side that wrote
   it last. A deletion travels as a row of the `deletion` table (schema
   version 116, sqlite/deletion-migration.ts): the table, the record's
   identity and when it went.

   Every table in the schema has one Merge class, below:

     updatedAt  the row carries its own `updated_at` and is matched by its
                identity - a uuid, a built-in's key, or the natural key of
                a table that holds one row per thing. Its deletions are
                recorded by a trigger and carried.
     parent     a join or child row with no identity of its own. It follows
                its parent: when the parent is taken from the archive, its
                rows are taken with it, and when the parent stays, so do
                they.
     none       not part of what a Merge compares, and why.

   archiveMerge.test.ts fails on a table with no class, so a table added
   later cannot be left out of Merge without a test saying so.

   The rule for one row (`RowGate.fate`):

     - present on both sides: the archive's row wins only when it is newer.
       A tie keeps this device's row, which is what makes merging the same
       archive twice the same as merging it once. An archive written before
       this ticket carries no `updatedAt`, and its rows never win.
     - only in the archive: inserted, unless this device deleted it at or
       after the archive's last write of it.
     - a deletion in the archive: applied when this device's row is not newer
       than it, and recorded either way it is applied, so a third device
       hears of it too.

   A row the archive wins keeps the archive's `updated_at` rather than
   taking this device's clock: stamping it now would make the copy look
   newer than an edit the first device makes after the export, and that
   edit would lose the next Merge. The clocks of two devices are trusted to
   be roughly right; what that costs, and the old argument for skipping
   matched rows instead, are in the ADR. */

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
  entry_template: keyOrUuid,
  entry_template_dimension_value: parent('entry_template'),
  entry_template_tag: parent('entry_template'),
  era: uuid,
  era_mute: column('era_uuid'),
  felt_sense: uuid,
  gender_dimension: column('key'),
  gender_preset: keyOrUuid,
  hair_photo: uuid,
  hair_removal_photo: uuid,
  hair_removal_session: uuid,
  hair_stage: uuid,
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
  tally_event: uuid,
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
export type RowFate = 'insert' | 'update' | 'keep';

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
    own (milestone.procedure_id, milestone.tryout_id, entry.presentation_id,
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

/** The archive's deletions. Replace installs them as they are, so the
    restored journal goes on refusing what the archived one had deleted.
    Merge applies each one that is newer than this device's row, by the rule
    in the header, and records it either way. A deletion naming a table this
    build does not classify (one from a newer or an older schema) is left
    out.

    The first section the registry applies, and so the last it discards: a
    Replace's discard fires the trigger for every row it removes, and this
    section's own statement clears what that recorded. In a Merge, applying
    the deletions before the rows means every archive row then meets this
    device's deletions and the archive's alike, through the same RowGate. */
export async function applyDeletions({ driver, mode, journal }: Restoring): Promise<void> {
  for (const deletion of journal.deletions) {
    if (MERGE_CLASSES[deletion.table]?.by !== 'updatedAt') continue;
    const [prior] = await driver.query<{ deleted_at: number }>(
      'SELECT deleted_at FROM deletion WHERE tbl = ? AND row_key = ?', [deletion.table, deletion.id]
    );
    if (mode === 'merge') {
      const identity = identityOf(deletion.table)('');
      const [row] = await driver.query<{ updated_at: number }>(
        `SELECT updated_at FROM ${deletion.table} WHERE ${identity} = ?`, [deletion.id]
      );
      if (row && row.updated_at > deletion.deletedAt) continue;
      if (row) {
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
