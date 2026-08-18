/* Reading an archive back into the journal: Replace and Merge (ticket 14,
   ADR-0011, PRD F14). The inverse of archive.ts's snapshot, and part of the
   same area - one journal operation each, so no caller holds a transaction
   and no caller sequences the areas itself (ADR-0017). It sits in its own
   file because the two halves share nothing but the wire format: one reads
   every table out by travelling identity, this one writes every table back.

   The order of operations is the whole ticket:

     1. Write every photo file the archive carries. Names are uuid-based
        (ADR-0008), so a file being written cannot collide with one already
        there, which is what makes writing before deciding anything safe.
     2. In one transaction: reconcile the built-in vocabulary,
        unconditionally and first, then swap the journal. Key identity makes
        the reconcile idempotent, and it runs before either mode applies
        because a Replace must not be able to leave the journal short of a
        built-in the archive's own rows reference. It is inside the same
        transaction so that a failure leaves the database exactly as it was,
        rather than as the next boot would have made it.

   Nothing here deletes a file, ever (ADR-0011). Every failure before the
   commit is therefore a no-op: the old journal is completely intact and the
   only cost is dead files until the next boot's orphan sweep reclaims them
   (photos.ts). Deleting up front would mean a failure part way leaves the
   user with neither their old photos nor the new ones, on a device that by
   design has no other copy.

   Merge adds what this device does not have and leaves matched rows alone,
   matching by uuid for the user's own rows and by key for built-ins
   (ADR-0002) - so re-importing the same archive changes nothing. Skip-
   existing rather than last-write-wins, because LWW needs trustworthy clocks
   across two devices with no sync protocol and its failure mode is silent: a
   fix made on this device would vanish under an older archive.

   Replace discards this device's journal rows and installs the archive's,
   then writes the archive's state onto the built-in rows it kept. Preferences
   are not the journal's (ADR-0003) and nothing here touches the pref table,
   which is what leaves the PIN, the app-lock flags and the disguise settings
   in place through the most destructive path in the app.

   What the rows contain is validated by the schema as they are written, which
   is why every insert is inside the transaction: a value the columns refuse -
   a reminder with no rule, an entry with no day - rolls the whole import back
   and leaves the journal as it was. Only the payload's shape is checked up
   front, because a collection that is not an array would otherwise fail as a
   TypeError that reads like a bug in this file rather than like a damaged
   file on disk. */

import { CorruptArchiveError } from '../archive/container';
import type { ArchiveJournal, ArchivePhoto } from '../archive/payload';
import { foldText } from '../fold';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from './journal';
import { reconcileBuiltInsWithin } from './reconcile';
import { assertChanged, now, rowidWhere } from './support';

export type RestoreMode = 'replace' | 'merge';

/** An archive on its way back in: the rows, and its photo files as the body
    reaches them. A stream rather than a list, because unpacking hands photos
    over one at a time (pack.ts) and a restore must not hold a journal's worth
    of images. */
export interface RestoreContents {
  journal: ArchiveJournal;
  files: AsyncIterable<{ name: string; bytes: Uint8Array }>;
}

/** One import, mid-flight: the mode decides what happens to a row that is
    already here, and `ts` stamps every row it writes with the moment the
    import ran rather than with a clock reading from another device. */
type Restoring = {
  driver: SqliteDriver;
  mode: RestoreMode;
  journal: ArchiveJournal;
  ts: number;
};

const flag = (value: boolean): number => (value ? 1 : 0);
const SQLITE_PARAM_LIMIT = 999;
const ID_CHUNK = 400;
/** Chosen for what it does on Android since ticket 19: writes there used to
    cross the Capacitor plugin-call queue, which serializes one call at a
    time, so this bought nothing - eight in flight were eight queued. The
    write channel that replaced that call runs each write on its own worker
    thread, so this number now controls real concurrent disk I/O rather than
    a queue depth nothing drained faster for. Kept at 8 rather than raised:
    that is what the re-measured archive-restore-files baseline reflects,
    and moving it would need a baseline of its own. */
const FILE_WRITE_CONCURRENCY = 8;

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
  table: 'entry' | 'milestone' | 'regimen_episode',
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

