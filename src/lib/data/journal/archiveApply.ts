/* How each archive section's rows are written back into the journal, wired
   into the registry by archiveSections.ts and run inside restore.ts's single
   transaction.

   A flat area needs no function here at all: applyFlatTable() below writes it
   from the descriptor the registry declares (archiveTable.ts). What is left
   is the sections whose merge semantics are their own - a matched row a
   Replace overwrites in place, a child table walked in both modes, a rowid
   resolved against a section that ran earlier.

   Merge semantics are each section's own, not the registry's. They differ
   for reasons the individual comments record - a roadmap check must survive
   a merge that does not carry it, a tag group walks its tags in both modes,
   an episode may hold only one schedule - and a policy language wide enough
   to state all of them would be a wider interface over less behaviour than
   the functions themselves. What the registry decides is which sections
   exist and in what order they insert.

   The rules every one of them follows are in restore.ts's header: matched
   rows are skipped rather than overwritten in Merge, `ts` is this device's
   clock and never the archive's, and the columns are what validate a value
   on the way in. */

import { bodyRegionIsLogged } from '../bodyMap';
import { foldText } from '../fold';
import type { ArchiveJournal } from '../archive/payload';
import type { SqliteDriver } from '../sqlite/driver';
import type { RestoreMode } from './restore';
import { assertChanged, rowidWhere } from './support';
import { columnsOf, identityFieldOf, type FlatTable } from './archiveTable';

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
  table: 'entry' | 'milestone' | 'regimen_episode' | 'doubt_snapshot' | 'tryout',
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

/** A flat area's rows written back from the one descriptor that declares
    its columns (archiveTable.ts): the rows this table's identity column does
    not already hold, inserted with the import's own clock. The generic half
    of what used to be one hand-written applier per flat area - a present-id
    query, a filter and an insert list.

    Merge and Replace do the same thing here, and that is the whole reason a
    section qualifies as flat: a matched row is skipped either way, because
    there is nothing on one of these rows that a Replace would overwrite in
    place. `mode` is therefore not read, and the vocabulary sections that do
    have that branch keep their own functions.

    Takes the rows rather than the section's name, so the registry hands over
    `journal[name]` already typed as what `ArchiveJournal` says the section
    holds - the descriptor's compile-time link to the wire type would be lost
    to a lookup by string. */
export async function applyFlatTable<Row>(
  table: FlatTable<Row>,
  rows: readonly Row[],
  { driver, ts }: Restoring
): Promise<void> {
  const columns = columnsOf(table);
  const identity = identityFieldOf(table);
  const present = await presentIds(driver, `SELECT ${table.identity} AS id FROM ${table.table}`);

  const fields = (row: Row) => row as Record<string, unknown>;
  const inserting = rows.filter((row) => !present.has(String(fields(row)[identity])));
  await insertRows(
    driver,
    `INSERT INTO ${table.table} (${columns.map((c) => c.column).join(', ')}, updated_at)`,
    inserting.map((row) => [
      ...columns.map(({ field, bool: isBool, whenAbsent }) => {
        const value = fields(row)[field];
        if (isBool) return flag(value === true);
        return value === undefined ? whenAbsent : value;
      }),
      ts
    ])
  );
}

export async function applyDimensions({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT key AS id FROM gender_dimension');

  for (const dimension of journal.dimensions) {
    if (present.has(dimension.key)) {
      if (mode === 'merge') continue;
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
          ts,
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
        ts
      ]
    );
  }
}

