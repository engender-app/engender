/* One restore, wherever it is offered (ticket 36).

   There are two doors onto it now - Settings' import section, and the
   welcome step for somebody on a new phone who already has an archive - and
   before this file there was one implementation with a second one about to
   be written beside it. What was going to be copied is not the interesting
   part of the screen: it is the order the picking, the guarding, the opening
   and the applying happen in, and which of them is the one that writes. So
   that order lives here and the two screens keep only their own drawing.

   What does *not* live here is the wording. Nothing the Node tier touches
   may import paraglide (ADR-0016), and the guard below is worth a Node test;
   the sentence for every outcome stays in vocabulary/archiveErrorLabels.ts
   with the archive's own five, keyed by the same kind this returns.

   The journal and the preference store arrive by dynamic import rather than
   at the top, for the same reason: both are rune modules, and a Node test of
   the guard must not drag them in. journal.ts already reaches for restore.ts
   this way, so the shape is the repo's own. */

import { openArchive } from '../archive/pack';
import { archiveFailureKind, type ArchiveFailureKind } from '../archive/failure';
import { EmptyArchiveFileError, pickArchive, type PickedArchive } from '../archive/pick';
import { verifyArchive, type RestoreMode, type RestoreProgress } from './restore';

/** What a screen catches before a byte of the file is read. The first two
    are about the form being incomplete; `empty-file` reached a real file and
    refused it on its size (pick.ts), which is still ahead of the container
    rather than a verdict from it. */
export type RestoreGuardKind = 'pick-first' | 'password-needed' | 'empty-file';

/** Every way a restore can end badly, in one union: the screen's own guards
    and the archive's own five (archive/failure.ts). Both halves are rendered
    the same way and both are the walkthrough's handle on which failure this
    is, so keeping them apart only meant two unions to widen. */
export type RestoreFailureKind = RestoreGuardKind | ArchiveFailureKind;

export type RestoreResult = { ok: true } | { ok: false; kind: RestoreFailureKind };

/**
 * The archive the person chose, or nothing.
 *
 * Three outcomes rather than two, because backing out of the picker is an
 * ordinary act and an empty file is not: `null` means they changed their
 * mind and the screen says nothing, a failure means the screen has something
 * to say.
 */
export async function pickForRestore(): Promise<
  { picked: PickedArchive } | { ok: false; kind: RestoreGuardKind } | null
> {
  try {
    const picked = await pickArchive();
    return picked ? { picked } : null;
  } catch (error) {
    console.error('the archive picker failed', error);
    if (error instanceof EmptyArchiveFileError) return { ok: false, kind: 'empty-file' };
    throw error;
  }
}

/** The form's own refusals, before anything is opened. Pure, and the one
    part of this file a Node test can reach. */
export function restoreGuard(
  picked: PickedArchive | null,
  password: string
): RestoreGuardKind | null {
  if (!picked) return 'pick-first';
  if (!password) return 'password-needed';
  return null;
}

/**
 * The drill: decrypt, parse and validate the file and write nothing.
 *
 * `verifyArchive` never takes a driver or a file store, so there is nothing
 * here for it to write to - which is what makes this the step a first run can
 * take before it has a journal to write into at all (ticket 36). A refused
 * archive is refused with the device untouched.
 */
export async function runVerify(
  picked: PickedArchive | null,
  password: string,
  onProgress: (done: number, total: number) => void
): Promise<RestoreResult> {
  const guard = restoreGuard(picked, password);
  if (guard) return { ok: false, kind: guard };
  try {
    await verifyArchive(picked!.bytes(), password, onProgress);
    return { ok: true };
  } catch (error) {
    console.error('the verify drill failed', error);
    return { ok: false, kind: archiveFailureKind(error) };
  }
}

/**
 * The restore itself.
 *
 * Every step before the last one is reversible, and the last one is a single
 * journal operation that either lands whole or leaves the journal exactly as
 * it was (ADR-0011) - which is why neither caller does any sequencing of its
 * own beyond picking a mode.
 *
 * The settings that describe the journal travel with it (ADR-0003); the ones
 * that describe this installation - the access mode, the lock flags, the
 * disguise - are not in the archive at all, so restoring cannot lock anybody
 * out of an app with no recovery path. A merge writes none of them, for the
 * same reason it leaves rows alone: what is already on this device wins.
 */
export async function runRestore(
  picked: PickedArchive | null,
  password: string,
  mode: RestoreMode,
  onProgress: (progress: RestoreProgress) => void
): Promise<RestoreResult> {
  const guard = restoreGuard(picked, password);
  if (guard) return { ok: false, kind: guard };
  try {
    const { journal } = await import('../live/journal.svelte');
    const { payload, files } = await openArchive(picked!.bytes(), password);
    // The manifest is what the stream is about to deliver, so the bar has a
    // denominator for its first half (restore.ts).
    const contents = { journal: payload.journal, files, fileCount: payload.files.length };

    if (mode === 'replace') {
      await journal.archive.replace(contents, onProgress);
      const { applyPortablePreferences } = await import('../prefs/store.svelte');
      applyPortablePreferences(payload.preferences);
    } else {
      await journal.archive.merge(contents, onProgress);
    }
    return { ok: true };
  } catch (error) {
    console.error('the restore failed', error);
    return { ok: false, kind: archiveFailureKind(error) };
  }
}
