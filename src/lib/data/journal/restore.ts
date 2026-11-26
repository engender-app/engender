/* Restore an Archive through the journal facade (ADR-0011, ADR-0017).
   Validate row identities, values and references before consuming files.
   Stage attachments first and assign fresh names to replacements,
   including thumbnails, so a failed restore leaves the old files usable.

   Then open one transaction. Reconcile built-ins first so imported rows
   can reference them. archiveSections.ts orders the writes, and Replace
   deletes rows in reverse order (ADR-0027). Full Replace applies
   validated portable preferences. Device-local settings stay in place,
   and row-only imports omit preferences (ADR-0003).

   Merge matches user rows by UUID and built-ins by key. The latest
   edit or deletion wins, with ties going to the destination (ADR-0098).
   The destination keeps its preferences.

   External imports measure counts and record import_log inside the
   same transaction. After commit, resolve without fallible database
   work so the write registry can announce a successful import.
   Cleanup removes only proven-unowned staged files. The orphan sweep
   handles interrupted cleanup after the transaction. */

import { CorruptArchiveError, UnsupportedArchiveError } from '../archive/container';
import { openArchive } from '../archive/pack';
import type { ArchiveJournal, PortablePreferences } from '../archive/payload';
import { restorePortablePreferencesWithin } from '../prefs/preferences';
import type { PreferenceValues } from '../prefs/catalogue';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { filesOf, isStorableFileName } from '../photos/names';
import { documentFilesOf } from './documents';
import { archiveFileNames, assertArchiveFileOwnership, readCleanupFileNames } from './fileOwnership';
import { journalIsBusy, waitForJournalIdle } from '../journal-busy';
import { markOrphanSweepDue } from '../sqlite/orphan-sweep-schedule';
import { sweepOrphanPhotos } from './photos';
import { mintUuid } from './support';
import { reconcileBuiltInsWithin } from './reconcile';
import { recordImport } from './archiveApply';
import { applyArchiveJournal, discardStatements, ARCHIVE_SECTION_NAMES, ARCHIVE_SECTIONS, DROPPED_ARCHIVE_SECTION_NAMES, emptyArchiveJournal } from './archiveSections';
import { assertArchiveReferences, assertArchiveRows } from './archiveRowValidation';
import { DROPPED_TRYOUT_KINDS } from '../rowValues';
import { splitArchivedEffectCategories } from '../sqlite/effect-category-split-migration';

export type RestoreMode = 'replace' | 'merge';

/** An archive on its way back in: the rows, and its photo files as the body
    reaches them. A stream rather than a list, because unpacking hands photos
    over one at a time (pack.ts) and a restore must not hold a journal's worth
    of images. */
export interface RestoreContents {
  journal: ArchiveJournal;
  /** Portable preferences travel with a full Archive. Row-only callers omit
      this property; an older Archive may provide undefined preferences. */
  preferences?: Partial<PortablePreferences> | null;
  /** Capture authoritative values while Replace still owns its transaction.
      The caller publishes them only after this operation commits. */
  onPreferencesPrepared?(values: PreferenceValues): void;
  files: AsyncIterable<{ name: string; bytes: Uint8Array }>;
  /** How many files that stream will deliver, when the caller knows - the
      manifest inside the payload says so, and an importer that has opened
      the archive is holding it. Left out by a
      caller that is synthesising files rather than replaying an archive's,
      which only costs the progress report its denominator. */
  fileCount?: number;
}

/** Which half of a restore is running and how far through it is (ADR-0070).

    Two stages rather than one number, because they are separately long and
    separately countable: the photos arrive one at a time off the archive's
    body, and the rows go in section by section inside a single
    transaction. One combined fraction would need a weighting between them
    that nothing here knows, and a bar that sat at 100% through the whole
    row half would be the "the bar lied" failure the ADR is about. */
type RestoreStage = 'files' | 'rows';

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

function replacementFileName(name: string): string {
  const extension = name.lastIndexOf('.');
  return mintUuid() + (extension < 0 ? '' : name.slice(extension));
}