export async function applyPresets({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT COALESCE(key, uuid) AS id FROM gender_preset');

  for (const preset of journal.presets) {
    if (present.has(preset.id)) {
      // A matched preset keeps the dimensions it offers, which is why Merge
      // stops here rather than adding the archive's links to them.
      if (mode === 'merge') continue;
      await driver.run('UPDATE gender_preset SET name = ?, updated_at = ? WHERE COALESCE(key, uuid) = ?', [
        preset.name,
        ts,
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
        ts
      ]);
    }

    const presetId = await rowidWhere(driver, 'gender_preset', 'COALESCE(key, uuid) = ?', [preset.id], 'preset id');
    for (const [orderIndex, key] of (preset.dims ?? []).entries()) {
      const result = await driver.run(
        `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
         SELECT ?, id, ? FROM gender_dimension WHERE key = ?`,
        [presetId, orderIndex, key]
      );
      assertChanged(result, `dimension ${key} in preset ${preset.id}`);
    }
  }
}

/** Entry templates (phase 6 ticket 07, ADR-0002) - the same shape
    applyPresets gives a built-in-or-authored area with child links: a
    matched row's children only ever come from a Replace, the same "Merge
    keeps what is already offered" rule presets gives, and a template with
    no presentation on the far side is exactly `presentationId ?? null`,
    the same resting state applyEntries gives an entry (ADR-0010). */
export async function applyEntryTemplates({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT COALESCE(key, uuid) AS id FROM entry_template');

  for (const template of journal.entryTemplates) {
    if (present.has(template.id)) {
      if (mode === 'merge') continue;
      await driver.run(
        `UPDATE entry_template SET name = ?, note_scaffold = ?, presentation_id = ?, hidden = ?, updated_at = ?
         WHERE COALESCE(key, uuid) = ?`,
        [template.name, template.noteScaffold, template.presentationId ?? null, flag(template.hidden), ts, template.id]
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
        `INSERT INTO entry_template (uuid, key, name, note_scaffold, presentation_id, hidden, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          template.builtIn ? null : template.id,
          template.builtIn ? template.id : null,
          template.name,
          template.noteScaffold,
          template.presentationId ?? null,
          flag(template.hidden),
          ts
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
    for (const tagId of template.tags ?? []) {
      const result = await driver.run(
        `INSERT INTO entry_template_tag (template_id, tag_id)
         SELECT ?, id FROM tag WHERE key = ? OR uuid = ?`,
        [templateId, tagId, tagId]
      );
      assertChanged(result, `tag ${tagId} in entry template ${template.id}`);
    }
    for (const [key, value] of Object.entries(template.dims ?? {})) {
      const result = await driver.run(
        `INSERT INTO entry_template_dimension_value (template_id, dimension_id, value)
         SELECT ?, id, ? FROM gender_dimension WHERE key = ?`,
        [templateId, value, key]
      );
      assertChanged(result, `dimension ${key} in entry template ${template.id}`);
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
   order the user arranged them in. A Replace installs those positions. A
   Merge cannot: the tags already in a group hold positions of their own, so
   an added one goes after them, which is where addTag puts a new tag anyway.
   Groups are not reorderable at all (F17 offers a drag for tags only), so a
   group a Merge adds keeps the archive's position. */
export async function applyTagGroups({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const groups = await presentIds(driver, 'SELECT key AS id FROM tag_group');
  const tags = await presentIds(driver, 'SELECT COALESCE(key, uuid) AS id FROM tag');

  for (const [groupIndex, group] of journal.tagGroups.entries()) {
    if (!groups.has(group.key)) {
      await driver.run(
        'INSERT INTO tag_group (uuid, key, name, enabled, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [group.builtIn ? null : group.key, group.key, group.name, flag(group.enabled), groupIndex, ts]
      );
    } else if (mode === 'replace') {
      await driver.run('UPDATE tag_group SET name = ?, enabled = ?, order_index = ?, updated_at = ? WHERE key = ?', [
        group.name,
        flag(group.enabled),
        groupIndex,
        ts,
        group.key
      ]);
    }

    /* A group that is already here still has its tags walked, in both modes:
       a tag is its own row with its own identity, so one the archive carries
       and this device does not is exactly what Merge is for. */
    const groupId = await rowidWhere(driver, 'tag_group', 'key = ?', [group.key], 'group key');
    for (const [tagIndex, tag] of (group.tags ?? []).entries()) {
      if (tags.has(tag.id)) {
        if (mode === 'merge') continue;
        await driver.run(
          `UPDATE tag SET group_id = ?, label = ?, hidden = ?, order_index = ?, updated_at = ?
           WHERE COALESCE(key, uuid) = ?`,
          [groupId, tag.label, flag(tag.hidden), tagIndex, ts, tag.id]
        );
        continue;
      }
      const orderIndex = mode === 'replace' ? tagIndex : await nextTagOrderIndex(driver, groupId);
      await driver.run(
        'INSERT INTO tag (uuid, key, group_id, label, hidden, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tag.builtIn ? null : tag.id, tag.builtIn ? tag.id : null, groupId, tag.label, flag(tag.hidden), orderIndex, ts]
      );
    }
  }
}

/** No children to walk, unlike applyTagGroups: an affirmation is a flat row,
    so a matched one is simply updated (Replace) or left alone (Merge), the
    same "matched rows are skipped in Merge" rule every other flat section
    follows (restore.ts's header). */
export async function applyAffirmations({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT COALESCE(key, uuid) AS id FROM affirmation');

  for (const a of journal.affirmations) {
    if (present.has(a.id)) {
      if (mode === 'merge') continue;
      await driver.run(
        'UPDATE affirmation SET language = ?, text = ?, hidden = ?, updated_at = ? WHERE COALESCE(key, uuid) = ?',
        [a.language, a.text, flag(a.hidden), ts, a.id]
      );
      continue;
    }
    await driver.run(
      'INSERT INTO affirmation (uuid, key, language, text, hidden, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [a.builtIn ? null : a.id, a.builtIn ? a.id : null, a.language, a.text, flag(a.hidden), ts]
    );
  }
}

/** A flat row, like applyAffirmations - a matched one is simply updated
    (Replace) or left alone (Merge). */
export async function applyBodyRegions({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT COALESCE(key, uuid) AS id FROM body_region');

  for (const r of journal.bodyRegions) {
    if (present.has(r.id)) {
      if (mode === 'merge') continue;
      await driver.run('UPDATE body_region SET name = ?, hidden = ?, updated_at = ? WHERE COALESCE(key, uuid) = ?', [
        r.name,
        flag(r.hidden),
        ts,
        r.id
      ]);
      continue;
    }
    await driver.run('INSERT INTO body_region (uuid, key, name, hidden, updated_at) VALUES (?, ?, ?, ?, ?)', [
      r.builtIn ? null : r.id,
      r.builtIn ? r.id : null,
      r.name,
      flag(r.hidden),
      ts
    ]);
  }
}

export async function applyEntries({ driver, journal, ts }: Restoring): Promise<void> {
  // Merge skips a matched entry whole, photos included: leaving the row alone
  // and adding its photos would be a half-merge of one entry.
  const present = await presentIds(driver, 'SELECT uuid AS id FROM entry');

  const inserting = journal.entries.filter((entry) => !present.has(entry.uuid));
  if (inserting.length === 0) return;

  await insertRows(
    driver,
    'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, starred, presentation_id, updated_at)',
    inserting.map((entry) => [
      entry.uuid,
      entry.epochDay,
      entry.timestamp,
      entry.mood,
      entry.note,
      flag(entry.starred),
      // Absent on an archive written before this ticket - null, the same
      // resting state an unset presentation always reads (ADR-0010).
      // Written as-is (no rowid resolved): the same plain-text FK
      // milestone.procedureId/tryoutId already carry.
      entry.presentationId ?? null,
      ts
    ])
  );

  const entryIds = await rowidsByUuid(
    driver,
    'entry',
    inserting.map((entry) => entry.uuid)
  );

  const dimensionKeys = [...new Set(inserting.flatMap((entry) => Object.keys(entry.dims ?? {})))];
  const dimensionIds = new Map<string, number>();
  for (const keyChunk of chunked(dimensionKeys, ID_CHUNK)) {
    const placeholders = keyChunk.map(() => '?').join(', ');
    const rows = await driver.query<{ id: number; key: string }>(
      `SELECT id, key FROM gender_dimension WHERE key IN (${placeholders})`,
      keyChunk
    );
    for (const row of rows) dimensionIds.set(row.key, row.id);
  }
  for (const key of dimensionKeys) {
    if (!dimensionIds.has(key)) throw new Error(`unknown dimension: ${key}`);
  }

  const tagDomainIds = [...new Set(inserting.flatMap((entry) => entry.tags ?? []))];
  const tagIds = new Map<string, number>();
  for (const idChunk of chunked(tagDomainIds, ID_CHUNK)) {
    const placeholders = idChunk.map(() => '?').join(', ');
    const rows = await driver.query<{ id: number; key: string | null; uuid: string | null }>(
      `SELECT id, key, uuid FROM tag WHERE key IN (${placeholders}) OR uuid IN (${placeholders})`,
      [...idChunk, ...idChunk]
    );
    for (const row of rows) {
      if (row.key !== null) tagIds.set(row.key, row.id);
      if (row.uuid !== null) tagIds.set(row.uuid, row.id);
    }
  }
  for (const id of tagDomainIds) {
    if (!tagIds.has(id)) throw new Error(`unknown tag: ${id}`);
  }

  const ftsRows: unknown[][] = [];
  const dimensionRows: unknown[][] = [];
  const tagRows: unknown[][] = [];
  const photoRows: unknown[][] = [];
  const recordingRows: unknown[][] = [];
  const videoRows: unknown[][] = [];
  const bodyRegionRows: unknown[][] = [];

  for (const entry of inserting) {
    const entryId = entryIds.get(entry.uuid);
    if (entryId === undefined) {
      throw new Error(`entry row id missing after restore insert: ${entry.uuid}`);
    }

    /* The index is contentless and holds folded text against the entry's
       rowid (ADR-0005), written by the same fold the query uses. A plain
       insert with no delete first: entry.id is AUTOINCREMENT, so a rowid is
       never reused, and a Replace's deletes took the old index rows with
       them. */
    ftsRows.push([entryId, foldText(entry.note)]);

    /* `?? {}` and `?? []` rather than trusting the types: this shape is read
       off a file someone else wrote, and the interface only describes what
       this app puts in one. */
    for (const [key, value] of Object.entries(entry.dims ?? {})) {
      dimensionRows.push([entryId, dimensionIds.get(key)!, value]);
    }

    for (const id of entry.tags ?? []) {
      tagRows.push([entryId, tagIds.get(id)!]);
    }

    for (const [orderIndex, photo] of (entry.photos ?? []).entries()) {
      photoRows.push([photo.id, entryId, null, photo.fileName, orderIndex, flag(photo.starred), ts]);
    }

    for (const [orderIndex, recording] of (entry.recordings ?? []).entries()) {
      recordingRows.push([recording.id, entryId, recording.fileName, orderIndex, ts]);
    }

    for (const [orderIndex, video] of (entry.videos ?? []).entries()) {
      videoRows.push([video.id, entryId, video.fileName, orderIndex, ts]);
    }

    // Unlike dims and tags, a region key is not resolved against a stored
    // row - there is none (bodyMap.ts) - so it travels straight through,
    // the same forward-compatible treatment lab_result.analyte gets: an
    // archive from a build that knows a region this one does not still
    // restores rather than failing the whole import.
    for (const [region, feeling] of Object.entries(entry.bodyRegions ?? {})) {
      const f = { dysphoria: feeling?.dysphoria ?? null, euphoria: feeling?.euphoria ?? null };
      // Both null would fail the CHECK and says nothing the region's absence
      // does not, so it is dropped rather than aborting the import.
      if (!bodyRegionIsLogged(f)) continue;
      bodyRegionRows.push([entryId, region, f.dysphoria, f.euphoria]);
    }
  }

  await insertRows(driver, 'INSERT INTO entry_fts (rowid, folded_text)', ftsRows);
  await insertRows(driver, 'INSERT INTO entry_dimension_value (entry_id, dimension_id, value)', dimensionRows);
  await insertRows(driver, 'INSERT INTO entry_tag (entry_id, tag_id)', tagRows);
  await insertRows(driver, 'INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria)', bodyRegionRows);
  await insertRows(
    driver,
    'INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, starred, updated_at)',
    photoRows
  );
  await insertRows(
    driver,
    'INSERT INTO voice_recording (uuid, entry_id, file_path, order_index, updated_at)',
    recordingRows
  );
  await insertRows(driver, 'INSERT INTO video_note (uuid, entry_id, file_path, order_index, updated_at)', videoRows);
}

export async function applyMilestones({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM milestone');

  const inserting = journal.milestones.filter((milestone) => !present.has(milestone.id));
  if (inserting.length === 0) return;

  await insertRows(
    driver,
    'INSERT INTO milestone (uuid, name, epoch_day, description, template_key, roadmap_goal_key, procedure_id, tryout_id, updated_at)',
    inserting.map((milestone) => [
      milestone.id,
      milestone.name,
      milestone.epochDay,
      // An archive written before ticket 15 has no description key, so
      // JSON.parse leaves it undefined rather than null.
      milestone.description ?? '',
      milestone.templateKey,
      milestone.roadmapGoalKey ?? null,
      milestone.procedureId ?? null,
      milestone.tryoutId ?? null,
      ts
    ])
  );

  const milestoneIds = await rowidsByUuid(
    driver,
    'milestone',
    inserting.map((milestone) => milestone.id)
  );

  const photoRows: unknown[][] = [];
  for (const milestone of inserting) {
    if (!milestone.photo) continue;
    const milestoneId = milestoneIds.get(milestone.id);
    if (milestoneId === undefined) {
      throw new Error(`milestone row id missing after restore insert: ${milestone.id}`);
    }
    photoRows.push([milestone.photo.id, null, milestoneId, milestone.photo.fileName, 0, flag(milestone.photo.starred), ts]);
  }

  await insertRows(
    driver,
    'INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, starred, updated_at)',
    photoRows
  );
}

export async function applyMeasurementTypes({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT key AS id FROM measurement_type');

  for (const type of journal.measurementTypes) {
    if (present.has(type.key)) {
      if (mode === 'merge') continue;
      await driver.run('UPDATE measurement_type SET name = ?, hidden = ?, updated_at = ? WHERE key = ?', [
        type.name,
        flag(type.hidden),
        ts,
        type.key
      ]);
      continue;
    }
    // A custom type's key is its own uuid (measurements.ts): the column is
    // NOT NULL for the built-ins' sake, and one identity is enough for a
    // row the user made.
    await driver.run(
      'INSERT INTO measurement_type (uuid, key, name, is_built_in, hidden, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [type.builtIn ? null : type.key, type.key, type.name, flag(type.builtIn), flag(type.hidden), ts]
    );
  }
}

/* Matched by uuid, like applyEntries: a snapshot's items are inserted
   right after it, against the rowid the insert above just produced - the
   same owner-then-detail-rows order applyEntries uses for photos. */
export async function applyCounterevidenceSnapshots({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM doubt_snapshot');

  const inserting = journal.counterevidenceSnapshots.filter((snapshot) => !present.has(snapshot.id));
  if (inserting.length === 0) return;

  await insertRows(
    driver,
    'INSERT INTO doubt_snapshot (uuid, epoch_day, timestamp, updated_at)',
    inserting.map((snapshot) => [snapshot.id, snapshot.epochDay, snapshot.timestamp, ts])
  );

  const snapshotIds = await rowidsByUuid(
    driver,
    'doubt_snapshot',
    inserting.map((snapshot) => snapshot.id)
  );

  const itemRows: unknown[][] = [];
  for (const snapshot of inserting) {
    const snapshotId = snapshotIds.get(snapshot.id);
    if (snapshotId === undefined) {
      throw new Error(`counterevidence snapshot row id missing after restore insert: ${snapshot.id}`);
    }
    for (const [orderIndex, item] of (snapshot.items ?? []).entries()) {
      itemRows.push([snapshotId, orderIndex, item.epochDay, item.mood, item.note]);
    }
  }

  await insertRows(driver, 'INSERT INTO doubt_snapshot_entry (snapshot_id, order_index, epoch_day, mood, note)', itemRows);
}

/* Matched on the pack/goal pair rather than a uuid, the way applyDimensions
   matches a built-in on its key: a status names a bundled goal, so the
   same pair on two devices is the same status and a merge has nothing to
   reconcile. A goal missing from the archive is left alone rather than
   reset to unchecked - Replace already emptied the table before this ran,
   and a merge must not undo a status this device recorded. For the same
   reason a pair already present locally keeps its own status rather than
   taking the archive's: two devices that recorded different statuses for
   one goal resolve to whichever one is not overwritten, the same rule
   that already governed a plain checked/unchecked disagreement before
   this had a third state to disagree about. */
export async function applyRoadmapChecks({ driver, journal, ts }: Restoring): Promise<void> {
  /* Two columns, so the present-set is built here rather than through
     presentIds, which reads a single id column. A newline joins the pair
     because neither key can hold one. */
  const rows = await driver.query<{ pack_key: string; goal_key: string }>(
    'SELECT pack_key, goal_key FROM roadmap_check'
  );
  const present = new Set(rows.map((row) => `${row.pack_key}\n${row.goal_key}`));

  const inserting = journal.roadmapChecks.filter((check) => !present.has(`${check.packKey}\n${check.goalKey}`));
  await insertRows(
    driver,
    'INSERT INTO roadmap_check (pack_key, goal_key, status, updated_at)',
    inserting.map((check) => [check.packKey, check.goalKey, check.status, ts])
  );
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
   unlike applyTagGroups there is nothing to UPDATE on a checklist row that
   is already here. Only its items are walked in both modes, the same reason
   an existing tag group still has its tags walked. */
export async function applyChecklists({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const checklists = await presentIds(driver, 'SELECT uuid AS id FROM checklist');
  const items = await presentIds(driver, 'SELECT uuid AS id FROM checklist_item');

  for (const checklist of journal.checklists) {
    if (!checklists.has(checklist.id)) {
      await driver.run(
        'INSERT INTO checklist (uuid, owner_kind, owner_uuid, appointment_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?)',
        // ?? null: an archive written before ticket 25 has no such key at
        // all, not even a null one, and JSON.parse leaves that as
        // undefined rather than the column's own resting value.
        [checklist.id, checklist.ownerKind, checklist.ownerId, checklist.appointmentEpochDay ?? null, ts]
      );
    }

    const checklistRowId = await rowidWhere(driver, 'checklist', 'uuid = ?', [checklist.id], 'checklist uuid');
    for (const [itemIndex, item] of checklist.items.entries()) {
      if (items.has(item.id)) {
        if (mode === 'merge') continue;
        await driver.run(
          `UPDATE checklist_item SET checklist_id = ?, content = ?, checked = ?, carried_forward = ?, order_index = ?, updated_at = ?
           WHERE uuid = ?`,
          [checklistRowId, item.content, flag(item.checked), flag(item.carriedForward), itemIndex, ts, item.id]
        );
        continue;
      }
      const orderIndex = mode === 'replace' ? itemIndex : await nextChecklistItemOrderIndex(driver, checklistRowId);
      await driver.run(
        `INSERT INTO checklist_item (uuid, checklist_id, content, checked, carried_forward, order_index, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.id, checklistRowId, item.content, flag(item.checked), flag(item.carriedForward), orderIndex, ts]
      );
    }
  }
}

/* Matched by uuid, like applyTallyEvents: a tryout is not a single value
   ticket 14's Replace can safely retire, it is a dated record someone
   might still be adding felt-sense entries against. Its photos are walked
   the same way applyProcedures walks a procedure's: each is its own row
   with its own identity, and one the archive carries that this device
   does not is exactly what Merge is for. */
export async function applyTryouts({ driver, journal, ts }: Restoring): Promise<void> {
  const tryouts = await presentIds(driver, 'SELECT uuid AS id FROM tryout');
  const photos = await presentIds(driver, 'SELECT uuid AS id FROM tryout_photo');

  for (const tryout of journal.tryouts) {
    if (!tryouts.has(tryout.id)) {
      await driver.run(
        'INSERT INTO tryout (uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tryout.id, tryout.kind, tryout.label, tryout.description, tryout.startEpochDay, tryout.endEpochDay, ts]
      );
    }

    const tryoutRowId = await rowidWhere(driver, 'tryout', 'uuid = ?', [tryout.id], 'tryout uuid');

    for (const photo of tryout.photos) {
      if (photos.has(photo.id)) continue;
      await driver.run(
        'INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [photo.id, tryoutRowId, photo.epochDay, photo.fileName, ts]
      );
    }
  }
}

/* Resolves its owner - a tryout or a milestone - by uuid against what
   applyTryouts/applyMilestones just inserted, the same shape
   applyDosePauses uses for its episode. A row whose owner is not there is
   dropped rather than inserted against a guessed one. */
export async function applyFeltSenseEntries({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM felt_sense');
  const tryoutIds = await rowidsByUuid(
    driver,
    'tryout',
    journal.feltSenseEntries.flatMap((entry) => (entry.tryoutId ? [entry.tryoutId] : []))
  );
  const milestoneIds = await rowidsByUuid(
    driver,
    'milestone',
    journal.feltSenseEntries.flatMap((entry) => (entry.milestoneId ? [entry.milestoneId] : []))
  );

  const rows: unknown[][] = [];
  for (const entry of journal.feltSenseEntries) {
    if (present.has(entry.id)) continue;
    const tryoutId = entry.tryoutId ? tryoutIds.get(entry.tryoutId) : undefined;
    const milestoneId = entry.milestoneId ? milestoneIds.get(entry.milestoneId) : undefined;
    if (tryoutId === undefined && milestoneId === undefined) continue;
    rows.push([entry.id, tryoutId ?? null, milestoneId ?? null, entry.epochDay, entry.mood, entry.note, ts]);
  }

  await insertRows(
    driver,
    'INSERT INTO felt_sense (uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at)',
    rows
  );
}

/* Both of these resolve their episode by uuid against what is in the table
   after applyRegimenEpisodes ran. A row whose episode is not there is
   dropped rather than inserted against a guessed episode: a schedule
   belonging to nothing would generate slots nobody expects, and a merge is
   allowed to carry only part of another device's history. */
/* Not the batched insertRows helper the rest of this module uses: a
   schedule's weekdays and dose amounts are child rows that need the parent's
   own rowid back, which a chunked multi-row INSERT does not hand back per
   row. One episode has at most one schedule, so the per-row cost this trades
   away is not one this module needs to have avoided. */
export async function applyDoseSchedules({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM dose_schedule');
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
    if (present.has(schedule.id)) continue;
    const episodeId = episodeIds.get(schedule.episodeId);
    // One schedule per episode (migration v8): a merge must not bring a
    // second one for an episode that already has its own.
    if (episodeId === undefined || episodesWithSchedule.has(schedule.episodeId)) continue;
    episodesWithSchedule.add(schedule.episodeId);

    const result = await driver.run(
      `INSERT INTO dose_schedule (uuid, episode_id, recurrence_kind, every_n_days, doses_per_day, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schedule.id, episodeId, schedule.recurrenceKind, schedule.everyNDays, schedule.dosesPerDay, ts]
    );
    const scheduleId = result.lastInsertRowid;

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

export async function applyDosePauses({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM dose_pause');
  const episodeIds = await rowidsByUuid(
    driver,
    'regimen_episode',
    journal.dosePauses.map((pause) => pause.episodeId)
  );

  const rows: unknown[][] = [];
  for (const pause of journal.dosePauses) {
    if (present.has(pause.id)) continue;
    const episodeId = episodeIds.get(pause.episodeId);
    if (episodeId === undefined) continue;
    rows.push([pause.id, episodeId, pause.startEpochDay, pause.endEpochDay, pause.reason, ts]);
  }

  await insertRows(
    driver,
    'INSERT INTO dose_pause (uuid, episode_id, start_epoch_day, end_epoch_day, reason, updated_at)',
    rows
  );
}

/** Flat, like applyBodyRegions: no children, built-in only (no custom
    categories), matched on key alone. */
export async function applyEffectCategories({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT key AS id FROM effect_category');

  for (const category of journal.effectCategories) {
    if (present.has(category.key)) {
      if (mode === 'merge') continue;
      await driver.run('UPDATE effect_category SET name = ?, enabled = ?, updated_at = ? WHERE key = ?', [
        category.name,
        flag(category.enabled),
        ts,
        category.key
      ]);
      continue;
    }
    await driver.run('INSERT INTO effect_category (key, name, enabled, updated_at) VALUES (?, ?, ?, ?)', [
      category.key,
      category.name,
      flag(category.enabled),
      ts
    ]);
  }
}

/** The effect vocabulary itself, the same flat shape applyMeasurementTypes
    uses: a custom's key is its own minted uuid (personalEffects.ts), the
    column NOT NULL for the built-ins' sake. */
export async function applyPersonalEffectTypes({ driver, mode, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT key AS id FROM personal_effect_type');

  for (const type of journal.personalEffectTypes) {
    if (present.has(type.key)) {
      if (mode === 'merge') continue;
      await driver.run(
        'UPDATE personal_effect_type SET name = ?, category_key = ?, direction = ?, hidden = ?, updated_at = ? WHERE key = ?',
        [type.name, type.categoryKey, type.direction, flag(type.hidden), ts, type.key]
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
        ts
      ]
    );
  }
}

/* A hair photo owns no other row (migrations.ts v13's own table, not a
   third owner on `photo`), so it is matched and inserted directly by uuid
   like applyMeasurements - unlike applyEntries/applyMilestones, there is no
   owner row to insert first and no owner id to resolve. */
export async function applyHairPhotos({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM hair_photo');

  const inserting = journal.hairPhotos.filter((photo) => !present.has(photo.id));
  await insertRows(
    driver,
    'INSERT INTO hair_photo (uuid, epoch_day, file_path, updated_at)',
    inserting.map((photo) => [photo.id, photo.epochDay, photo.fileName, ts])
  );
}

/* A session is matched and inserted directly by uuid like applySideEffects
   - nothing about one changes once logged, so there is no UPDATE branch to
   write. Its photos are walked in both modes regardless, the same reason
   applyChecklists walks a checklist's items even when the checklist itself
   is already here: a photo is its own row with its own identity, and one
   the archive carries that this device does not is exactly what Merge is
   for. */
export async function applyHairRemovalSessions({ driver, journal, ts }: Restoring): Promise<void> {
  const sessions = await presentIds(driver, 'SELECT uuid AS id FROM hair_removal_session');
  const photos = await presentIds(driver, 'SELECT uuid AS id FROM hair_removal_photo');

  for (const session of journal.hairRemovalSessions) {
    if (!sessions.has(session.id)) {
      await driver.run(
        `INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.epochDay,
          session.area,
          session.method,
          session.painRating,
          session.cost,
          session.provider,
          ts
        ]
      );
    }

    const sessionRowId = await rowidWhere(
      driver,
      'hair_removal_session',
      'uuid = ?',
      [session.id],
      'hair removal session uuid'
    );
    for (const photo of session.photos) {
      if (photos.has(photo.id)) continue;
      await driver.run('INSERT INTO hair_removal_photo (uuid, session_id, file_path, updated_at) VALUES (?, ?, ?, ?)', [
        photo.id,
        sessionRowId,
        photo.fileName,
        ts
      ]);
    }
  }
}

/* A procedure is matched and inserted directly by uuid like
   applyHairRemovalSessions, and its consults and photos are walked in both
   modes regardless, the same reason applyChecklists walks a checklist's
   items even when the checklist is already here: each is its own row with
   its own identity, and one the archive carries that this device does not
   is exactly what Merge is for.

   Its recovery checklist is not touched here. That is an ordinary
   `checklist` row naming this procedure as its owner, and applyChecklists
   restores it on its own - the owner pair is matched by uuid rather than
   resolved to a rowid, so neither section has to run before the other. */
export async function applyProcedures({ driver, journal, ts }: Restoring): Promise<void> {
  const procedures = await presentIds(driver, 'SELECT uuid AS id FROM procedure');
  const consults = await presentIds(driver, 'SELECT uuid AS id FROM procedure_consult');
  const photos = await presentIds(driver, 'SELECT uuid AS id FROM procedure_photo');

  for (const procedure of journal.procedures) {
    if (!procedures.has(procedure.id)) {
      await driver.run(
        'INSERT INTO procedure (uuid, name, surgery_epoch_day, notes, updated_at) VALUES (?, ?, ?, ?, ?)',
        [procedure.id, procedure.name, procedure.surgeryEpochDay, procedure.notes, ts]
      );
    }

    const procedureRowId = await rowidWhere(driver, 'procedure', 'uuid = ?', [procedure.id], 'procedure uuid');

    for (const consult of procedure.consults) {
      if (consults.has(consult.id)) continue;
      await driver.run('INSERT INTO procedure_consult (uuid, procedure_id, epoch_day, updated_at) VALUES (?, ?, ?, ?)', [
        consult.id,
        procedureRowId,
        consult.epochDay,
        ts
      ]);
    }

    for (const photo of procedure.photos) {
      if (photos.has(photo.id)) continue;
      await driver.run(
        'INSERT INTO procedure_photo (uuid, procedure_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
        [photo.id, procedureRowId, photo.epochDay, photo.fileName, ts]
      );
    }
  }
}


/** The import log (phase 7 ticket 03): ordinary insert-if-absent by uuid,
    the same as every other user-owned row. Every record already carries its
    own minted uuid and timestamp (journal/archive.ts writes it once, on
    commit), so `ts` here only stamps `updated_at` - the bookkeeping column
    every insert carries, not the moment the import itself happened. */
/** The column list import_log's insert shares with journal/archive.ts's
    `recordImport` - that one writes always, one row at a time and outside
    the merge (a record is a new fact every commit, never insert-if-absent),
    this one is insert-if-absent, many rows at once. Named once here so a
    column added later is one edit rather than two kept in sync by hand. */
export const IMPORT_LOG_COLUMNS = 'uuid, source, counts, imported_at, updated_at';

/** One import_log row's values, in `IMPORT_LOG_COLUMNS`' order. Shared the
    same reason the column list is. */
export function importLogRow(
  record: { id: string; source: string; counts: Record<string, number>; importedAt: number },
  ts: number
): unknown[] {
  return [record.id, record.source, JSON.stringify(record.counts), record.importedAt, ts];
}

export async function applyImportLog({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM import_log');
  const inserting = journal.importLog.filter((record) => !present.has(record.id));
  await insertRows(
    driver,
    `INSERT INTO import_log (${IMPORT_LOG_COLUMNS})`,
    inserting.map((record) => importLogRow(record, ts))
  );
}
