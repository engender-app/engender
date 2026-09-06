/* Reading an archive back into the journal: Replace and Merge (ticket 14,
   ADR-0011, PRD F14). The inverse of archive.ts's snapshot, and part of the
   same area - one journal operation each, so no caller holds a transaction
   and no caller sequences the areas itself (ADR-0017). It sits in its own
   file because the two halves share nothing but the wire format and the
   section registry: one reads every table out by travelling identity, this
   one writes every table back. Which sections there are, and which of them
   have to be written before which, is archiveSections.ts's (ADR-0027); the
   per-section writes are in archiveApply.ts.

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
   then writes the archive's state onto the built-in rows it kept. Which rows
   it discards is the registry's too, in the reverse of the order the inserts
   run in (ADR-0027): until phase 5 ticket 13 that was 51 statements
   hand-ordered in this file, the one list around here the registry did not
   derive. Preferences are not the journal's (ADR-0003) and nothing here
   touches the pref table, which is what leaves the PIN, the app-lock flags
   and the disguise settings in place through the most destructive path in
   the app.

   What the rows contain is validated by the schema as they are written, which
   is why every insert is inside the transaction: a value the columns refuse -
   a reminder with no rule, an entry with no day - rolls the whole import back
   and leaves the journal as it was. Only the payload's shape is checked up
   front, because a section that is not an array would otherwise fail as a
   TypeError that reads like a bug in this file rather than like a damaged
   file on disk. */

import { CorruptArchiveError } from '../archive/container';
import { openArchive } from '../archive/pack';
import type { ArchiveJournal } from '../archive/payload';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { reconcileBuiltInsWithin } from './reconcile';
import { aliasLegacyConsults } from './archiveApply';
import { applyArchiveJournal, discardStatements, ARCHIVE_SECTION_NAMES } from './archiveSections';
import { now } from './support';

export type RestoreMode = 'replace' | 'merge';

/** An archive on its way back in: the rows, and its photo files as the body
    reaches them. A stream rather than a list, because unpacking hands photos
    over one at a time (pack.ts) and a restore must not hold a journal's worth
    of images. */
export interface RestoreContents {
  journal: ArchiveJournal;
  files: AsyncIterable<{ name: string; bytes: Uint8Array }>;
  /** How many files that stream will deliver, when the caller knows - the
      manifest inside the payload says so, and an importer that has opened
      the archive is holding it (phase 9 audit ticket 11). Left out by a
      caller that is synthesising files rather than replaying an archive's,
      which only costs the progress report its denominator. */
  fileCount?: number;
}

/** Which half of a restore is running and how far through it is (phase 9
    audit ticket 11, ADR-0070).

    Two stages rather than one number, because they are separately long and
    separately countable: the photos arrive one at a time off the archive's
    body, and the rows go in section by section inside a single
    transaction. One combined fraction would need a weighting between them
    that nothing here knows, and a bar that sat at 100% through the whole
    row half would be the "the bar lied" failure the ADR is about. */
export type RestoreStage = 'files' | 'rows';

export interface RestoreProgress {
  stage: RestoreStage;
  done: number;
  /** 0 when the count is not known, which the progress component renders
      as indeterminate rather than as an empty bar. */
  total: number;
}

export type OnRestoreProgress = (progress: RestoreProgress) => void;
/** Chosen for what it does on Android since ticket 19: writes there used to
    cross the Capacitor plugin-call queue, which serializes one call at a
    time, so this bought nothing - eight in flight were eight queued. The
    write channel that replaced that call runs each write on its own worker
    thread, so this number now controls real concurrent disk I/O rather than
    a queue depth nothing drained faster for. Kept at 8 rather than raised:
    that is what the re-measured archive-restore-files baseline reflects,
    and moving it would need a baseline of its own. */
const FILE_WRITE_CONCURRENCY = 8;

async function writeArchiveFiles(
  files: PhotoFileStore,
  source: RestoreContents['files'],
  fileCount: number,
  onProgress?: OnRestoreProgress
): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  /* Counted as each write lands rather than as it is scheduled: up to
     FILE_WRITE_CONCURRENCY are in the air at once, and a count of what has
     been handed to the disk is not a count of what is on it. */
  let written = 0;

  const schedule = (name: string, bytes: Uint8Array) => {
    const op = files.write(name, bytes).finally(() => {
      inFlight.delete(op);
      written += 1;
      onProgress?.({ stage: 'files', done: written, total: fileCount });
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
  contents: RestoreContents,
  onProgress?: OnRestoreProgress
): Promise<void> {
  const journal = aliasLegacyConsults(contents.journal);
  assertRestorable(journal);

  await writeArchiveFiles(files, contents.files, contents.fileCount ?? 0, onProgress);

  await driver.transaction(async () => {
    // Seeding first, unconditionally, and inside this transaction with
    // everything else (reconcile.ts explains the second entry point).
    await reconcileBuiltInsWithin(driver);
    if (mode === 'replace') await discardJournalRows(driver);
    // Which sections there are and what has to be inserted before what are
    // the registry's (archiveSections.ts), not this function's - and so is
    // how many there are to count against.
    await applyArchiveJournal({ driver, mode, journal, ts: now() }, undefined, (done, total) =>
      onProgress?.({ stage: 'rows', done, total })
    );
  });
}

/** The backup health drill (ticket 28): proves a chosen archive still
    decrypts and parses, without a driver or a file store to write into -
    the signature is the guarantee that the live journal cannot be touched.
    Draining `files` to the end is not incidental: it is what forces every
    chunk's AES-GCM tag to be checked, including the ones holding only
    photos that the header and payload alone never reach (pack.ts's
    OpenedArchive doc, ADR-0007). */
export async function verifyArchive(
  source: AsyncIterable<Uint8Array>,
  password: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const { payload, files } = await openArchive(source, password);
  assertRestorable(aliasLegacyConsults(payload.journal));

  /* One stage, so a pair rather than a RestoreProgress: the whole drill is
     the drain, and the manifest already says how many files that is. */
  const total = payload.files.length;
  let done = 0;
  const iterator = files[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) onProgress?.((done += 1), total);
}

/** Only the payload's shape, and only the sections the registry says an
    archive carries: a section that is not an array would otherwise fail deep
    inside an apply function as a TypeError that reads like a bug here rather
    than like a damaged file on disk. */
function assertRestorable(journal: ArchiveJournal): void {
  for (const section of ARCHIVE_SECTION_NAMES) {
    if (!Array.isArray(journal?.[section])) {
      throw new CorruptArchiveError(`the archive's ${section} are not readable`);
    }
  }
}

/** Every journal row this device has, gone: one operation, ordered by the
    registry rather than by hand (archiveSections.ts's discardStatements).
    Called here for a Replace, and by `Journal.discardEverything` on its own
    for the demo bar's state jumps - both mean the same thing by emptying the
    journal, which is why there is one answer to it and not two.

    Nothing here deletes a file, which is this function's half of the ordering
    rule in the header above: the rows go, the photos stay until the next
    boot's orphan sweep reclaims them.

    A table missed here keeps stale rows through a Replace, so the golden
    fixture restores over a journal that already has rows in every section
    (archive-golden.test.ts) rather than only into an empty one, and the
    registry's own oracle checks every table in the schema against the
    statements (archiveSections.test.ts). */
export async function discardJournalRows(driver: SqliteDriver): Promise<void> {
  for (const statement of discardStatements()) await driver.run(statement);
}