function replacementNames(journal: ArchiveJournal, existing: Set<string>, names: Map<string, string>): ArchiveJournal {
  const rename = (name: string, ownedNames: (name: string) => string[]) => {
    if (names.has(name)) return names.get(name)!;
    const owned = ownedNames(name);
    if (!owned.some((file) => existing.has(file))) return name;
    const replacement = replacementFileName(name);
    const replaced = ownedNames(replacement);
    owned.forEach((file, i) => names.set(file, replaced[i]));
    return replacement;
  };
  const photos = <T extends { fileName: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, fileName: rename(row.fileName, filesOf) }));
  const single = (name: string) => rename(name, (file) => [file]);
  return {
    ...journal,
    entries: journal.entries.map((entry) => ({
      ...entry,
      photos: photos(entry.photos),
      recordings: (entry.recordings ?? []).map((row) => ({ ...row, fileName: single(row.fileName) })),
      videos: (entry.videos ?? []).map((row) => ({ ...row, fileName: single(row.fileName) }))
    })),
    milestones: journal.milestones.map((row) => ({ ...row, photo: row.photo ? photos([row.photo])[0] : null })),
    progressPhotos: photos(journal.progressPhotos),
    hairRemovalSessions: journal.hairRemovalSessions.map((row) => ({ ...row, photos: photos(row.photos) })),
    procedures: journal.procedures.map((row) => ({ ...row, photos: photos(row.photos) })),
    tryouts: journal.tryouts.map((row) => ({ ...row, photos: photos(row.photos) })),
    documents: journal.documents.map((row) => ({ ...row, fileName: rename(row.fileName, documentFilesOf) })),
    voiceBenchmarks: journal.voiceBenchmarks.map((row) => ({
      ...row, passageFileName: single(row.passageFileName),
      vowelFileName: row.vowelFileName === null ? null : single(row.vowelFileName)
    }))
  };
}

async function writeArchiveFiles(
  files: PhotoFileStore,
  source: AsyncIterable<{ name: string; bytes: Uint8Array; skipped?: boolean }>,
  fileCount: number,
  onProgress?: OnRestoreProgress
): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  // Settled writes leave inFlight, but their first failure must survive the stream's pauses.
  let failure: { error: unknown } | undefined;
  /* Counted as each write lands rather than as it is scheduled: up to
     FILE_WRITE_CONCURRENCY are in the air at once, and a count of what has
     been handed to the disk is not a count of what is on it. */
  let written = 0;
  const throwIfFailed = () => {
    if (failure) throw failure.error;
  };

  const schedule = (name: string, bytes: Uint8Array) => {
    const op = files
      .write(name, bytes)
      .then(() => {
        written += 1;
        onProgress?.({ stage: 'files', done: written, total: fileCount });
      })
      .catch((error: unknown) => {
        failure ??= { error };
      })
      .finally(() => {
        inFlight.delete(op);
      });
    inFlight.add(op);
  };

  try {
    for await (const file of source) {
      throwIfFailed();
      if (file.skipped) {
        // Counted as done so the bar still reaches the manifest's total.
        written += 1;
        onProgress?.({ stage: 'files', done: written, total: fileCount });
        continue;
      }
      schedule(file.name, file.bytes);
      if (inFlight.size >= FILE_WRITE_CONCURRENCY) await Promise.race(inFlight);
      throwIfFailed();
    }
    await Promise.all(inFlight);
    throwIfFailed();
  } catch (error) {
    await Promise.allSettled(inFlight);
    throw error;
  }
}

/** What an import from another app reports and records, settled inside the
    transaction that writes its rows (audit A1, module header).

    `counting` names each number the result carries and the SQL tables whose
    growth across the apply is that number: `{ entries: ['entry'] }` comes
    back as `{ entries: 12 }`. Measured rather than taken from the preview,
    though a preview is defined as the exact work a commit performs: the
    preview resolves against a snapshot read before the person confirmed, and
    a row added in between turns one of its "new" rows into one the merge
    skips. The audit's word for the number a commit hands back is "truthful",
    and a measurement of the rows that landed is the only thing that stays
    true across that window.

    The table names are this module's callers' own literals, never anything
    an archive carried. */
export interface ImportCommit {
  /** The history row's source, named by the source registry rather than
      spelled a second time here (archive/sources.ts). */
  source: string;
  counting: Record<string, readonly string[]>;
}

export async function restoreArchive(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents,
  onProgress?: OnRestoreProgress
): Promise<void> {
  await restoreWithin(driver, files, mode, contents, onProgress);
}

/** A Merge that also measures what it added and writes the import history
    for it, all inside the one transaction (audit A1). Returns the counts by
    the names `commit.counting` gave them - the same object the history row
    keeps, so the result a screen shows and the record settings shows cannot
    describe two different imports. */
export async function commitImport(
  driver: SqliteDriver,
  files: PhotoFileStore,
  contents: RestoreContents,
  commit: ImportCommit,
  onProgress?: OnRestoreProgress
): Promise<Record<string, number>> {
  return restoreWithin(driver, files, 'merge', contents, onProgress, commit);
}