async function writeArchiveFiles(files: PhotoFileStore, source: RestoreContents['files']): Promise<void> {
  const inFlight = new Set<Promise<void>>();

  const schedule = (name: string, bytes: Uint8Array) => {
    const op = files.write(name, bytes).finally(() => {
      inFlight.delete(op);
    });
    inFlight.add(op);
    return op;
  };

  try {
    for await (const file of source) {
      schedule(file.name, file.bytes);
      if (inFlight.size >= FILE_WRITE_CONCURRENCY) await Promise.race(inFlight);
    }
    await Promise.all(inFlight);
  } catch (error) {
    await Promise.allSettled(inFlight);
    throw error;
  }
}

export async function restoreArchive(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents
): Promise<void> {
  assertRestorable(contents.journal);

  await writeArchiveFiles(files, contents.files);

  await driver.transaction(async () => {
    const restoring: Restoring = { driver, mode, journal: contents.journal, ts: now() };
    // Seeding first, unconditionally, and inside this transaction with
    // everything else (reconcile.ts explains the second entry point).
    await reconcileBuiltInsWithin(driver);
    if (mode === 'replace') await discardJournalRows(driver);
    // Reference data first: the entries below resolve their dimensions and
    // tags against it, and an archive's row must find the archive's own.
    await applyDimensions(restoring);
    await applyPresets(restoring);
    await applyTagGroups(restoring);
    await applyEntries(restoring);
    await applyMilestones(restoring);
    await applyLabResults(restoring);
    await applyMeasurements(restoring);
    await applySideEffects(restoring);
    await applyReminders(restoring);
    await applyTallyEvents(restoring);
    await applyRegimenEpisodes(restoring);
    /* After the episodes: both hang off an episode rowid, and the rows this
       import just inserted are where those rowids come from. */
    await applyDoseSchedules(restoring);
    await applyDosePauses(restoring);
    await applyDoseEvents(restoring);
    await applyMedicationStock(restoring);
  });
}

const COLLECTIONS = [
  'dimensions',
  'presets',
  'tagGroups',
  'entries',
  'milestones',
  'labResults',
  'measurements',
  'sideEffects',
  'reminders',
  'tallyEvents',
  'regimenEpisodes',
  'doseEvents',
  'doseSchedules',
  'dosePauses',
  'medicationStock'
] as const;

function assertRestorable(journal: ArchiveJournal): void {
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(journal?.[collection])) {
      throw new CorruptArchiveError(`the archive's ${collection} are not readable`);
    }
  }
}

/* Everything the archive is about to install, children before parents so it
   holds whether or not this connection enforces foreign keys - the same
   assumption the demo's clearJournal() makes. Built-in rows survive: the
   archive's entries reference dimensions and tags by key, and deleting them
   would leave those references nothing to resolve against. What the user put
   on a built-in is overwritten row by row afterwards.

   entry_fts needs no statement of its own: migration v3's trigger drops an
   index row with its entry, which is what lets this delete entries without
   knowing the index exists. */
async function discardJournalRows(driver: SqliteDriver): Promise<void> {
  const statements = [
    'DELETE FROM photo',
    'DELETE FROM entry_dimension_value',
    'DELETE FROM entry_tag',
    'DELETE FROM entry_body_region',
    'DELETE FROM entry',
    'DELETE FROM milestone',
    'DELETE FROM lab_result',
    'DELETE FROM measurement',
    'DELETE FROM side_effect',
    'DELETE FROM reminder',
    'DELETE FROM tally_event',
    'DELETE FROM dose_event',
    /* Before the episodes they hang off. The foreign keys cascade, but only
       with `PRAGMA foreign_keys` on, which is the driver's business and not
       something this ordering should depend on. */
    'DELETE FROM dose_schedule',
    'DELETE FROM dose_pause',
    'DELETE FROM regimen_episode',
    'DELETE FROM medication_stock',
    /* Only the custom presets' links. A built-in preset the archive does not
       carry keeps the dimensions reconciling gave it: emptying the table
       wholesale left one with none at all, permanently, because reconciling
       writes a preset's links only when it writes the preset row. */
    'DELETE FROM preset_dimension WHERE preset_id IN (SELECT id FROM gender_preset WHERE key IS NULL)',
    'DELETE FROM gender_preset WHERE key IS NULL',
    'DELETE FROM tag WHERE key IS NULL',
    // A custom tag group carries a uuid and a built-in one does not; its key
    // is that same uuid, so the uuid is what tells them apart (tags.ts).
    'DELETE FROM tag_group WHERE uuid IS NOT NULL',
    'DELETE FROM gender_dimension WHERE is_built_in = 0'
  ];
  for (const statement of statements) await driver.run(statement);
}

