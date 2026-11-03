/* How each archive section's rows are written back into the journal, wired
   into the registry by archiveSections.ts and run inside restore.ts's single
   transaction.

   A flat area with one identity needs no function here: applyFlatTable() writes it
   from the descriptor the registry declares (archiveTable.ts). What is left
   is the sections with more than one table or an owner to resolve - a
   child table walked in both modes, a rowid resolved against a section that
   ran earlier, a built-in matched by key.

   Which copy of a row wins is one rule for every table (archiveMerge.ts).
   What stays each section's own is the rest, for reasons the individual
   comments record - a roadmap check holds two facts in one row, a tag group
   walks its tags in both modes, an episode may hold only one schedule and a
   procedure one taper.

   The rules every one of them follows are archiveMerge.ts's: each row the
   archive carries asks a RowGate whether it is inserted, written over this
   device's copy (the archive's is newer) or left out (this device's copy,
   or its deletion of the row, is the newer), and a row written from the
   archive keeps the archive's `updatedAt`. `ts`, this device's clock, only
   stamps a row from an archive written before functional audit ticket 48,
   which carries none. A row with its own identity is gated on its own,
   nested or not (a photo, a status update, a checklist item); a join row
   follows its parent and is rewritten only when the parent is. A child
   whose parent this device has deleted is left out with it. */

import { foldText } from '../fold';
import { drugNameKey } from '../regimenEpisode';
import { STOCK_PREFIX, stockAutoSource } from '../autoSource';
import { LEGACY_ROADMAP_TRACKS, keptTick } from '../roadmap';
import type {
  ArchiveAppointment, ArchiveCostFields, ArchiveHairRemovalSession, ArchiveJournal, ArchiveStamped
} from '../archive/payload';
import { deviceDefaultCurrency, parseLegacyCostText } from '../cost';
import { appendLegacyCost } from '../sqlite/cost-migration';
import type { SqliteDriver } from '../sqlite/driver';
import { CorruptArchiveError } from '../archive/wire';
import type { RestoreMode } from './restore';
import { mintUuid, now, rowidWhere } from './support';
import { columnsOf, identityFieldOf, type FlatTable } from './archiveTable';
import { rowGate, roadmapCheckId, type RowGate } from './archiveMerge';

/** One import, mid-flight: the mode decides what happens to a row that is
    already here, and `ts` stamps every row it writes with the moment the
    import ran rather than with a clock reading from another device. */
export type Restoring = {
  driver: SqliteDriver;
  mode: RestoreMode;
  journal: ArchiveJournal;
  ts: number;
};

const flag = (value: boolean): number => (value ? 1 : 0);

/** The `updated_at` a row written from the archive carries: the archive's,
    or this import's clock for an archive written before it carried one. */
const stampOf = (row: ArchiveStamped, ts: number): number => row.updatedAt ?? ts;

/** Asks the gate about one archive row and, when the row is to be written,
    records that it was. */
function fateOf(gate: RowGate, id: string, row: ArchiveStamped, ts: number) {
  const fate = gate.fate(id, row.updatedAt);
  if (fate !== 'keep') gate.wrote(id, stampOf(row, ts));
  return fate;
}
const SQLITE_PARAM_LIMIT = 999;
const ID_CHUNK = 400;

function chunked<T>(rows: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let from = 0; from < rows.length; from += chunkSize) {
    chunks.push(rows.slice(from, from + chunkSize));
  }
  return chunks;
}

async function insertRows(
  driver: SqliteDriver,
  insertPrefix: string,
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): Promise<void> {
  if (rows.length === 0) return;

  const valueCount = rows[0].length;
  const rowsPerChunk = Math.max(1, Math.floor(SQLITE_PARAM_LIMIT / valueCount));
  const rowPlaceholders = `(${new Array(valueCount).fill('?').join(', ')})`;

  for (const chunk of chunked(rows, rowsPerChunk)) {
    const values = chunk.map(() => rowPlaceholders).join(', ');
    const params = chunk.flat();
    await driver.run(`${insertPrefix} VALUES ${values}`, params);
  }
}

async function rowidsByUuid(
  driver: SqliteDriver,
  table: 'entry' | 'milestone' | 'regimen_episode' | 'tryout',
  uuids: string[]
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (uuids.length === 0) return ids;

  for (const uuidChunk of chunked(uuids, ID_CHUNK)) {
    const placeholders = uuidChunk.map(() => '?').join(', ');
    const rows = await driver.query<{ id: number; uuid: string }>(
      `SELECT id, uuid FROM ${table} WHERE uuid IN (${placeholders})`,
      uuidChunk
    );
    for (const row of rows) ids.set(row.uuid, row.id);
  }

  return ids;
}

/** Which travelling ids a table already holds, as the domain id an archive
    names them by: the key of a built-in, the uuid of a custom (ADR-0002). */
async function presentIds(driver: SqliteDriver, sql: string): Promise<Set<string>> {
  const rows = await driver.query<{ id: string }>(sql);
  return new Set(rows.map((row) => row.id));
}

/** One flat row's column values, in `columnsOf` order. */
function flatValues<Row>(table: FlatTable<Row>, row: Row): unknown[] {
  const fields = row as Record<string, unknown>;
  return columnsOf(table).map(({ field, bool: isBool, whenAbsent }) => {
    const value = fields[field];
    if (isBool) return flag(value === true);
    if (value !== undefined) return value;
    return typeof whenAbsent === 'function' ? whenAbsent(row) : whenAbsent;
  });
}

/** A flat area's rows written back from the one descriptor that declares
    its columns (archiveTable.ts): each row the gate lets in, inserted new or
    written over this device's older copy, every column at once. The
    generic half of what used to be one hand-written applier per flat area.

    A row matched by a natural key (a stock row's drug, an area's state)
    keeps this device's uuid when it is written over: the key is what the
    two devices agree on.

    Takes the rows rather than the section's name, so the registry hands over
    `journal[name]` already typed as what `ArchiveJournal` says the section
    holds - the descriptor's compile-time link to the wire type would be lost
    to a lookup by string. */
export async function applyFlatTable<Row>(
  table: FlatTable<Row>,
  rows: readonly Row[],
  restoring: Restoring
): Promise<void> {
  const { driver, ts } = restoring;
  const columns = columnsOf(table);
  const identity = identityFieldOf(table);
  const gate = await rowGate(restoring, table.table, table.identity);
  const written = columns.map((c) => c.column !== table.identity && (table.identity === 'uuid' || c.column !== 'uuid'));
  // A table with no column besides its key (era_mute) is written over by its stamp alone.
  const assignments = [...columns.filter((_, i) => written[i]).map((c) => `${c.column} = ?`), 'updated_at = ?'].join(', ');

  const inserting: unknown[][] = [];
  for (const row of rows) {
    const stamped = row as Row & ArchiveStamped;
    const id = String((row as Record<string, unknown>)[identity]);
    const fate = fateOf(gate, id, stamped, ts);
    if (fate === 'keep') continue;
    const values = flatValues(table, row);
    if (fate === 'insert') {
      inserting.push([...values, stampOf(stamped, ts)]);
      continue;
    }
    await driver.run(`UPDATE ${table.table} SET ${assignments} WHERE ${table.identity} = ?`, [
      ...values.filter((_, i) => written[i]),
      stampOf(stamped, ts),
      id
    ]);
  }
  await insertRows(
    driver,
    `INSERT INTO ${table.table} (${columns.map((c) => c.column).join(', ')}, updated_at)`,
    inserting
  );
}

type KeyedStock = ArchiveJournal['medicationStock'][number] & { drugKey: string };

async function incomingStock({ driver, journal }: Restoring): Promise<Map<string, KeyedStock>> {
  const destination = await driver.query<{ uuid: string; drug_key: string }>(
    'SELECT uuid, drug_key FROM medication_stock'
  );
  const uuids = new Set(destination.map((row) => row.uuid));
  const keys = new Set(destination.map((row) => row.drug_key));
  const incoming = new Map<string, KeyedStock>();
  for (const row of journal.medicationStock) {
    if (uuids.has(row.id)) continue;
    const drugKey = drugNameKey(row.drug);
    if (!keys.has(drugKey)) incoming.set(drugKey, { ...row, drugKey });
  }
  return incoming;
}

