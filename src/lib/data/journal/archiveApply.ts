/* How each archive section's rows are written back into the journal: one
   apply function per section, wired into the registry by archiveSections.ts
   and run inside restore.ts's single transaction.

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
    'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, starred, updated_at)',
    inserting.map((entry) => [
      entry.uuid,
      entry.epochDay,
      entry.timestamp,
      entry.mood,
      entry.note,
      flag(entry.starred),
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
    'INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at)',
    inserting.map((milestone) => [milestone.id, milestone.name, milestone.epochDay, milestone.templateKey, ts])
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

export async function applyLabResults({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM lab_result');

  const inserting = journal.labResults.filter((result) => !present.has(result.id));
  await insertRows(
    driver,
    `INSERT INTO lab_result (uuid, epoch_day, analyte, value, unit, note, draw_time, provider,
                             timing_route, timing_hours, timing_day_of_interval, updated_at)`,
    /* The dosing context comes across as it was written, never re-derived
       against this device's dose log: the log it was measured on is not the
       one being imported into (ticket 03, and the argument at migrations.ts
       v6).

       Coalesced rather than passed straight through, unlike every other
       column here, because these five arrived after lab results did. An
       archive is JSON.parse output cast to ArchivePayload - the type is a
       claim about the file, not a guarantee - so a lab row written by a build
       from before ticket 03 reaches this line with the fields simply absent.
       Binding undefined is not a soft failure: node:sqlite rejects it with
       "Provided value cannot be bound to SQLite parameter 7", a raw driver
       error rather than a CorruptArchiveError, and `provider` is NOT NULL
       besides. An older archive restores with an empty context instead, which
       is the same thing a result logged before the feature carries. */
    inserting.map((result) => [
      result.id,
      result.epochDay,
      result.analyte,
      result.value,
      result.unit,
      result.note,
      result.drawTime ?? null,
      result.provider ?? '',
      result.timingRoute ?? null,
      result.timingHours ?? null,
      result.timingDayOfInterval ?? null,
      ts
    ])
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

