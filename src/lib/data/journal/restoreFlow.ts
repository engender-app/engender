/* Share the restore sequence between Settings and onboarding: pick, guard, open and apply.
   Screens own the rendering. Error kinds map to labels in
   `vocabulary/archiveErrorLabels.ts`.

   Load the journal and preference store dynamically. The Node tests can exercise the guard
   without loading Svelte rune modules. */

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

/** The form's own refusals, before anything is opened. Pure, and the one part of this file
    a Node test can reach. An empty password is not one of them: an export may be made
    without a password, so the empty field is tried, and restoreFailureKind says what it
    means when it does not open the file. */
export function restoreGuard(
  picked: PickedArchive | null,
  password: string
): RestoreGuardKind | null {
  if (!picked) return 'pick-first';
  return null;
}

/** An empty field that does not open the file was a password left out, not
    a wrong one. */
export function restoreFailureKind(error: unknown, password: string): RestoreFailureKind {
  const kind = archiveFailureKind(error);
  return kind === 'wrong-password' && !password ? 'password-needed' : kind;
}

/**
 * The drill: decrypt, parse and validate the file and write nothing.
 *
 * `verifyArchive` never takes a driver or a file store, so there is nothing
 * here for it to write to - which is what makes this the step a first run can
 * take before it has a journal to write into at all. A refused
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
    return { ok: false, kind: restoreFailureKind(error, password) };
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
    const contents = { journal: payload.journal, preferences: payload.preferences, files, fileCount: payload.files.length };

    if (mode === 'replace') {
      const { preparePreferencePublication, activateLanguagePreference } = await import('../prefs/store.svelte');
      const preferences = preparePreferencePublication();
      await journal.archive.replace({ ...contents, onPreferencesPrepared: preferences.capture }, onProgress);
      if (await preferences.publish()) activateLanguagePreference();
    } else {
      await journal.archive.merge(contents, onProgress);
    }
    return { ok: true };
  } catch (error) {
    console.error('the restore failed', error);
    return { ok: false, kind: restoreFailureKind(error, password) };
  }
}