/** Runs before stock insertion, so destination stock and reminder owners keep
    precedence. A legacy duplicate group carries only the chosen spelling's
    automatic reminder. Without wire timestamps, the last matching reminder
    wins too. Manual reminders and markers unrelated to incoming stock travel
    through the ordinary uuid applier unchanged. */
export async function applyReminders(
  table: FlatTable<ArchiveJournal['reminders'][number]>,
  restoring: Restoring
): Promise<void> {
  const incoming = await incomingStock(restoring);
  const owners = new Map<string, Set<string>>();
  for (const row of restoring.journal.medicationStock) {
    const key = drugNameKey(row.drug);
    const names = owners.get(key) ?? new Set<string>();
    names.add(row.drug);
    owners.set(key, names);
  }
  const present = await presentIds(restoring.driver, "SELECT auto_source AS id FROM reminder WHERE auto_source GLOB 'stock:*'");
  const destinationKeys = new Set([...present].map((source) => drugNameKey(source.slice(STOCK_PREFIX.length))));
  const keyOf = (row: ArchiveJournal['reminders'][number]) => row.autoSource?.startsWith(STOCK_PREFIX)
    ? drugNameKey(row.autoSource.slice(STOCK_PREFIX.length)) : null;
  const selected = new Map<string, ArchiveJournal['reminders'][number]>();
  for (const row of restoring.journal.reminders) {
    const key = keyOf(row);
    if (key === null || !owners.has(key)) continue;
    const owner = incoming.get(key);
    if (!owner || destinationKeys.has(key)) continue;
    if (owners.get(key)!.size > 1 && row.autoSource !== `${STOCK_PREFIX}${owner.drug}`) continue;
    selected.set(key, row);
  }
  // A stock reminder this device already holds is the same row on both
  // sides, and is merged like any other: a newer one is written over it.
  const held = await presentIds(restoring.driver, 'SELECT uuid AS id FROM reminder');
  const rows = restoring.journal.reminders.flatMap((row) => {
    const key = keyOf(row);
    if (key === null || !owners.has(key) || held.has(row.id)) return [row];
    return selected.get(key) === row ? [{ ...row, autoSource: stockAutoSource(incoming.get(key)!.drug) }] : [];
  });
  await applyFlatTable(table, rows, restoring);
}

/** A stock rename keeps its uuid, so a destination row is matched by its
    uuid or by its drug key, and only a row matching neither is inserted.
    A matched one takes the archive's newer copy (updateMatchedStock).
    Legacy siblings have no edit timestamp on the wire; their last complete
    row in Archive order wins. Replace has cleared destination stock first. */
export async function applyMedicationStock(
  table: FlatTable<ArchiveJournal['medicationStock'][number]>,
  restoring: Restoring
): Promise<void> {
  // The key is derived locally and never becomes an Archive wire field.
  const keyedTable: FlatTable<KeyedStock> = {
    ...table, identity: 'drug_key', columns: { ...table.columns, drug_key: 'drugKey' }
  };
  if (restoring.mode === 'merge') await updateMatchedStock(table, restoring);
  const incoming = await incomingStock(restoring);
  await applyFlatTable(keyedTable, [...incoming.values()], restoring);
}

/** A stock row this device holds, by uuid or by drug, written over by the
    archive's newer copy. Its uuid stays, the way a rename keeps it. A
    renamed drug that another row here already counts is left alone rather
    than made into a second row for that drug. An archive from before
    schema 91 can count one drug twice; the later row in Archive order
    stands for it, the same choice the insert below makes. */
async function updateMatchedStock(
  table: FlatTable<ArchiveJournal['medicationStock'][number]>,
  { driver, journal }: Restoring
): Promise<void> {
  const local = await driver.query<{ uuid: string; drug_key: string; updated_at: number }>(
    'SELECT uuid, drug_key, updated_at FROM medication_stock'
  );
  const byUuid = new Map(local.map((row) => [row.uuid, row]));
  const byKey = new Map(local.map((row) => [row.drug_key, row]));
  const columns = columnsOf(table);
  const written = columns.map((c) => c.column !== 'uuid');
  const assignments = columns.filter((_, i) => written[i]).map((c) => `${c.column} = ?`).join(', ');
  const chosen = new Map(journal.medicationStock.map((row) => [drugNameKey(row.drug), row]));
  for (const [drugKey, row] of chosen) {
    if (row.updatedAt === undefined) continue;
    const target = byUuid.get(row.id) ?? byKey.get(drugKey);
    if (!target || row.updatedAt <= target.updated_at) continue;
    const holder = byKey.get(drugKey);
    if (holder && holder !== target) continue;
    await driver.run(`UPDATE medication_stock SET ${assignments}, drug_key = ?, updated_at = ? WHERE uuid = ?`, [
      ...flatValues(table, row).filter((_, i) => written[i]),
      drugKey,
      row.updatedAt,
      target.uuid
    ]);
    byKey.delete(target.drug_key);
    target.drug_key = drugKey;
    target.updated_at = row.updatedAt;
    byKey.set(drugKey, target);
  }
}

export async function applyDimensions(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'gender_dimension');

  for (const dimension of journal.dimensions) {
    const fate = fateOf(gate, dimension.key, dimension, ts);
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run(
        `UPDATE gender_dimension SET name = ?, low_label = ?, high_label = ?, min_value = ?, max_value = ?,
           hidden = ?, updated_at = ? WHERE key = ?`,
        [
          dimension.name,
          dimension.low,
          dimension.high,
          dimension.min,
          dimension.max,
          flag(dimension.hidden),
          stampOf(dimension, ts),
          dimension.key
        ]
      );
      continue;
    }
    // A custom dimension's key is its own uuid (dimensions.ts): the column is
    // NOT NULL for the built-ins' sake, and one identity is enough for a row
    // the user made.
    await driver.run(
      `INSERT INTO gender_dimension
         (uuid, key, name, low_label, high_label, min_value, max_value, is_built_in, hidden, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dimension.builtIn ? null : dimension.key,
        dimension.key,
        dimension.name,
        dimension.low,
        dimension.high,
        dimension.min,
        dimension.max,
        flag(dimension.builtIn),
        flag(dimension.hidden),
        stampOf(dimension, ts)
      ]
    );
  }
}

export async function applyPresets(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'gender_preset');

  for (const preset of journal.presets) {
    const fate = fateOf(gate, preset.id, preset, ts);
    // A preset this device's copy of is the newer keeps the dimensions it
    // offers too: they follow the preset.
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run('UPDATE gender_preset SET name = ?, updated_at = ? WHERE COALESCE(key, uuid) = ?', [
        preset.name,
        stampOf(preset, ts),
        preset.id
      ]);
      // The archive's dimensions replace this preset's, so its own links go
      // first - the ones a Replace keeps belong to presets not in the archive.
      await driver.run(
        `DELETE FROM preset_dimension
         WHERE preset_id = (SELECT id FROM gender_preset WHERE COALESCE(key, uuid) = ?)`,
        [preset.id]
      );
    } else {
      await driver.run('INSERT INTO gender_preset (uuid, key, name, is_built_in, updated_at) VALUES (?, ?, ?, ?, ?)', [
        preset.builtIn ? null : preset.id,
        preset.builtIn ? preset.id : null,
        preset.name,
        flag(preset.builtIn),
        stampOf(preset, ts)
      ]);
    }

    const presetId = await rowidWhere(driver, 'gender_preset', 'COALESCE(key, uuid) = ?', [preset.id], 'preset id');
    // A dimension this device has deleted is left out, the rest kept.
    for (const [orderIndex, key] of (preset.dims ?? []).entries()) {
      await driver.run(
        `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
         SELECT ?, id, ? FROM gender_dimension WHERE key = ?`,
        [presetId, orderIndex, key]
      );
    }
  }
}

/** Entry templates (phase 6 ticket 07, ADR-0002) - the same shape
    applyPresets gives a built-in-or-authored area with child links: a
    template's tags and dimension values follow it, rewritten only when the
    template itself is, and a template with no presentation on the far side
    is exactly `presentationId ?? null`, the same resting state applyEntries
    gives an entry (ADR-0010). */
export async function applyEntryTemplates(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'entry_template');

  for (const template of journal.entryTemplates) {
    const fate = fateOf(gate, template.id, template, ts);
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run(
        `UPDATE entry_template SET name = ?, note_scaffold = ?, presentation_uuid = ?, hidden = ?, updated_at = ?
         WHERE COALESCE(key, uuid) = ?`,
        [template.name, template.noteScaffold, template.presentationId ?? null, flag(template.hidden), stampOf(template, ts), template.id]
      );
      const templateId = await rowidWhere(
        driver,
        'entry_template',
        'COALESCE(key, uuid) = ?',
        [template.id],
        'entry template id'
      );
      await driver.run('DELETE FROM entry_template_tag WHERE template_id = ?', [templateId]);
      await driver.run('DELETE FROM entry_template_dimension_value WHERE template_id = ?', [templateId]);
    } else {
      await driver.run(
        `INSERT INTO entry_template (uuid, key, name, note_scaffold, presentation_uuid, hidden, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          template.builtIn ? null : template.id,
          template.builtIn ? template.id : null,
          template.name,
          template.noteScaffold,
          template.presentationId ?? null,
          flag(template.hidden),
          stampOf(template, ts)
        ]
      );
    }

    const templateId = await rowidWhere(
      driver,
      'entry_template',
      'COALESCE(key, uuid) = ?',
      [template.id],
      'entry template id'
    );
    // A tag this device has deleted is left off rather than failing the
    // import: the template keeps the rest.
    for (const tagId of template.tags ?? []) {
      await driver.run(
        `INSERT INTO entry_template_tag (template_id, tag_id)
         SELECT ?, id FROM tag WHERE key = ? OR uuid = ?`,
        [templateId, tagId, tagId]
      );
    }
    for (const [key, value] of Object.entries(template.dims ?? {})) {
      await driver.run(
        `INSERT INTO entry_template_dimension_value (template_id, dimension_id, value)
         SELECT ?, id, ? FROM gender_dimension WHERE key = ?`,
        [templateId, value, key]
      );
    }
  }
}

