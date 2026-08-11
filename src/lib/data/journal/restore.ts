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
import { assertChanged, now, rowidByUuid, rowidWhere } from './support';

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

export async function restoreArchive(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents
): Promise<void> {
  assertRestorable(contents.journal);

  for await (const file of contents.files) await files.write(file.name, file.bytes);

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
    await applyReminders(restoring);
  });
}

const COLLECTIONS = [
  'dimensions',
  'presets',
  'tagGroups',
  'entries',
  'milestones',
  'labResults',
  'reminders'
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
    'DELETE FROM entry',
    'DELETE FROM milestone',
    'DELETE FROM lab_result',
    'DELETE FROM reminder',
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

  for (const entry of journal.entries) {
    if (present.has(entry.uuid)) continue;

    await driver.run(
      'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.uuid, entry.epochDay, entry.timestamp, entry.mood, entry.note, ts]
    );
    const entryId = await rowidByUuid(driver, 'entry', entry.uuid);

    /* The index is contentless and holds folded text against the entry's
       rowid (ADR-0005), written by the same fold the query uses. A plain
       insert with no delete first: entry.id is AUTOINCREMENT, so a rowid is
       never reused, and a Replace's deletes took the old index rows with
       them. */
    await driver.run('INSERT INTO entry_fts (rowid, folded_text) VALUES (?, ?)', [entryId, foldText(entry.note)]);

    /* `?? {}` and `?? []` rather than trusting the types: this shape is read
       off a file someone else wrote, and the interface only describes what
       this app puts in one. */
    for (const [key, value] of Object.entries(entry.dims ?? {})) {
      const result = await driver.run(
        `INSERT INTO entry_dimension_value (entry_id, dimension_id, value)
         SELECT ?, id, ? FROM gender_dimension WHERE key = ?`,
        [entryId, value, key]
      );
      // Loud, like every other unknown id on a write (ADR-0017): quietly
      // dropping a value is silent data loss in the middle of a restore.
      assertChanged(result, `dimension ${key} on entry ${entry.uuid}`);
    }

    for (const id of entry.tags ?? []) {
      const result = await driver.run(
        'INSERT INTO entry_tag (entry_id, tag_id) SELECT ?, id FROM tag WHERE key = ? OR uuid = ?',
        [entryId, id, id]
      );
      assertChanged(result, `tag ${id} on entry ${entry.uuid}`);
    }

    await insertPhotos(driver, entry.photos ?? [], { entryRowid: entryId }, ts);
  }
}

async function applyMilestones({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM milestone');

  for (const milestone of journal.milestones) {
    if (present.has(milestone.id)) continue;
    await driver.run(
      'INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at) VALUES (?, ?, ?, ?, ?)',
      [milestone.id, milestone.name, milestone.epochDay, milestone.templateKey, ts]
    );
    const milestoneId = await rowidByUuid(driver, 'milestone', milestone.id);
    await insertPhotos(driver, milestone.photo ? [milestone.photo] : [], { milestoneRowid: milestoneId }, ts);
  }
}

/** Which column a photo row hangs off, by rowid. Not photos.ts's PhotoOwner,
    which addresses a milestone by uuid because that is what the milestones
    area speaks: here both owners have just been inserted and their rowids are
    already in hand. */
type PhotoOwnerRowid =
  | { entryRowid: number; milestoneRowid?: never }
  | { milestoneRowid: number; entryRowid?: never };

/** The rows, in the order they arrived, against whichever owner they hang
    off - the one photo table both owners share (ADR-0008). The bytes landed
    before the transaction opened, or were never in the archive: a row whose
    file was already gone on the exporting device travels anyway
    (archive.ts), and dropping it here would be the one deletion an import is
    not allowed to make. */
async function insertPhotos(
  driver: SqliteDriver,
  photos: ArchivePhoto[],
  owner: PhotoOwnerRowid,
  ts: number
): Promise<void> {
  for (const [orderIndex, photo] of photos.entries()) {
    await driver.run(
      `INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [photo.id, owner.entryRowid ?? null, owner.milestoneRowid ?? null, photo.fileName, orderIndex, ts]
    );
  }
}

async function applyLabResults({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM lab_result');

  for (const result of journal.labResults) {
    if (present.has(result.id)) continue;
    await driver.run(
      `INSERT INTO lab_result (uuid, epoch_day, analyte, value, unit, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [result.id, result.epochDay, result.analyte, result.value, result.unit, result.note, ts]
    );
  }
}

async function applyReminders({ driver, journal, ts }: Restoring): Promise<void> {
  const present = await presentIds(driver, 'SELECT uuid AS id FROM reminder');

  for (const reminder of journal.reminders) {
    if (present.has(reminder.id)) continue;
    // No rule validation of its own: the schema's recurrence CHECK is the
    // same rule reminderRule.ts states, and this is inside the transaction.
    await driver.run(
      `INSERT INTO reminder
         (uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reminder.id,
        reminder.title,
        reminder.type,
        reminder.time,
        reminder.recurrence,
        reminder.interval,
        reminder.anchorEpochDay,
        reminder.epochDay,
        flag(reminder.enabled),
        ts
      ]
    );
  }
}