export async function applyMeasurements({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM measurement');

  const inserting = journal.measurements.filter((measurement) => !present.has(measurement.id));
  await insertRows(
    driver,
    'INSERT INTO measurement (uuid, epoch_day, type, value, unit, updated_at)',
    inserting.map((measurement) => [
      measurement.id,
      measurement.epochDay,
      measurement.type,
      measurement.value,
      measurement.unit,
      ts
    ])
  );
}

export async function applySizeRecords({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM size_record');

  const inserting = journal.sizeRecords.filter((record) => !present.has(record.id));
  await insertRows(
    driver,
    'INSERT INTO size_record (uuid, epoch_day, category, size, brand, fit_note, updated_at)',
    inserting.map((record) => [record.id, record.epochDay, record.category, record.size, record.brand, record.fitNote, ts])
  );
}

export async function applyRegimenEpisodes({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM regimen_episode');

  const inserting = journal.regimenEpisodes.filter((episode) => !present.has(episode.id));
  await insertRows(
    driver,
    `INSERT INTO regimen_episode
       (uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, hidden, updated_at)`,
    inserting.map((episode) => [
      episode.id,
      episode.drug,
      episode.ester,
      episode.dose,
      episode.doseUnit,
      episode.route,
      episode.interval,
      episode.startEpochDay,
      flag(episode.hidden),
      ts
    ])
  );
}

export async function applyTallyEvents({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM tally_event');

  const inserting = journal.tallyEvents.filter((event) => !present.has(event.id));
  await insertRows(
    driver,
    'INSERT INTO tally_event (uuid, epoch_day, kind, context, updated_at)',
    inserting.map((event) => [event.id, event.epochDay, event.kind, event.context, ts])
  );
}

/* Matched by uuid, like applyMeasurements: a doubt entry is a dated series,
   never a single replaced value. */
export async function applyDoubtEntries({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM doubt_entry');

  const inserting = journal.doubtEntries.filter((entry) => !present.has(entry.id));
  await insertRows(
    driver,
    'INSERT INTO doubt_entry (uuid, epoch_day, timestamp, text, updated_at)',
    inserting.map((entry) => [entry.id, entry.epochDay, entry.timestamp, entry.text, ts])
  );
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

/* Matched by uuid, like applyDoubtEntries: a letter is a dated series, not
   a single replaced value, and carries no children of its own to insert
   afterwards. */
export async function applyLetters({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM letter');

  const inserting = journal.letters.filter((letter) => !present.has(letter.id));
  await insertRows(
    driver,
    'INSERT INTO letter (uuid, epoch_day, text, unlock_epoch_day, updated_at)',
    inserting.map((letter) => [letter.id, letter.epochDay, letter.text, letter.unlockEpochDay, ts])
  );
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

/* Uuid-identified like a checklist, so unlike applyRoadmapChecks a goal
   already present locally is simply skipped rather than compared column
   by column: a custom goal's text and track are fixed at creation
   (roadmap.ts has no rename or move-track setter), so the only thing two
   devices could disagree on is the status, and skipping it here for the
   same reason applyRoadmapChecks does - a merge must not overwrite a
   status this device recorded itself. */
export async function applyRoadmapGoals({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM roadmap_goal');
  const inserting = journal.roadmapGoals.filter((goal) => !present.has(goal.id));
  await insertRows(
    driver,
    'INSERT INTO roadmap_goal (uuid, track, text, status, updated_at)',
    inserting.map((goal) => [goal.id, goal.track, goal.text, goal.status, ts])
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
      await driver.run('INSERT INTO checklist (uuid, owner_kind, owner_uuid, updated_at) VALUES (?, ?, ?, ?)', [
        checklist.id,
        checklist.ownerKind,
        checklist.ownerId,
        ts
      ]);
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

/* Matched by uuid, like applyDoubtEntries: a tryout is not a single value
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

export async function applyDoseEvents({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM dose_event');

  const inserting = journal.doseEvents.filter((dose) => !present.has(dose.id));
  await insertRows(
    driver,
    `INSERT INTO dose_event
       (uuid, timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
        status, scheduled_dose, scheduled_route, scheduled_timestamp, updated_at)`,
    inserting.map((dose) => [
      dose.id,
      dose.timestamp,
      dose.route,
      dose.dose,
      dose.doseUnit,
      dose.injectionSite,
      dose.vehicle,
      dose.applicationSite,
      dose.status,
      dose.scheduledDose,
      dose.scheduledRoute,
      dose.scheduledTimestamp,
      ts
    ])
  );
}

/* Both of these resolve their episode by uuid against what is in the table
   after applyRegimenEpisodes ran. A row whose episode is not there is
   dropped rather than inserted against a guessed episode: a schedule
   belonging to nothing would generate slots nobody expects, and a merge is
   allowed to carry only part of another device's history. */
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

  const rows: unknown[][] = [];
  for (const schedule of journal.doseSchedules) {
    if (present.has(schedule.id)) continue;
    const episodeId = episodeIds.get(schedule.episodeId);
    // One schedule per episode (migration v8): a merge must not bring a
    // second one for an episode that already has its own.
    if (episodeId === undefined || episodesWithSchedule.has(schedule.episodeId)) continue;
    episodesWithSchedule.add(schedule.episodeId);
    rows.push([schedule.id, episodeId, schedule.everyNDays, schedule.dosesPerDay, ts]);
  }

  await insertRows(driver, 'INSERT INTO dose_schedule (uuid, episode_id, every_n_days, doses_per_day, updated_at)', rows);
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

export async function applySideEffects({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM side_effect');

  const inserting = journal.sideEffects.filter((effect) => !present.has(effect.id));
  await insertRows(
    driver,
    'INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at)',
    inserting.map((effect) => [effect.id, effect.name, effect.severity, effect.epochDay, ts])
  );
}

export async function applyCycleEvents({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM cycle_event');

  const inserting = journal.cycleEvents.filter((event) => !present.has(event.id));
  await insertRows(
    driver,
    'INSERT INTO cycle_event (uuid, kind, epoch_day, updated_at)',
    inserting.map((event) => [event.id, event.kind, event.epochDay, ts])
  );
}

export async function applyJournalingPauses({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM journaling_pause');

  const inserting = journal.journalingPauses.filter((pause) => !present.has(pause.id));
  await insertRows(
    driver,
    'INSERT INTO journaling_pause (uuid, start_epoch_day, end_epoch_day, updated_at)',
    inserting.map((pause) => [pause.id, pause.startEpochDay, pause.endEpochDay, ts])
  );
}

/* Matched by `effect`, not by uuid: personal_effect is UNIQUE per effect
   (migrations.ts v12), one row that a fresh date replaces in place rather
   than a log of past dates - the same reasoning applyMedicationStock gives
   for matching by drug. A device that already has its own marker for an
   effect keeps it (Merge's own rule), which a Replace gets for free once
   discardJournalRows has emptied the table first. */
export async function applyPersonalEffects({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT effect AS id FROM personal_effect');

  const inserting = journal.personalEffects.filter((marker) => !present.has(marker.effect));
  await insertRows(
    driver,
    'INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at)',
    inserting.map((marker) => [marker.id, marker.effect, marker.firstNoticedEpochDay, ts])
  );
}

/* Matched by uuid, like applyMeasurements: a staging is a dated series
   entry, not a single replaced value like personal_effect.

   A row with no `scale` came out of an archive written before phase 5
   ticket 33, when Norwood-Hamilton was the only vocabulary there was, so it
   is one - the same reading migrations.ts v37 gives the rows it carried
   across. Defaulting rather than dropping is what keeps an old backup whole;
   a scale this build does not know is left as it is and the schema's CHECK
   refuses it, which is the honest failure for an archive from a future
   build. */
export async function applyHairStages({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM hair_stage');

  const inserting = journal.hairStages.filter((stage) => !present.has(stage.id));
  await insertRows(
    driver,
    'INSERT INTO hair_stage (uuid, epoch_day, scale, stage, description, updated_at)',
    inserting.map((stage) => [
      stage.id,
      stage.epochDay,
      stage.scale ?? 'norwood_hamilton',
      stage.stage,
      stage.description ?? '',
      ts
    ])
  );
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

export async function applyReminders({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM reminder');

  const inserting = journal.reminders.filter((reminder) => !present.has(reminder.id));
  // No rule validation of its own: the schema's recurrence CHECK is the
  // same rule reminderRule.ts states, and this is inside the transaction.
  await insertRows(
    driver,
    `INSERT INTO reminder
       (uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, auto_source, updated_at)`,
    inserting.map((reminder) => [
      reminder.id,
      reminder.title,
      reminder.type,
      reminder.time,
      reminder.recurrence,
      reminder.interval,
      reminder.anchorEpochDay,
      reminder.epochDay,
      flag(reminder.enabled),
      // Coalesced like the lab timing columns (applyLabResults): an
      // archive written before ticket 04 has no such field at all, and
      // binding undefined is a raw node:sqlite error, not a soft failure.
      reminder.autoSource ?? null,
      ts
    ])
  );
}

/* Matched by `drug`, not by uuid: medication_stock is UNIQUE per drug
   (migrations.ts v7), one row that a fresh count replaces in place rather
   than a log of past ones. A device that already has its own entry for a
   drug keeps it - Merge's own rule (CONTEXT: "Merge") - which is also what
   a Replace gets for free once discardJournalRows has emptied the table
   first, the same way applyDoseSchedules checks episode identity rather
   than its own row's uuid. The reminder bookkeeping travels as recorded:
   restoring a device's own backup should restore its own hand-off state,
   not a blank one (see ArchiveMedicationStock's own comment). */
export async function applyMedicationStock({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT drug AS id FROM medication_stock');

  const inserting = journal.medicationStock.filter((entry) => !present.has(entry.drug));
  await insertRows(
    driver,
    `INSERT INTO medication_stock
       (uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed, updated_at)`,
    inserting.map((entry) => [
      entry.id,
      entry.drug,
      entry.quantity,
      entry.unit,
      entry.recordedEpochDay,
      flag(entry.reminderEverCreated),
      flag(entry.reminderDismissed),
      ts
    ])
  );
}

/* No episode or reminder rowid to resolve, unlike dose events and stock -
   a wear session's own optional reminder travels as an ordinary
   ArchiveReminder, matched back up by its auto_source marker rather than a
   link this section would have to carry. */
export async function applyWearSessions({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM wear_session');
  const inserting = journal.wearSessions.filter((session) => !present.has(session.id));
  await insertRows(
    driver,
    'INSERT INTO wear_session (uuid, start_timestamp, duration_ms, note, updated_at)',
    inserting.map((session) => [session.id, session.startTimestamp, session.durationMs, session.note, ts])
  );
}