const nextTagOrderIndex = async (driver: SqliteDriver, groupId: number): Promise<number> => {
  const rows = await driver.query<{ next: number }>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM tag WHERE group_id = ?',
    [groupId]
  );
  return rows[0].next;
};

/* Order travels as position rather than as a column: the snapshot reads
   groups and tags in order_index order (archive.ts), so an array index is the
   order the user arranged them in. A Replace installs those positions, and
   so does a Merge for a tag whose newer copy it takes. A tag a Merge adds
   cannot: the tags already in a group hold positions of their own, so an
   added one goes after them, which is where addTag puts a new tag anyway.
   Groups are not reorderable at all (F17 offers a drag for tags only), so a
   group a Merge adds keeps the archive's position. */
export async function applyTagGroups(restoring: Restoring): Promise<void> {
  const { driver, mode, journal, ts } = restoring;
  const groups = await rowGate(restoring, 'tag_group');
  const tags = await rowGate(restoring, 'tag');

  for (const [groupIndex, group] of journal.tagGroups.entries()) {
    const fate = fateOf(groups, group.key, group, ts);
    if (fate === 'insert') {
      await driver.run(
        'INSERT INTO tag_group (uuid, key, name, enabled, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [group.builtIn ? null : group.key, group.key, group.name, flag(group.enabled), groupIndex, stampOf(group, ts)]
      );
    } else if (fate === 'update') {
      await driver.run('UPDATE tag_group SET name = ?, enabled = ?, order_index = ?, updated_at = ? WHERE key = ?', [
        group.name,
        flag(group.enabled),
        groupIndex,
        stampOf(group, ts),
        group.key
      ]);
    }

    /* A group that is already here still has its tags walked, in both modes:
       a tag is its own row with its own identity and its own `updated_at`.
       A group this device has deleted takes its tags with it. */
    const [found] = await driver.query<{ id: number }>('SELECT id FROM tag_group WHERE key = ?', [group.key]);
    if (!found) continue;
    const groupId = found.id;
    for (const [tagIndex, tag] of (group.tags ?? []).entries()) {
      const tagFate = fateOf(tags, tag.id, tag, ts);
      if (tagFate === 'keep') continue;
      if (tagFate === 'update') {
        await driver.run(
          `UPDATE tag SET group_id = ?, label = ?, hidden = ?, order_index = ?, updated_at = ?
           WHERE COALESCE(key, uuid) = ?`,
          [groupId, tag.label, flag(tag.hidden), tagIndex, stampOf(tag, ts), tag.id]
        );
        continue;
      }
      const orderIndex = mode === 'replace' ? tagIndex : await nextTagOrderIndex(driver, groupId);
      await driver.run(
        'INSERT INTO tag (uuid, key, group_id, label, hidden, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tag.builtIn ? null : tag.id, tag.builtIn ? tag.id : null, groupId, tag.label, flag(tag.hidden), orderIndex, stampOf(tag, ts)]
      );
    }
  }
}

/** A flat row: inserted, or written over by the newer copy. */
export async function applyBodyRegions(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'body_region');

  for (const r of journal.bodyRegions) {
    const fate = fateOf(gate, r.id, r, ts);
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run('UPDATE body_region SET name = ?, hidden = ?, updated_at = ? WHERE COALESCE(key, uuid) = ?', [
        r.name,
        flag(r.hidden),
        stampOf(r, ts),
        r.id
      ]);
      continue;
    }
    await driver.run('INSERT INTO body_region (uuid, key, name, hidden, updated_at) VALUES (?, ?, ?, ?, ?)', [
      r.builtIn ? null : r.id,
      r.builtIn ? r.id : null,
      r.name,
      flag(r.hidden),
      stampOf(r, ts)
    ]);
  }
}

/** Rowids for names a column of `table` holds, for the names this device
    still has; a name it has deleted (archiveMerge.ts) is left out rather
    than failing the import, and any other name it cannot resolve throws,
    the archive being unreadable then. Its own rows have passed
    assertArchiveReferences, so that takes an archive whose own deletion
    record kept out the group its tags hang from (re-check carpet 11, F3). */
async function resolveNames(
  driver: SqliteDriver,
  table: 'gender_dimension' | 'tag',
  names: string[],
  what: string
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const chunk of chunked(names, ID_CHUNK)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = table === 'tag'
      ? await driver.query<{ id: number; key: string | null; uuid: string | null }>(
        `SELECT id, key, uuid FROM tag WHERE key IN (${placeholders}) OR uuid IN (${placeholders})`,
        [...chunk, ...chunk]
      )
      : await driver.query<{ id: number; key: string | null; uuid: string | null }>(
        `SELECT id, key, NULL AS uuid FROM gender_dimension WHERE key IN (${placeholders})`,
        chunk
      );
    for (const row of rows) {
      if (row.key !== null) ids.set(row.key, row.id);
      if (row.uuid !== null) ids.set(row.uuid, row.id);
    }
  }
  const deleted = await presentIds(driver, `SELECT row_key AS id FROM deletion WHERE tbl = '${table}'`);
  for (const name of names) {
    if (!ids.has(name) && !deleted.has(name)) throw new CorruptArchiveError(`the archive's ${what} reference is not readable`);
  }
  return ids;
}

