/* The sentence a person reads when an archive will not open, keyed by
   what went wrong (archive/failure.ts). Here rather than beside the
   classifier for the reason its neighbours give: the wording speaks
   paraglide and nothing the Node tier touches may import that
   (ADR-0016). The kinds and the branching are down there; this is where
   they get their words.

   One whole catalogued sentence per kind, never the error's own message:
   the archive errors carry English diagnostics for the console, and a
   Polish reader must not get one of those spliced into a Polish
   paragraph (docs/ui-copy.md).

   Two full records rather than one, because import and the verify drill
   say different things about the same failure - the drill only reads a
   file and has nothing to report about the journal. A record over the
   kind means adding a kind is a typecheck failure in both, rather than a
   silent fall through to "something went wrong". */

import { m } from '$lib/paraglide/messages';
import type { ArchiveFailureKind } from '$lib/data/archive/failure';

const IMPORT_MESSAGE: Record<ArchiveFailureKind, () => string> = {
  'wrong-password': m.imp_wrong_password,
  'newer-version': m.imp_newer_version,
  'not-an-archive': m.imp_not_an_archive,
  corrupt: m.imp_corrupt,
  failed: m.imp_failed
};

/* Same privacy shape as the scheduled-backup failure notification
   (AutoExportPlugin.notifyFailure): what went wrong with the file, never
   the journal or the folder it came from. */
const VERIFY_MESSAGE: Record<ArchiveFailureKind, () => string> = {
  'wrong-password': m.verify_wrong_password,
  'newer-version': m.verify_newer_version,
  'not-an-archive': m.verify_not_an_archive,
  corrupt: m.verify_corrupt,
  failed: m.verify_failed
};

export const importFailureMessage = (kind: ArchiveFailureKind): string => IMPORT_MESSAGE[kind]();

export const verifyFailureMessage = (kind: ArchiveFailureKind): string => VERIFY_MESSAGE[kind]();