async function restoreWithin(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents,
  onProgress?: OnRestoreProgress,
  commit?: ImportCommit
): Promise<Record<string, number>> {
  const original = restorableJournal(contents.journal, commit !== undefined);
  const existing = new Set([...await readCleanupFileNames(driver), ...await files.list()]);
  const replacements = new Map<string, string>();
  const journal = replacementNames(original, existing, replacements);
  // Read from the journal as delivered: delivered file names are the archive's own, before any renaming below.
  const claimed = archiveFileNames(original);
  // Every path this restore creates, so a failure can remove all of them and nothing else.
  const staged = new Set<string>();
  const stagedFiles = async function* () {
    for await (const file of contents.files) {
      if (!isStorableFileName(file.name)) throw new CorruptArchiveError('the archive names a file the app cannot store');
      // No row owns it, so nothing would ever read or delete it. The stream is still drained, tag checks included.
      if (!claimed.has(file.name)) {
        yield { name: file.name, bytes: file.bytes, skipped: true };
        continue;
      }
      // Even a file the archive owns must never overwrite an existing file.
      if (!replacements.has(file.name) && existing.has(file.name)) {
        replacements.set(file.name, replacementFileName(file.name));
      }
      const name = replacements.get(file.name) ?? file.name;
      staged.add(name);
      yield { name, bytes: file.bytes };
    }
  };
  let unpublished = staged;
  let added: Record<string, number> = {};
  // Set once the transaction has been asked for; see the finally below.
  let transacting = false;
  let uncertain = false;
  let rowsFailure: unknown;
  // Remembers what the rows themselves threw, to tell it from a lost reply.
  const rowsFailing = <T>(work: (scope: SqliteDriver) => Promise<T>) => async (scope: SqliteDriver) => {
    try { return await work(scope); } catch (error) { rowsFailure = error; throw error; }
  };
  try {
    /* Due before the first file lands, not in the finally below: a process
       killed or a power cut between the file writes and the transaction
       never reaches the finally, and the staged files would stay
       unreferenced until the next Merge or the weekly stamp (carpet 09:
       47 of them after every cut). The stamp is what boot housekeeping
       reads on the next open. */
    markOrphanSweepDue();
    await writeArchiveFiles(files, stagedFiles(), contents.fileCount ?? 0, onProgress);
    // Once rows can own these files, a rejection cannot prove rollback.
    // Keep replacements until ownership is known or the post-restore sweep runs.
    unpublished = new Set();
    transacting = true;
    await driver.transaction(rowsFailing(async (driver) => {
      // Seeding first, unconditionally, and inside this transaction with
      // everything else (reconcile.ts explains the second entry point).
      await reconcileBuiltInsWithin(driver);
      if (mode === 'replace') await discardJournalRows(driver);
      /* Counted after the reconcile and the discard rather than at the top of
         the transaction: a built-in this boot seeded, and a Replace's own
         emptying, are not rows the archive added. */
      const before = commit ? await countRows(driver, commit.counting) : null;
      // Which sections there are and what has to be inserted before what are
      // the registry's (archiveSections.ts), not this function's - and so is
      // how many there are to count against.
      await applyArchiveJournal({ driver, mode, journal, ts: Date.now() }, undefined, (done, total) =>
        onProgress?.({ stage: 'rows', done, total })
      );
      if (mode === 'replace' && 'preferences' in contents) {
        const preferences = await restorePortablePreferencesWithin(driver, contents.preferences);
        contents.onPreferencesPrepared?.(preferences);
      }
      if (commit && before) {
        const after = await countRows(driver, commit.counting);
        added = Object.fromEntries(Object.keys(before).map((name) => [name, after[name] - before[name]]));
        await recordImport(driver, commit.source, added);
      }
      if (staged.size > 0) {
        const owned = new Set(await readCleanupFileNames(driver));
        unpublished = new Set([...staged].filter((name) => !owned.has(name)));
      }
    }));
  } catch (error) {
    /* The error the rows themselves raised comes back unchanged: the worker
       answered with a ROLLBACK, so the outcome is known. Anything else from
       a transaction that was asked for is not: a COMMIT or ROLLBACK whose
       reply never came (ended only by a dispose), or a ROLLBACK that was
       itself refused (the transactor wraps the rows' error in an
       AggregateError), which may have left the transaction open. */
    uncertain = transacting && !(rowsFailure !== undefined && error === rowsFailure);
    // A rollback the rows' own error proves leaves nothing to own the files.
    if (transacting && !uncertain) unpublished = staged;
    throw error;
  } finally {
    // Cleanup cannot turn a committed restore into a reported failure.
    await Promise.allSettled([...unpublished].map(async (name) => files.remove(name)));
    const sweep = () => sweepOrphanPhotos(driver, files).catch((error) => {
      console.warn('post-restore orphan sweep failed', error);
    });
    /* Not awaited when the transaction's outcome is uncertain: a COMMIT or
       ROLLBACK reply that was lost leaves the transaction open on the
       worker, a sweep query queues behind it, and the lock that waits for
       this restore to settle never closes the driver (carpet 09 finding 1:
       pending 60 s after the lock). The sweep runs alongside when the
       journal answers, and when it never does, the due stamp set above
       leaves it to the next open. A failure the rows raised was answered
       by a ROLLBACK, so its sweep is awaited as before. */
    // The live journal's write guard covers this call until it returns.
    if (journalIsBusy()) void waitForJournalIdle().then(sweep);
    else if (uncertain) void sweep();
    else await sweep();
  }
  return added;
}