export async function applyEntries(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'entry');
  const inserting: ArchiveJournal['entries'] = [];
  const updating: ArchiveJournal['entries'] = [];
  for (const entry of journal.entries) {
    const fate = fateOf(gate, entry.uuid, entry, ts);
    if (fate === 'insert') inserting.push(entry);
    if (fate === 'update') updating.push(entry);
  }

  /* Written as-is (no rowid resolved): the same plain-text FK
     milestone.procedureId/tryoutId already carry - except that a
     presentation this device has deleted is not there to name, and the
     entry is filed under none, the resting state (ADR-0010). */
  const presentations = await presentIds(driver, 'SELECT uuid AS id FROM presentation');
  const columns = (entry: ArchiveJournal['entries'][number]) => [
    entry.epochDay,
    entry.timestamp,
    Number.isInteger(entry.mood) && entry.mood! >= 1 && entry.mood! <= 5 ? entry.mood : null,
    entry.note,
    flag(entry.starred),
    // Absent on an archive written before this ticket - null, the same
    // resting state an unset presentation always reads (ADR-0010).
    entry.presentationId != null && presentations.has(entry.presentationId) ? entry.presentationId : null,
    // Trash travels since ticket 48; absent before it, in the journal.
    entry.trashedAt ?? null,
    stampOf(entry, ts)
  ];

  await insertRows(
    driver,
    'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, starred, presentation_uuid, trashed_at, updated_at)',
    inserting.map((entry) => [entry.uuid, ...columns(entry)])
  );
  for (const entry of updating) {
    await driver.run(
      `UPDATE entry SET epoch_day = ?, timestamp = ?, mood = ?, note = ?, starred = ?, presentation_uuid = ?,
         trashed_at = ?, updated_at = ? WHERE uuid = ?`,
      [...columns(entry), entry.uuid]
    );
  }

  /* Every archive entry this device now holds has its photos, recordings
     and videos walked: each is its own row with its own `updated_at`. One
     this device deleted the entry of has nothing to hang them on. */
  const entryIds = await rowidsByUuid(driver, 'entry', journal.entries.map((entry) => entry.uuid));
  const rewritten = [...inserting, ...updating];
  for (const entry of rewritten) {
    if (!entryIds.has(entry.uuid)) throw new Error(`entry row id missing after restore write: ${entry.uuid}`);
  }

  /* An updated entry's children with no identity of their own follow it:
     its scale values, tag links and body map are the archive's, and so is
     its place in the search index, which a trashed entry has none of. The
     index is contentless and holds folded text against the entry's rowid
     (ADR-0005), written by the same fold the query uses. */
  for (const entry of updating) {
    const entryId = entryIds.get(entry.uuid)!;
    await driver.run('DELETE FROM entry_dimension_value WHERE entry_id = ?', [entryId]);
    await driver.run('DELETE FROM entry_tag WHERE entry_id = ?', [entryId]);
    await driver.run('DELETE FROM entry_body_region WHERE entry_id = ?', [entryId]);
    await driver.run('DELETE FROM entry_fts WHERE rowid = ?', [entryId]);
  }

  const dimensionIds = await resolveNames(
    driver, 'gender_dimension', [...new Set(rewritten.flatMap((entry) => Object.keys(entry.dims ?? {})))], 'dimension'
  );
  const tagIds = await resolveNames(driver, 'tag', [...new Set(rewritten.flatMap((entry) => entry.tags ?? []))], 'tag');

  const ftsRows: unknown[][] = [];
  const dimensionRows: unknown[][] = [];
  const tagRows: unknown[][] = [];
  const bodyRegionRows: unknown[][] = [];

  for (const entry of rewritten) {
    const entryId = entryIds.get(entry.uuid)!;
    if (entry.trashedAt == null) ftsRows.push([entryId, foldText(entry.note)]);

    /* `?? {}` and `?? []` rather than trusting the types: this shape is read
       off a file someone else wrote, and the interface only describes what
       this app puts in one. */
    for (const [key, value] of Object.entries(entry.dims ?? {})) {
      const dimensionId = dimensionIds.get(key);
      if (dimensionId !== undefined) dimensionRows.push([entryId, dimensionId, value]);
    }

    for (const id of new Set(entry.tags ?? [])) {
      const tagId = tagIds.get(id);
      if (tagId !== undefined) tagRows.push([entryId, tagId]);
    }

    // Unlike dims and tags, a region key is not resolved against a
    // body_region row - entry_body_region.region is plain text (bodyMap.ts
    // owns the list of regions) - so it travels straight through,
    // the same forward-compatible treatment lab_result.analyte gets: an
    // archive from a build that knows a region this one does not still
    // restores rather than failing the whole import.
    for (const [region, value] of Object.entries(entry.bodyRegions ?? {})) {
      bodyRegionRows.push([entryId, region, value]);
    }
  }

  await insertRows(driver, 'INSERT INTO entry_fts (rowid, folded_text)', ftsRows);
  await insertRows(driver, 'INSERT INTO entry_dimension_value (entry_id, dimension_id, value)', dimensionRows);
  await insertRows(driver, 'INSERT INTO entry_tag (entry_id, tag_id)', tagRows);
  await insertRows(driver, 'INSERT INTO entry_body_region (entry_id, region, value)', bodyRegionRows);

  const photos = await rowGate(restoring, 'photo');
  const recordings = await rowGate(restoring, 'voice_recording');
  const videos = await rowGate(restoring, 'video_note');
  const photoRows: unknown[][] = [];
  const recordingRows: unknown[][] = [];
  const videoRows: unknown[][] = [];
  for (const entry of journal.entries) {
    const entryId = entryIds.get(entry.uuid);
    if (entryId === undefined) continue;
    for (const [orderIndex, photo] of (entry.photos ?? []).entries()) {
      const fate = fateOf(photos, photo.id, photo, ts);
      const values = [photo.fileName, orderIndex, flag(photo.starred), photo.epochDayOverride ?? null, stampOf(photo, ts)];
      if (fate === 'insert') photoRows.push([photo.id, entryId, null, ...values]);
      if (fate === 'update') {
        await driver.run(
          `UPDATE photo SET file_path = ?, order_index = ?, starred = ?, epoch_day_override = ?, updated_at = ?
           WHERE uuid = ?`,
          [...values, photo.id]
        );
      }
    }
    for (const [orderIndex, recording] of (entry.recordings ?? []).entries()) {
      const fate = fateOf(recordings, recording.id, recording, ts);
      if (fate === 'insert') recordingRows.push([recording.id, entryId, recording.fileName, orderIndex, stampOf(recording, ts)]);
      if (fate === 'update') {
        await driver.run('UPDATE voice_recording SET file_path = ?, order_index = ?, updated_at = ? WHERE uuid = ?', [
          recording.fileName, orderIndex, stampOf(recording, ts), recording.id
        ]);
      }
    }
    for (const [orderIndex, video] of (entry.videos ?? []).entries()) {
      const fate = fateOf(videos, video.id, video, ts);
      if (fate === 'insert') videoRows.push([video.id, entryId, video.fileName, orderIndex, stampOf(video, ts)]);
      if (fate === 'update') {
        await driver.run('UPDATE video_note SET file_path = ?, order_index = ?, updated_at = ? WHERE uuid = ?', [
          video.fileName, orderIndex, stampOf(video, ts), video.id
        ]);
      }
    }
  }
  await insertRows(
    driver,
    'INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, starred, epoch_day_override, updated_at)',
    photoRows
  );
  await insertRows(
    driver,
    'INSERT INTO voice_recording (uuid, entry_id, file_path, order_index, updated_at)',
    recordingRows
  );
  await insertRows(driver, 'INSERT INTO video_note (uuid, entry_id, file_path, order_index, updated_at)', videoRows);
}

