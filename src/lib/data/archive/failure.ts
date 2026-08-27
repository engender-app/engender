/* Which of the four ways an archive can refuse to open this was.

   Pure `instanceof` branching over the errors the container, the codec
   and the crypto throw, so it belongs below the wording rather than
   inside the screen that prints it (ADR-0016, ADR-0031). It was fifteen
   lines in settings/export/+page.svelte, written twice - once for import
   and once for the verify drill - and the only thing exercising it was
   the walkthrough driving a real file picker in Chromium.

   The kinds are also a walkthrough handle: the screen stamps the kind on
   its notice as `data-import-error`, so the suite can tell one failure
   from another without matching on the wording. That is why they are
   stable strings and not an enum of convenience. */

import { DecryptionFailedError } from '../../crypto/aesGcm';
import { UnsupportedArchiveError } from './container';
import { CorruptArchiveError } from './wire';

export type ArchiveFailureKind = 'wrong-password' | 'newer-version' | 'not-an-archive' | 'corrupt' | 'failed';

/** `failed` is the honest answer for everything that is not one of the
    four: a full disk, a handle the picker lost, a bug. There is nothing
    specific to say about those, so the screen says nothing specific. */
export function archiveFailureKind(error: unknown): ArchiveFailureKind {
  if (error instanceof DecryptionFailedError) return 'wrong-password';
  if (error instanceof UnsupportedArchiveError) return error.kind;
  if (error instanceof CorruptArchiveError) return 'corrupt';
  return 'failed';
}