/** How many rows each counted name's tables hold between them. A query per
    table rather than one assembled statement: no list here is longer than
    two, and both halves of the subtraction run inside a transaction that is
    already open, so this is a handful of index-free counts on a device that
    has just written far more than it is now counting. */
async function countRows(
  driver: SqliteDriver,
  counting: ImportCommit['counting']
): Promise<Record<string, number>> {
  const counted: Record<string, number> = {};
  for (const [name, tables] of Object.entries(counting)) {
    let rows = 0;
    for (const table of tables) {
      const [row] = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      rows += row.n;
    }
    counted[name] = rows;
  }
  return counted;
}

/** The backup health drill: proves a chosen archive still
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
  // Called for its refusals only: it throws on an unrestorable journal, and the result is not needed.
  restorableJournal(payload.journal);

  /* One stage, so a pair rather than a RestoreProgress: the whole drill is
     the drain, and the manifest already says how many files that is. */
  const total = payload.files.length;
  let done = 0;
  const iterator = files[Symbol.asyncIterator]();
  while (!(await iterator.next()).done) onProgress?.((done += 1), total);
}

/** Reject unknown sections before writing any files or rows. A removed section
    has no owner and its rows are discarded. Absent known sections read empty. */
function restorableJournal(journal: ArchiveJournal, externalImport = false): ArchiveJournal {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new CorruptArchiveError("the archive's journal is not readable");
  }
  for (const section of Object.keys(journal ?? {})) {
    if (!DROPPED_ARCHIVE_SECTION_NAMES.includes(section) && !(ARCHIVE_SECTION_NAMES as readonly string[]).includes(section)) {
      throw new UnsupportedArchiveError('newer-version', 'the archive was made by a newer version of the app');
    }
  }
  for (const { name } of ARCHIVE_SECTIONS) {
    const section = name as keyof ArchiveJournal;
    if (journal?.[section] !== undefined && !Array.isArray(journal[section])) {
      throw new CorruptArchiveError(`the archive's ${section} are not readable`);
    }
  }
  const complete = emptyArchiveJournal();
  for (const section of ARCHIVE_SECTION_NAMES) (complete as unknown as Record<string, unknown[]>)[section] = journal[section] ?? [];
  complete.areaStates = complete.areaStates.filter((row) => !DROPPED_ARCHIVE_SECTION_NAMES.includes(row?.area));
  // A felt-sense reading an older archive hung off a milestone, which no
  // longer holds any: dropped, not converted.
  complete.feltSenseEntries = complete.feltSenseEntries.filter((row) => {
    const legacy = row as unknown as { tryoutId?: unknown; milestoneId?: unknown } | null;
    return !(legacy && legacy.tryoutId == null && legacy.milestoneId != null);
  });
  for (const { name, flatTable } of ARCHIVE_SECTIONS) {
    const section = name as keyof ArchiveJournal;
    assertArchiveRows(section, complete[section], flatTable);
  }
  // An archive written before version 121 still names 'genital_sexual'.
  const split = splitArchivedEffectCategories(complete.effectCategories, complete.personalEffectTypes);
  complete.effectCategories = split.categories;
  complete.personalEffectTypes = split.types;
  assertArchiveReferences(complete, externalImport);
  assertArchiveFileOwnership(complete);
  const dropped = new Set(complete.tryouts
    .filter((row) => (DROPPED_TRYOUT_KINDS as readonly string[]).includes(row.kind))
    .map((row) => row.id));
  if (dropped.size === 0) return complete;
  return {
    ...complete,
    tryouts: complete.tryouts.filter((row) => !dropped.has(row.id)),
    feltSenseEntries: complete.feltSenseEntries.filter((row) => !row.tryoutId || !dropped.has(row.tryoutId)),
    milestones: complete.milestones.map((row) => dropped.has(row.tryoutId ?? '') ? { ...row, tryoutId: null } : row)
  };
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
  // Keep registry order while sending the complete discard through the driver once.
  await driver.exec(discardStatements().join(';\n'));
}