export async function applyMilestones(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'milestone');
  /* A milestone names its procedure and tryout by uuid under a foreign key
     that neither cascades nor sets null, and one this device has deleted is
     not there to name: the milestone stays and the link goes, the same
     thing deleting one here does to it (procedures.ts, tryouts.ts). */
  const procedures = await presentIds(driver, 'SELECT uuid AS id FROM procedure');
  const tryouts = await presentIds(driver, 'SELECT uuid AS id FROM tryout');
  const linkTo = (id: string | null | undefined, present: Set<string>) => (id != null && present.has(id) ? id : null);

  for (const milestone of journal.milestones) {
    const fate = fateOf(gate, milestone.id, milestone, ts);
    if (fate === 'keep') continue;
    const values = [
      milestone.name,
      milestone.epochDay,
      // An archive written before ticket 15 has no description key, so
      // JSON.parse leaves it undefined rather than null.
      milestone.description ?? '',
      milestone.templateKey,
      milestone.roadmapGoalKey ?? null,
      linkTo(milestone.procedureId, procedures),
      linkTo(milestone.tryoutId, tryouts),
      milestone.celebrate === false ? 0 : 1,
      stampOf(milestone, ts)
    ];
    if (fate === 'insert') {
      await driver.run(
        `INSERT INTO milestone (name, epoch_day, description, template_key, roadmap_goal_key, procedure_uuid, tryout_uuid,
                                celebrate, updated_at, uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, milestone.id]
      );
    } else {
      await driver.run(
        `UPDATE milestone SET name = ?, epoch_day = ?, description = ?, template_key = ?, roadmap_goal_key = ?,
           procedure_uuid = ?, tryout_uuid = ?, celebrate = ?, updated_at = ? WHERE uuid = ?`,
        [...values, milestone.id]
      );
    }
  }

  const milestoneIds = await rowidsByUuid(driver, 'milestone', journal.milestones.map((milestone) => milestone.id));
  const photos = await rowGate(restoring, 'photo');
  for (const milestone of journal.milestones) {
    const milestoneId = milestoneIds.get(milestone.id);
    if (!milestone.photo || milestoneId === undefined) continue;
    const photo = milestone.photo;
    const fate = fateOf(photos, photo.id, photo, ts);
    const values = [photo.fileName, flag(photo.starred), photo.epochDayOverride ?? null, stampOf(photo, ts)];
    if (fate === 'insert') {
      await driver.run(
        `INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, starred, epoch_day_override, updated_at)
         VALUES (?, NULL, ?, ?, 0, ?, ?, ?)`,
        [photo.id, milestoneId, ...values]
      );
    }
    if (fate === 'update') {
      await driver.run('UPDATE photo SET file_path = ?, starred = ?, epoch_day_override = ?, updated_at = ? WHERE uuid = ?', [
        ...values, photo.id
      ]);
    }
  }
}


/* Bundled goals match by pack/goal rather than uuid. A missing incoming
   goal leaves local choices alone, and a locally recorded status wins.
   An unchecked row exists only to hold visibility, so it can take the
   Archive's status while keeping this device's hidden flag. Replace has
   already emptied the table before this runs. */
/** After the custom goals land: an archive written before functional audit
    ticket 34's round two has goals under the cut social, presentational and
    medical tracks and no categories, so each such track gets the nameless
    category migration 111 made for it, its uuid the track key. A category
    already here keeps its name, on a merge as on a replace. */
export async function adoptLegacyRoadmapTracks({ driver, ts }: Restoring): Promise<void> {
  await driver.run(
    `INSERT OR IGNORE INTO roadmap_category (uuid, name, updated_at)
       SELECT track, '', ? FROM roadmap_goal
         WHERE track IN (${LEGACY_ROADMAP_TRACKS.map(() => '?').join(', ')})
         GROUP BY track ORDER BY MIN(id)`,
    [ts, ...LEGACY_ROADMAP_TRACKS]
  );
}

export async function applyRoadmapChecks(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'roadmap_check');
  const rows = await driver.query<{ pack_key: string; goal_key: string; status: string }>(
    'SELECT pack_key, goal_key, status FROM roadmap_check'
  );
  const statuses = new Map(rows.map((row) => [roadmapCheckId(row.pack_key, row.goal_key), row.status]));
  /* An older archive's ticks go through the rules migrations 111 and 114
     applied to the journal (keptTick): a tick on a track ticket 34 cut or
     on the retired "bank, insurers, clinic" step is skipped, and one on a
     step that became an institution (ticket 35) keeps only its hidden
     flag, so nothing comes back as an invisible row. */
  const checks = journal.roadmapChecks.flatMap((check) => {
    const kept = keptTick({ ...check, hidden: check.hidden ?? false });
    return kept ? [{ ...kept, updatedAt: check.updatedAt }] : [];
  });

  const inserting: unknown[][] = [];
  for (const check of checks) {
    const id = roadmapCheckId(check.packKey, check.goalKey);
    const fate = fateOf(gate, id, check, ts);
    if (fate === 'insert') inserting.push([check.packKey, check.goalKey, check.status, flag(check.hidden), stampOf(check, ts)]);
    if (fate === 'update') {
      await driver.run(
        'UPDATE roadmap_check SET status = ?, hidden = ?, updated_at = ? WHERE pack_key = ? AND goal_key = ?',
        [check.status, flag(check.hidden), stampOf(check, ts), check.packKey, check.goalKey]
      );
    }
    /* A row holds two facts, a status and whether the goal is hidden, and
       an unchecked row exists only to hold the second. So a row that is
       newer here only because the goal was hidden here still takes the
       archive's status, keeping this device's hidden flag; a status recorded
       here wins. Stamped now, since the row now says what neither side said
       alone. */
    if (fate === 'keep' && check.status !== 'unchecked' && statuses.get(id) === 'unchecked') {
      await driver.run(
        'UPDATE roadmap_check SET status = ?, updated_at = ? WHERE pack_key = ? AND goal_key = ?',
        [check.status, ts, check.packKey, check.goalKey]
      );
    }
  }
  await insertRows(driver, 'INSERT INTO roadmap_check (pack_key, goal_key, status, hidden, updated_at)', inserting);
}

const nextChecklistItemOrderIndex = async (driver: SqliteDriver, checklistId: number): Promise<number> => {
  const rows = await driver.query<{ next: number }>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM checklist_item WHERE checklist_id = ?',
    [checklistId]
  );
  return rows[0].next;
};

/* A checklist's identity - its uuid and owner - is fixed at creation and
   never edited above this seam (checklists.ts has no setter for either), so
   a newer copy only moves the row's stamp: its content is its items. The
   screen has one list per owner, so a list the other device made for the
   same owner under its own uuid is this one. Its items are walked in both
   modes, each by its own uuid and `updated_at`, the same reason an existing
   tag group still has its tags walked. */
export async function applyChecklists(restoring: Restoring): Promise<void> {
  const { driver, mode, journal, ts } = restoring;
  const lists = await rowGate(restoring, 'checklist');
  const items = await rowGate(restoring, 'checklist_item');

  for (const checklist of journal.checklists) {
    const existing = await driver.query<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM checklist WHERE uuid = ? OR (owner_kind IS ? AND owner_uuid IS ?) ORDER BY id LIMIT 1',
      [checklist.id, checklist.ownerKind, checklist.ownerId]
    );
    let checklistRowId = existing[0]?.id;
    if (checklistRowId === undefined) {
      if (fateOf(lists, checklist.id, checklist, ts) !== 'insert') continue;
      const inserted = await driver.run(
        'INSERT INTO checklist (uuid, owner_kind, owner_uuid, updated_at) VALUES (?, ?, ?, ?)',
        [checklist.id, checklist.ownerKind, checklist.ownerId, stampOf(checklist, ts)]
      );
      checklistRowId = inserted.lastInsertRowid;
    } else if (mode === 'merge' && checklist.updatedAt !== undefined && checklist.updatedAt > existing[0].updated_at) {
      await driver.run('UPDATE checklist SET updated_at = ? WHERE id = ?', [checklist.updatedAt, checklistRowId]);
    }

    for (const [itemIndex, item] of checklist.items.entries()) {
      const fate = fateOf(items, item.id, item, ts);
      if (fate === 'keep') continue;
      if (fate === 'update') {
        await driver.run(
          `UPDATE checklist_item SET checklist_id = ?, content = ?, checked = ?, carried_forward = ?, order_index = ?, updated_at = ?
           WHERE uuid = ?`,
          [checklistRowId, item.content, flag(item.checked), flag(item.carriedForward), itemIndex, stampOf(item, ts), item.id]
        );
        continue;
      }
      const orderIndex = mode === 'replace' ? itemIndex : await nextChecklistItemOrderIndex(driver, checklistRowId);
      await driver.run(
        `INSERT INTO checklist_item (uuid, checklist_id, content, checked, carried_forward, order_index, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.id, checklistRowId, item.content, flag(item.checked), flag(item.carriedForward), orderIndex, stampOf(item, ts)]
      );
    }
  }
}