/** Which travelling ids a table already holds, as the domain id an archive
    names them by: the key of a built-in, the uuid of a custom (ADR-0002). */
async function presentIds(driver: SqliteDriver, sql: string): Promise<Set<string>> {
  const rows = await driver.query<{ id: string }>(sql);
  return new Set(rows.map((row) => row.id));
}

async function applyDimensions({ driver, mode, journal, ts }: Restoring): Promise<void> {
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

async function applyPresets({ driver, mode, journal, ts }: Restoring): Promise<void> {
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
async function applyTagGroups({ driver, mode, journal, ts }: Restoring): Promise<void> {
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

async function applyEntries({ driver, journal, ts }: Restoring): Promise<void> {
  // Merge skips a matched entry whole, photos included: leaving the row alone
  // and adding its photos would be a half-merge of one entry.
  const present = await presentIds(driver, 'SELECT uuid AS id FROM entry');

  const inserting = journal.entries.filter((entry) => !present.has(entry.uuid));
  if (inserting.length === 0) return;

  await insertRows(
    driver,
    'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at)',
    inserting.map((entry) => [entry.uuid, entry.epochDay, entry.timestamp, entry.mood, entry.note, ts])
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
      photoRows.push([photo.id, entryId, null, photo.fileName, orderIndex, ts]);
    }

    // Unlike dims and tags, a region key is not resolved against a stored
    // row - there is none (bodyMap.ts) - so it travels straight through,
    // the same forward-compatible treatment lab_result.analyte gets: an
    // archive from a build that knows a region this one does not still
    // restores rather than failing the whole import.
    for (const [region, intensity] of Object.entries(entry.bodyRegions ?? {})) {
      bodyRegionRows.push([entryId, region, intensity]);
    }
  }

  await insertRows(driver, 'INSERT INTO entry_fts (rowid, folded_text)', ftsRows);
  await insertRows(driver, 'INSERT INTO entry_dimension_value (entry_id, dimension_id, value)', dimensionRows);
  await insertRows(driver, 'INSERT INTO entry_tag (entry_id, tag_id)', tagRows);
  await insertRows(driver, 'INSERT INTO entry_body_region (entry_id, region, intensity)', bodyRegionRows);
  await insertRows(
    driver,
    'INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, updated_at)',
    photoRows
  );
}

async function applyMilestones({ driver, journal, ts }: Restoring): Promise<void> {
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
    photoRows.push([milestone.photo.id, null, milestoneId, milestone.photo.fileName, 0, ts]);
  }

  await insertRows(
    driver,
    'INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, updated_at)',
    photoRows
  );
}

async function applyLabResults({ driver, journal, ts }: Restoring): Promise<void> {
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

async function applyMeasurements({ driver, journal, ts }: Restoring): Promise<void> {
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

async function applyRegimenEpisodes({ driver, journal, ts }: Restoring): Promise<void> {
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

async function applyTallyEvents({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM tally_event');

  const inserting = journal.tallyEvents.filter((event) => !present.has(event.id));
  await insertRows(
    driver,
    'INSERT INTO tally_event (uuid, epoch_day, kind, context, updated_at)',
    inserting.map((event) => [event.id, event.epochDay, event.kind, event.context, ts])
  );
}

async function applyDoseEvents({ driver, journal, ts }: Restoring): Promise<void> {
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
async function applyDoseSchedules({ driver, journal, ts }: Restoring): Promise<void> {
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

async function applyDosePauses({ driver, journal, ts }: Restoring): Promise<void> {
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

async function applySideEffects({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM side_effect');

  const inserting = journal.sideEffects.filter((effect) => !present.has(effect.id));
  await insertRows(
    driver,
    'INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at)',
    inserting.map((effect) => [effect.id, effect.name, effect.severity, effect.epochDay, ts])
  );
}

async function applyReminders({ driver, journal, ts }: Restoring): Promise<void> {
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
async function applyMedicationStock({ driver, journal, ts }: Restoring): Promise<void> {
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
