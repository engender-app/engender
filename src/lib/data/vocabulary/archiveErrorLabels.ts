/* Localize archive failures by kind (ADR-0016). Keep diagnostics out of
   user copy. Import and verify have separate exhaustive maps because verify
   only reads the file and has no journal change to report. */

import { m } from '$lib/paraglide/messages';
import type { RestoreFailureKind, RestoreGuardKind } from '$lib/data/journal/restoreFlow';
import { spaceShortage, type SpaceShortage } from '$lib/data/spaceShortage';

/* The three the screen catches itself, before the container is read
   (restoreFlow.ts). Shared by both records below because they say the same
   thing either way: an unpicked file is an unpicked file whether the button
   pressed was Restore or the verify drill. */
const GUARD_MESSAGE: Record<RestoreGuardKind, () => string> = {
  'pick-first': m.imp_pick_first,
  'password-needed': m.imp_password_needed,
  'empty-file': m.imp_file_empty
};

const IMPORT_MESSAGE: Record<RestoreFailureKind, () => string> = {
  ...GUARD_MESSAGE,
  'wrong-password': m.imp_wrong_password,
  'newer-version': m.imp_newer_version,
  'not-an-archive': () => m.imp_not_an_archive({ appName: m.app_name() }),
  corrupt: m.imp_corrupt,
  failed: m.imp_failed
};

/* Same privacy shape as the scheduled-backup failure notification
   (AutoExportPlugin.notifyFailure): what went wrong with the file, never
   the journal or the folder it came from. */
const VERIFY_MESSAGE: Record<RestoreFailureKind, () => string> = {
  ...GUARD_MESSAGE,
  'wrong-password': m.verify_wrong_password,
  'newer-version': m.verify_newer_version,
  'not-an-archive': () => m.verify_not_an_archive({ appName: m.app_name() }),
  corrupt: m.verify_corrupt,
  failed: m.verify_failed
};

export const importFailureMessage = (kind: RestoreFailureKind): string => IMPORT_MESSAGE[kind]();

export const verifyFailureMessage = (kind: RestoreFailureKind): string => VERIFY_MESSAGE[kind]();

/* An export that failed because storage ran out says which storage, since the
   fix differs: space on this device for the staging copy, or space at the
   place picked in the save dialog (last-audit ui 37). Anything else keeps
   the general sentence, so a refusal that is not a full disk is never
   called one. */
const EXPORT_MESSAGE: Record<SpaceShortage | 'other', () => string> = {
  device: m.exp_storage_full,
  destination: m.exp_destination_full,
  other: m.exp_failed
};

export const exportFailureMessage = (error: unknown): string => EXPORT_MESSAGE[spaceShortage(error) ?? 'other']();