/* Matched by uuid, like every user-owned row. Its photos are walked the
   same way applyProcedures walks a procedure's: each is its own row with
   its own identity, and one the archive carries that this device does not
   is exactly what Merge is for. A tryout this device deleted takes its
   photos with it. */
export async function applyTryouts(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const tryouts = await rowGate(restoring, 'tryout');
  const photos = await rowGate(restoring, 'tryout_photo');

  for (const tryout of journal.tryouts) {
    const fate = fateOf(tryouts, tryout.id, tryout, ts);
    const values = [tryout.kind, tryout.label, tryout.description, tryout.startEpochDay, tryout.endEpochDay, stampOf(tryout, ts)];
    if (fate === 'insert') {
      await driver.run(
        'INSERT INTO tryout (kind, label, description, start_epoch_day, end_epoch_day, updated_at, uuid) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [...values, tryout.id]
      );
    }
    if (fate === 'update') {
      await driver.run(
        'UPDATE tryout SET kind = ?, label = ?, description = ?, start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
        [...values, tryout.id]
      );
    }

    const [found] = await driver.query<{ id: number }>('SELECT id FROM tryout WHERE uuid = ?', [tryout.id]);
    if (!found) continue;
    for (const photo of tryout.photos) {
      const photoFate = fateOf(photos, photo.id, photo, ts);
      const photoValues = [found.id, photo.epochDay, photo.fileName, stampOf(photo, ts), photo.id];
      if (photoFate === 'insert') {
        await driver.run(
          'INSERT INTO tryout_photo (tryout_id, epoch_day, file_path, updated_at, uuid) VALUES (?, ?, ?, ?, ?)', photoValues
        );
      }
      if (photoFate === 'update') {
        await driver.run(
          'UPDATE tryout_photo SET tryout_id = ?, epoch_day = ?, file_path = ?, updated_at = ? WHERE uuid = ?', photoValues
        );
      }
    }
  }
}

/** A row that hangs off another section's row by rowid: resolved by the
    owner's uuid against what is in the table now, inserted or written over
    by the gate's rule, and dropped when its owner is not here - a merge is
    allowed to carry only part of another device's history, and a row
    belonging to nothing would be worse than none. */
async function applyOwnedRows<Row extends ArchiveStamped & { id: string }>(
  restoring: Restoring,
  rows: readonly Row[],
  child: { table: string; owner: 'entry' | 'regimen_episode' | 'tryout'; ownerOf: (row: Row) => string | null | undefined },
  write: { columns: string[]; values: (row: Row) => unknown[] }
): Promise<void> {
  const { driver, ts } = restoring;
  const gate = await rowGate(restoring, child.table);
  const owners = await rowidsByUuid(driver, child.owner, rows.flatMap((row) => {
    const owner = child.ownerOf(row);
    return owner ? [owner] : [];
  }));
  const ownerColumn = `${child.owner === 'regimen_episode' ? 'episode' : child.owner}_id`;
  const inserting: unknown[][] = [];
  for (const row of rows) {
    const owner = child.ownerOf(row);
    const ownerId = owner ? owners.get(owner) : undefined;
    if (ownerId === undefined) continue;
    const fate = fateOf(gate, row.id, row, ts);
    if (fate === 'insert') inserting.push([row.id, ownerId, ...write.values(row), stampOf(row, ts)]);
    if (fate === 'update') {
      await driver.run(
        `UPDATE ${child.table} SET ${ownerColumn} = ?, ${write.columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE uuid = ?`,
        [ownerId, ...write.values(row), stampOf(row, ts), row.id]
      );
    }
  }
  await insertRows(
    driver,
    `INSERT INTO ${child.table} (uuid, ${ownerColumn}, ${write.columns.join(', ')}, updated_at)`,
    inserting
  );
}

/* Resolves its tryout by uuid against what applyTryouts just wrote, and so
   does a reading an older archive hung off a milestone (functional audit
   ticket 32): it has no tryout to resolve, and is dropped. */
export async function applyFeltSenseEntries(restoring: Restoring): Promise<void> {
  await applyOwnedRows(
    restoring,
    restoring.journal.feltSenseEntries,
    { table: 'felt_sense', owner: 'tryout', ownerOf: (entry) => entry.tryoutId },
    { columns: ['epoch_day', 'mood', 'note'], values: (entry) => [entry.epochDay, entry.mood, entry.note] }
  );
}

/* A margin note's owner is required, the same reasoning
   applyFeltSenseEntries gives for its tryout going missing. */
export async function applyMarginNotes(restoring: Restoring): Promise<void> {
  await applyOwnedRows(
    restoring,
    restoring.journal.marginNotes,
    { table: 'margin_note', owner: 'entry', ownerOf: (note) => note.entryId },
    { columns: ['epoch_day', 'text'], values: (note) => [note.epochDay, note.text] }
  );
}

/* Both of these resolve their episode by uuid against what is in the table
   after applyRegimenEpisodes ran, and drop a row whose episode is not
   there: a schedule belonging to nothing would generate slots nobody
   expects. */
/* Not the batched insertRows helper: a schedule's weekdays and dose
   amounts are child rows that need the parent's own rowid back, which a
   chunked multi-row INSERT does not hand back per row. They follow the
   schedule: a newer copy rewrites them, an older one leaves them. */
export async function applyDoseSchedules(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'dose_schedule');
  const episodesWithSchedule = await presentIds(
    driver,
    'SELECT e.uuid AS id FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id'
  );
  const episodeIds = await rowidsByUuid(
    driver,
    'regimen_episode',
    journal.doseSchedules.map((schedule) => schedule.episodeId)
  );

  for (const schedule of journal.doseSchedules) {
    const episodeId = episodeIds.get(schedule.episodeId);
    if (episodeId === undefined) continue;
    const fate = gate.fate(schedule.id, schedule.updatedAt);
    // One schedule per episode (migration v8): a merge must not bring a
    // second one for an episode that already has its own.
    if (fate === 'keep' || (fate === 'insert' && episodesWithSchedule.has(schedule.episodeId))) continue;
    gate.wrote(schedule.id, stampOf(schedule, ts));
    episodesWithSchedule.add(schedule.episodeId);

    const values = [
      schedule.recurrenceKind,
      schedule.everyNDays,
      schedule.dosesPerDay,
      // `?? null` because an archive from before ticket 11 has no such
      // field: a restored schedule is switched off until the person says
      // otherwise on this device.
      schedule.autoLogFromEpochDay ?? null,
      stampOf(schedule, ts)
    ];
    let scheduleId: number;
    if (fate === 'insert') {
      const result = await driver.run(
        `INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day,
                                    auto_log_from_epoch_day, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [schedule.id, episodeId, ...values]
      );
      scheduleId = result.lastInsertRowid;
    } else {
      await driver.run(
        `UPDATE dose_schedule SET recurrence_kind = ?, every_n_days = ?, doses_per_day = ?, auto_log_from_epoch_day = ?,
           updated_at = ? WHERE uuid = ?`,
        [...values, schedule.id]
      );
      scheduleId = await rowidWhere(driver, 'dose_schedule', 'uuid = ?', [schedule.id], 'dose schedule uuid');
      await driver.run('DELETE FROM dose_schedule_weekday WHERE schedule_id = ?', [scheduleId]);
      await driver.run('DELETE FROM dose_schedule_dose_amount WHERE schedule_id = ?', [scheduleId]);
    }

    for (const weekday of schedule.weekdays ?? []) {
      await driver.run('INSERT INTO dose_schedule_weekday (schedule_id, weekday) VALUES (?, ?)', [
        scheduleId,
        weekday
      ]);
    }
    for (const [position, amount] of (schedule.doseAmounts ?? []).entries()) {
      await driver.run(
        'INSERT INTO dose_schedule_dose_amount (schedule_id, position, dose, dose_unit) VALUES (?, ?, ?, ?)',
        [scheduleId, position, amount.dose, amount.doseUnit]
      );
    }
  }
}

export async function applyDosePauses(restoring: Restoring): Promise<void> {
  await applyOwnedRows(
    restoring,
    restoring.journal.dosePauses,
    { table: 'dose_pause', owner: 'regimen_episode', ownerOf: (pause) => pause.episodeId },
    {
      columns: ['start_epoch_day', 'end_epoch_day', 'reason'],
      values: (pause) => [pause.startEpochDay, pause.endEpochDay, pause.reason]
    }
  );
}

/** Flat, like applyBodyRegions: no children, built-in only (no custom
    categories), matched on key alone. */
export async function applyEffectCategories(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'effect_category');

  for (const category of journal.effectCategories) {
    const fate = fateOf(gate, category.key, category, ts);
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run('UPDATE effect_category SET name = ?, enabled = ?, updated_at = ? WHERE key = ?', [
        category.name,
        flag(category.enabled),
        stampOf(category, ts),
        category.key
      ]);
      continue;
    }
    await driver.run('INSERT INTO effect_category (key, name, enabled, updated_at) VALUES (?, ?, ?, ?)', [
      category.key,
      category.name,
      flag(category.enabled),
      stampOf(category, ts)
    ]);
  }
}

/** The effect vocabulary itself, a flat shape like the other vocabulary
    sections here: a custom's key is its own minted uuid
    (personalEffects.ts), the column NOT NULL for the built-ins' sake. */
export async function applyPersonalEffectTypes(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'personal_effect_type');

  for (const type of journal.personalEffectTypes) {
    const fate = fateOf(gate, type.key, type, ts);
    if (fate === 'keep') continue;
    if (fate === 'update') {
      await driver.run(
        'UPDATE personal_effect_type SET name = ?, category_key = ?, direction = ?, hidden = ?, updated_at = ? WHERE key = ?',
        [type.name, type.categoryKey, type.direction, flag(type.hidden), stampOf(type, ts), type.key]
      );
      continue;
    }
    await driver.run(
      'INSERT INTO personal_effect_type (uuid, key, name, is_built_in, category_key, direction, hidden, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        type.builtIn ? null : type.key,
        type.key,
        type.name,
        flag(type.builtIn),
        type.categoryKey,
        type.direction,
        flag(type.hidden),
        stampOf(type, ts)
      ]
    );
  }
}

/* A hair photo owns no other row (its own table in schema.ts, not a
   third owner on `photo`), so it is matched and written directly by uuid:
   there is no owner row to resolve. */
export async function applyHairPhotos(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'hair_photo');

  const inserting: unknown[][] = [];
  for (const photo of journal.hairPhotos) {
    const fate = fateOf(gate, photo.id, photo, ts);
    if (fate === 'insert') inserting.push([photo.id, photo.epochDay, photo.fileName, stampOf(photo, ts)]);
    if (fate === 'update') {
      await driver.run('UPDATE hair_photo SET epoch_day = ?, file_path = ?, updated_at = ? WHERE uuid = ?', [
        photo.epochDay, photo.fileName, stampOf(photo, ts), photo.id
      ]);
    }
  }
  await insertRows(driver, 'INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at)', inserting);
}

/** A costed row's three cost columns from its archive fields; absent (an
    archive written before functional audit ticket 30) is no cost. */
function costValues(row: ArchiveCostFields): [number | null, string | null, number] {
  return [row.costAmount ?? null, row.costCurrency ?? null, row.costRefunded ? 1 : 0];
}

/** A session's cost columns and note. An archive written before ticket 30
    carries the free-text `cost` instead, read by the rule version 115 used
    (cost.ts, cost-migration.ts): a clean parse is the amount, anything else
    joins the note, so a restore loses no text the migration would have
    kept. */
function sessionCostAndNote(session: ArchiveHairRemovalSession): [number | null, string | null, number, string | null] {
  const note = session.note ?? null;
  const legacy = session.cost?.trim() ?? '';
  if (session.costAmount != null || session.costRefunded || !legacy) return [...costValues(session), note];
  const parsed = parseLegacyCostText(legacy, deviceDefaultCurrency());
  return parsed ? [parsed.amount, parsed.currency, 0, note] : [null, null, 0, appendLegacyCost(note, session.cost ?? '')];
}

/* A session is matched and written directly by uuid. Its photos are walked
   in both modes regardless, the same reason applyChecklists walks a
   checklist's items even when the checklist itself is already here: a
   photo is its own row with its own identity. */
export async function applyHairRemovalSessions(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const sessions = await rowGate(restoring, 'hair_removal_session');
  const photos = await rowGate(restoring, 'hair_removal_photo');

  for (const session of journal.hairRemovalSessions) {
    const fate = fateOf(sessions, session.id, session, ts);
    const values = [
      session.epochDay,
      session.area,
      session.method,
      session.painRating,
      session.minutes ?? null,
      ...sessionCostAndNote(session),
      session.provider,
      stampOf(session, ts),
      session.id
    ];
    if (fate === 'insert') {
      await driver.run(
        `INSERT INTO hair_removal_session (epoch_day, area, method, pain_rating, minutes,
                                           cost_amount, cost_currency, cost_refunded, note, provider, updated_at, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }
    if (fate === 'update') {
      await driver.run(
        `UPDATE hair_removal_session SET epoch_day = ?, area = ?, method = ?, pain_rating = ?, minutes = ?,
           cost_amount = ?, cost_currency = ?, cost_refunded = ?, note = ?, provider = ?, updated_at = ? WHERE uuid = ?`,
        values
      );
    }

    const [found] = await driver.query<{ id: number }>('SELECT id FROM hair_removal_session WHERE uuid = ?', [session.id]);
    if (!found) continue;
    for (const photo of session.photos) {
      const photoFate = fateOf(photos, photo.id, photo, ts);
      const photoValues = [found.id, photo.fileName, stampOf(photo, ts), photo.id];
      if (photoFate === 'insert') {
        await driver.run('INSERT INTO hair_removal_photo (session_id, file_path, updated_at, uuid) VALUES (?, ?, ?, ?)', photoValues);
      }
      if (photoFate === 'update') {
        await driver.run('UPDATE hair_removal_photo SET session_id = ?, file_path = ?, updated_at = ? WHERE uuid = ?', photoValues);
      }
    }
  }
}

/* A procedure is matched and written directly by uuid like
   applyHairRemovalSessions, and its photos are walked in both modes the same
   way.

   Its recovery checklist is not touched here. That is an ordinary
   `checklist` row naming this procedure as its owner, and applyChecklists
   restores it on its own - the owner pair is matched by uuid rather than
   resolved to a rowid, so neither section has to run before the other. */
export async function applyProcedures(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const procedures = await rowGate(restoring, 'procedure');
  const photos = await rowGate(restoring, 'procedure_photo');

  for (const procedure of journal.procedures) {
    const fate = fateOf(procedures, procedure.id, procedure, ts);
    const values = [
      procedure.name,
      procedure.surgeryEpochDay,
      procedure.notes,
      // Absent on an archive written before ticket 17, read the same
      // way `upsertProcedure` defaults a write that names neither.
      procedure.kind ?? 'custom',
      procedure.dilationOptIn ? 1 : 0,
      procedure.archived ? 1 : 0,
      ...costValues(procedure),
      stampOf(procedure, ts),
      procedure.id
    ];
    if (fate === 'insert') {
      await driver.run(
        `INSERT INTO procedure (name, surgery_epoch_day, notes, kind, dilation_opt_in, archived,
                                cost_amount, cost_currency, cost_refunded, updated_at, uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }
    if (fate === 'update') {
      await driver.run(
        `UPDATE procedure SET name = ?, surgery_epoch_day = ?, notes = ?, kind = ?, dilation_opt_in = ?, archived = ?,
           cost_amount = ?, cost_currency = ?, cost_refunded = ?, updated_at = ? WHERE uuid = ?`,
        values
      );
    }

    const [found] = await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [procedure.id]);
    if (!found) continue;
    for (const photo of procedure.photos) {
      const photoFate = fateOf(photos, photo.id, photo, ts);
      const photoValues = [found.id, photo.epochDay, photo.fileName, stampOf(photo, ts), photo.id];
      if (photoFate === 'insert') {
        await driver.run(
          'INSERT INTO procedure_photo (procedure_id, epoch_day, file_path, updated_at, uuid) VALUES (?, ?, ?, ?, ?)', photoValues
        );
      }
      if (photoFate === 'update') {
        await driver.run(
          'UPDATE procedure_photo SET procedure_id = ?, epoch_day = ?, file_path = ?, updated_at = ? WHERE uuid = ?', photoValues
        );
      }
    }
  }
}

/** The dilation taper schedule (ticket 12; schema v83 gave it the procedure
    link), resolving that link the way `applyAppointments` below does and
    needing `procedures` applied first for the same reason.

    A taper naming a procedure this journal does not hold is dropped rather
    than kept link-less: `procedure_id` is NOT NULL, and the schedule says
    nothing on its own - its whole reading is days since that procedure's
    surgery.

    One taper per procedure (functional audit ticket 25, schema v112's
    UNIQUE index): a merge that brings a second schedule for a procedure
    this journal already has one for keeps the one already here, newer or
    not; only the same taper's newer copy is written over it. An archive
    written before v112 can itself carry two for a procedure; the export
    lists them in row order, so the later one stands for the newer and is
    the one offered, the survivor the v112 migration picks too. */
export async function applyTaper(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'taper');
  const latestPerProcedure = new Map(journal.taper.map((taper) => [taper.procedureId, taper]));

  for (const taper of latestPerProcedure.values()) {
    const rows = await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [taper.procedureId]);
    if (!rows[0]) continue;
    const fate = fateOf(gate, taper.id, taper, ts);
    if (fate === 'insert') {
      await driver.run(
        `INSERT INTO taper (uuid, procedure_id, start_epoch_day, stages, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (procedure_id) DO NOTHING`,
        [taper.id, rows[0].id, taper.startEpochDay, taper.stagesJson, stampOf(taper, ts)]
      );
    }
    if (fate === 'update') {
      await driver.run('UPDATE taper SET start_epoch_day = ?, stages = ?, updated_at = ? WHERE uuid = ?', [
        taper.startEpochDay, taper.stagesJson, stampOf(taper, ts), taper.id
      ]);
    }
  }
}

/** Appointments (ticket 57, ADR-0066), by uuid like every other user-owned
    row; the only things they resolve are the procedure and provider links,
    which travel as uuids and so need `procedures` and `providers` applied
    first (the section's `after`).

    An appointment naming a procedure or provider this journal does not hold
    keeps its day and loses the link, rather than being dropped: a dated
    record of a visit is worth more than the link is. */
export async function applyAppointments(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'appointment');
  const statuses = await rowGate(restoring, 'appointment_status');

  for (const appointment of journal.appointments) {
    const fate = fateOf(gate, appointment.id, appointment, ts);
    if (fate !== 'keep') await writeAppointment(driver, appointment, fate, stampOf(appointment, ts));

    /* A wait's updates (ticket 26), each by its own uuid and `updated_at`
       even under an appointment this journal already held: an update
       written on the other device since the last restore is a new fact
       about the same wait. Absent on archives written before the ticket. */
    const [found] = await driver.query<{ id: number }>('SELECT id FROM appointment WHERE uuid = ?', [appointment.id]);
    if (!found) continue;
    for (const status of appointment.statuses ?? []) {
      const statusFate = fateOf(statuses, status.id, status, ts);
      const values = [found.id, status.epochDay, status.status, stampOf(status, ts), status.id];
      if (statusFate === 'insert') {
        await driver.run(
          'INSERT INTO appointment_status (appointment_id, epoch_day, status, updated_at, uuid) VALUES (?, ?, ?, ?, ?)', values
        );
      }
      if (statusFate === 'update') {
        await driver.run(
          'UPDATE appointment_status SET appointment_id = ?, epoch_day = ?, status = ?, updated_at = ? WHERE uuid = ?', values
        );
      }
    }
  }
}

async function writeAppointment(
  driver: SqliteDriver,
  appointment: ArchiveAppointment,
  fate: 'insert' | 'update',
  updatedAt: number
): Promise<void> {
  // Not `rowidWhere`: that one throws on an id it cannot find, and the
  // whole point here is that an unresolvable link is dropped rather than
  // taking the appointment down with it.
  const rows = appointment.procedureId
    ? await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [appointment.procedureId])
    : [];
  // The provider (ticket 27) the same way. And a time only on a row with a
  // day, which is the only place appointments.ts ever writes one.
  const providers = appointment.providerId
    ? await driver.query<{ id: number }>('SELECT id FROM provider WHERE uuid = ?', [appointment.providerId])
    : [];

  const values = [
    rows[0]?.id ?? null,
    appointment.epochDay,
    appointment.kind,
    appointment.place,
    appointment.note,
    appointment.referredEpochDay ?? null,
    appointment.epochDay === null ? null : (appointment.time ?? null),
    providers[0]?.id ?? null,
    ...costValues(appointment),
    updatedAt,
    appointment.id
  ];
  if (fate === 'insert') {
    await driver.run(
      `INSERT INTO appointment (procedure_id, epoch_day, kind, place, note, referred_epoch_day,
                                time_of_day, provider_id, cost_amount, cost_currency, cost_refunded, updated_at, uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
    return;
  }
  await driver.run(
    `UPDATE appointment SET procedure_id = ?, epoch_day = ?, kind = ?, place = ?, note = ?, referred_epoch_day = ?,
       time_of_day = ?, provider_id = ?, cost_amount = ?, cost_currency = ?, cost_refunded = ?, updated_at = ?
     WHERE uuid = ?`,
    values
  );
}

/** The column list import_log's insert shares with `recordImport` below -
    that one writes always and one row at a time (a record is a new fact
    every commit), this one writes what the archive's gate lets in, many
    rows at once. Named once here so a column added later is one edit
    rather than two kept in sync by hand. */
export const IMPORT_LOG_COLUMNS = 'uuid, source, counts, imported_at, updated_at';

/** One import_log row for a commit that has just happened, direct rather
    than through the ordinary merge: this record is not content a device
    might already have - it is a new fact every time, minted here the way any other user-owned row is
    (phase 7 ticket 03).

    Called from inside the restore's own transaction (restore.ts) and from
    nowhere else, which is what makes the history and the rows it describes
    one commit rather than two (audit A1). */
export async function recordImport(
  driver: SqliteDriver,
  source: string,
  counts: Record<string, number>
): Promise<void> {
  const ts = now();
  await driver.run(
    `INSERT INTO import_log (${IMPORT_LOG_COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
    importLogRow({ id: mintUuid(), source, counts, importedAt: ts }, ts)
  );
}

/** One import_log row's values, in `IMPORT_LOG_COLUMNS`' order. Shared the
    same reason the column list is. */
export function importLogRow(
  record: { id: string; source: string; counts: Record<string, number>; importedAt: number },
  ts: number
): unknown[] {
  return [record.id, record.source, JSON.stringify(record.counts), record.importedAt, ts];
}

/** The import log (phase 7 ticket 03), by uuid like every other user-owned
    row. Every record already carries its own minted uuid and timestamp
    (journal/archive.ts writes it once, on commit), so `ts` here only stamps
    `updated_at` for an archive that carries none - never the moment the
    import itself happened. */
export async function applyImportLog(restoring: Restoring): Promise<void> {
  const { driver, journal, ts } = restoring;
  const gate = await rowGate(restoring, 'import_log');
  const inserting: unknown[][] = [];
  for (const record of journal.importLog) {
    const fate = fateOf(gate, record.id, record, ts);
    if (fate === 'insert') inserting.push(importLogRow(record, stampOf(record, ts)));
    if (fate === 'update') {
      const [, source, counts, importedAt, updatedAt] = importLogRow(record, stampOf(record, ts));
      await driver.run('UPDATE import_log SET source = ?, counts = ?, imported_at = ?, updated_at = ? WHERE uuid = ?', [
        source, counts, importedAt, updatedAt, record.id
      ]);
    }
  }
  await insertRows(driver, `INSERT INTO import_log (${IMPORT_LOG_COLUMNS})`, inserting);
}
